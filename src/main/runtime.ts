import { execFile } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { app, BrowserWindow, globalShortcut, ipcMain, nativeTheme } from "electron";
import { DEFAULT_TTL_S, grantsDbPath, HISTORY_DIR, homeDir, KNOWN_GAPS, leashDir, POPUP_TIMEOUT_S, socketPath, TCC_CLIENTS } from "../shared/constants";
import { decisionDurations, deleteGrant, deleteGrants, getSetting, insertGrant, listDecisions, listGrants, openGrantsDb, setSetting } from "../shared/db";
import { listHistory, openHistoryDb } from "../helper/historyDb";
import type { Access, AgentId, AgentSnapshot, HistoryRow, ThemeSource } from "../shared/types";
import { loadClaude } from "./agents/claude";
import { cursorWatchPaths, cursorWorkers, loadCursor } from "./agents/cursor";
import { mirrorConfigGrants } from "./agents/mirror";
import { loadCodex, loadGemini, loadT3 } from "./agents/others";
import { Broker } from "./broker";
import { claudeHooksInstalled, cursorHooksInstalled, mergeClaudeHooks, mergeCursorHooks, removeClaudeHooks, removeCursorHooks } from "./hookInstall";
import { readJson } from "./agents/fs";
import { writeWithBackup } from "./backup";
import { publishClaudeRules } from "./rulesMode";
import { guiQuitScript, parsePs, percentiles, restartTargets } from "./system";
import { readUiState, writeUiState } from "./uiState";
import { readTcc } from "./tcc";

const exec = promisify(execFile);
let restartNeeded = false;

function claudeRoot(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homeDir(), ".claude");
}

function hookScript(): string {
  return app.isPackaged ? join(process.resourcesPath, "app.asar.unpacked/out/main/leash-hook.js") : join(app.getAppPath(), "out/main/leash-hook.js");
}

function hookCommand(kind: "claude" | "cursor"): string {
  return `ELECTRON_RUN_AS_NODE=1 "${process.execPath}" "${hookScript()}" ${kind}`;
}

async function ensureSweepAgent(): Promise<void> {
  const script = hookScript();
  if (!existsSync(script)) return;
  const { installSweepAgent, sweepServiceTarget } = await import("./helperInstall");
  const plist = installSweepAgent(process.execPath, script);
  const uid = process.getuid?.();
  if (uid === undefined) return;
  await exec("/bin/launchctl", ["bootout", sweepServiceTarget(uid)]).catch(() => undefined);
  await exec("/bin/launchctl", ["bootstrap", `gui/${uid}`, plist]).catch(() => undefined);
}

async function psLines(): Promise<string[]> {
  try {
    const { stdout } = await exec("/bin/ps", ["-axo", "pid,ppid,args"]);
    return stdout.split("\n");
  } catch {
    return [];
  }
}

export function startRuntime(options: { userData: string; openApproval: () => void; setPending: (count: number) => void; notify: (title: string, body: string) => void }): { revokeAll: () => Promise<void> } {
  const db = openGrantsDb(grantsDbPath());
  const home = homeDir();
  let snapshots: AgentSnapshot[] = [];
  let history: HistoryRow[] = [];
  let historySeen = readUiState(options.userData).historySeen ?? 0;
  const timeouts = new Map<string, NodeJS.Timeout>();

  const broker = new Broker((pending) => {
    options.setPending(pending.length);
    if (pending.length) options.openApproval();
    for (const item of pending) {
      if (timeouts.has(item.id)) continue;
      timeouts.set(item.id, setTimeout(() => broker.decide(item.id, { decision: "timeout" }), POPUP_TIMEOUT_S * 1000));
    }
  });
  try {
    broker.listen(socketPath());
  } catch {
    /* socket stays down; hooks fall back */
  }

  const scan = async () => {
    const workers = cursorWorkers(await psLines());
    snapshots = [
      loadClaude(claudeRoot(), join(home, ".claude.json")),
      loadCursor(join(home, ".cursor"), join(homedir(), "Library/Application Support/Cursor/User/globalStorage/state.vscdb"), workers),
      loadT3(join(home, ".t3/userdata/settings.json")),
      loadCodex(join(home, ".codex/config.toml")),
      loadGemini(join(home, ".gemini")),
    ];
    const privacy = readTcc(join(homedir(), "Library/Application Support/com.apple.TCC/TCC.db"));
    for (const snapshot of snapshots) {
      const bundles = new Set(TCC_CLIENTS.filter((client) => client.agent === snapshot.id).map((client) => client.bundleId));
      snapshot.privacy = privacy.filter((row) => bundles.has(row.bundleId));
    }
    mirrorConfigGrants(db, snapshots, home, Date.now());
    const claude = snapshots.find((snapshot) => snapshot.id === "claude-code");
    publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, claude?.enforcement === "rules");
  };

  void scan().catch((error) => console.error(error));

  let timer: NodeJS.Timeout | null = null;
  const rescan = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void scan().catch((error) => console.error(error)), 300);
  };
  for (const path of [claudeRoot(), join(home, ".claude.json"), ...cursorWatchPaths(join(home, ".cursor"), join(homedir(), "Library/Application Support/Cursor/User/globalStorage/state.vscdb")), join(home, ".t3/userdata/settings.json")]) {
    try {
      watch(path, rescan);
    } catch {
      /* missing config files are normal */
    }
  }

  const pollHistory = () => {
    try {
      const historyDb = openHistoryDb(join(process.env.AGENTIC_LEASH_HISTORY_DIR || HISTORY_DIR, "history.db"), true);
      const rows = listHistory(historyDb, 0, 300);
      historyDb.close();
      history = rows;
      for (const row of rows) {
        if (row.sensitive && row.id > historySeen) options.notify("Sensitive path", `${row.agent} touched ${row.path}`);
      }
      const max = rows.reduce((id, row) => Math.max(id, row.id), historySeen);
      if (max !== historySeen) {
        historySeen = max;
        writeUiState(options.userData, { ...readUiState(options.userData), historySeen });
      }
    } catch {
      history = [];
    }
  };
  pollHistory();
  setInterval(pollHistory, 500);

  const allow = (paths: string[], agent: AgentId | "*", access: Access, ttlSeconds: number | null) => {
    const expiresAt = ttlSeconds === null ? null : Date.now() + ttlSeconds * 1000;
    for (const path of paths) {
      const root = path.split("/").pop()?.includes(".") ? dirname(path) : path;
      insertGrant(db, { agent, path: root, access, source: "leash", createdAt: Date.now(), expiresAt });
    }
    const claude = snapshots.find((snapshot) => snapshot.id === "claude-code");
    publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, claude?.enforcement === "rules");
  };

  const revokeAll = async () => {
    deleteGrants(db, "source = ?", "leash");
    setSetting(db, "lockdown", "1");
    publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, snapshots.find((snapshot) => snapshot.id === "claude-code")?.enforcement === "rules");
  };

  ipcMain.handle("agents:list", () => snapshots);
  ipcMain.handle("grants:list", () => listGrants(db));
  ipcMain.handle("grants:revoke", (_event, id: number) => deleteGrant(db, id));
  ipcMain.handle("grants:revoke-all", () => revokeAll());
  ipcMain.handle("grants:create", (_event, input: { agent: AgentId | "*"; path: string; access: Access; ttlSeconds: number | null }) => {
    allow([input.path], input.agent, input.access, input.ttlSeconds);
  });
  ipcMain.handle("grants:unlock", () => setSetting(db, "lockdown", "0"));
  ipcMain.handle("decisions:list", () => listDecisions(db));
  ipcMain.handle("history:list", () => history);
  ipcMain.handle("approval:list", () => broker.list());
  ipcMain.handle("approval:decide", (_event, id: string, decision: "allow" | "deny", ttlSeconds: number | null) => {
    const pending = broker.list().find((item) => item.id === id);
    const timeout = timeouts.get(id);
    if (timeout) clearTimeout(timeout);
    if (decision === "allow" && pending) allow(pending.request.paths, pending.request.agent, pending.request.access, ttlSeconds === undefined ? DEFAULT_TTL_S : ttlSeconds);
    broker.decide(id, { decision, ttlSeconds: ttlSeconds ?? undefined });
  });
  ipcMain.handle("runtime:restart-needed", () => restartNeeded);
  ipcMain.handle("runtime:restart", async () => {
    const { stdout } = await exec("/bin/ps", ["-axo", "pid,ppid,args"]);
    for (const target of restartTargets(parsePs(stdout))) {
      if (target.kind === "gui" && target.bundleId) await exec("/usr/bin/osascript", ["-e", guiQuitScript(target.bundleId)]);
      else process.kill(target.pid, "SIGTERM");
    }
    restartNeeded = false;
  });
  ipcMain.handle("hooks:status", () => {
    const cursorFile = readJson(join(home, ".cursor/hooks.json"));
    const claudeFile = readJson(join(claudeRoot(), "settings.json"));
    return cursorHooksInstalled(cursorFile, hookCommand("cursor")) && claudeHooksInstalled(claudeFile, hookCommand("claude"));
  });
  ipcMain.handle("hooks:install", () => {
    const cursorPath = join(home, ".cursor/hooks.json");
    const claudePath = join(claudeRoot(), "settings.json");
    writeWithBackup(cursorPath, `${JSON.stringify(mergeCursorHooks(readJson(cursorPath), hookCommand("cursor")), null, 2)}\n`);
    writeWithBackup(claudePath, `${JSON.stringify(mergeClaudeHooks(readJson(claudePath), hookCommand("claude")), null, 2)}\n`);
    restartNeeded = true;
    return true;
  });
  ipcMain.handle("hooks:uninstall", () => {
    const cursorPath = join(home, ".cursor/hooks.json");
    const claudePath = join(claudeRoot(), "settings.json");
    writeWithBackup(cursorPath, `${JSON.stringify(removeCursorHooks(readJson(cursorPath)), null, 2)}\n`);
    writeWithBackup(claudePath, `${JSON.stringify(removeClaudeHooks(readJson(claudePath)), null, 2)}\n`);
    restartNeeded = true;
  });
  ipcMain.handle("diagnostics:get", async () => {
    const stats = percentiles(decisionDurations(db));
    let helperStatus = "not installed";
    try {
      const { stdout } = await exec("/bin/launchctl", ["print", "system/com.agenticleash.helper"]);
      helperStatus = stdout.includes("state = running") ? "running" : stdout.split("\n")[0] || "installed";
    } catch {
      helperStatus = "not installed";
    }
    const installed = cursorHooksInstalled(readJson(join(home, ".cursor/hooks.json")), hookCommand("cursor")) && claudeHooksInstalled(readJson(join(claudeRoot(), "settings.json")), hookCommand("claude"));
    return { hookP50Ms: stats.p50, hookP95Ms: stats.p95, helperStatus, lastSweep: getSetting(db, "last_sweep", "") || null, hooksInstalled: installed, gaps: KNOWN_GAPS };
  });
  ipcMain.handle("theme:get", () => readUiState(options.userData).theme ?? "system");
  ipcMain.handle("theme:set", (_event, theme: ThemeSource) => {
    writeUiState(options.userData, { ...readUiState(options.userData), theme });
    nativeTheme.themeSource = theme;
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("theme:changed", theme);
    return theme;
  });
  ipcMain.handle("tcc:reset", async (_event, service: string, bundleId: string) => {
    await exec("/usr/bin/tccutil", ["reset", service, bundleId]);
    scan();
  });
  ipcMain.handle("agents:remove-mcp", (_event, file: string, name: string) => {
    const path = file.startsWith("~") ? join(home, file.slice(1)) : file;
    const json = readJson(path) as { mcpServers?: Record<string, unknown> };
    if (json.mcpServers) delete json.mcpServers[name];
    writeWithBackup(path, `${JSON.stringify(json, null, 2)}\n`);
    restartNeeded = true;
    rescan();
  });
  ipcMain.handle("onboarding:get", () => Boolean(readUiState(options.userData).onboarded));
  ipcMain.handle("onboarding:set", (_event, done: boolean) => {
    writeUiState(options.userData, { ...readUiState(options.userData), onboarded: done });
  });
  ipcMain.handle("helper:install", async () => {
    const { helperInstallScript } = await import("./helperInstall");
    await exec("/usr/bin/osascript", ["-e", helperInstallScript(process.execPath, hookScript().replace("leash-hook.js", "leash-helper.js"))]);
  });

  try {
    globalShortcut.register("Control+Alt+Command+L", () => void revokeAll());
  } catch {
    /* shortcut already owned */
  }
  void ensureSweepAgent();
  nativeTheme.themeSource = readUiState(options.userData).theme ?? "system";
  return { revokeAll };
}

export function leashDataDir(): string {
  return leashDir();
}

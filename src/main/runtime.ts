import { execFile } from "node:child_process";
import { existsSync, mkdirSync, watch } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { app, BrowserWindow, globalShortcut, ipcMain, nativeTheme } from "electron";
import { DEFAULT_TTL_S, grantsDbPath, HISTORY_DIR, homeDir, isClaudeBinary, IS_MAC, leashDir, POPUP_TIMEOUT_S, protectedRoots, socketPath, TCC_CLIENTS } from "../shared/constants";
import { diagnosticsReport } from "../shared/diagnostics";
import { cancelScheduled, collapseGrantDupes, decisionDurations, deleteGrant, deleteGrants, getSetting, listDecisions, listGrants, listScheduled, openGrantsDb, scheduleRevoke, setSetting, upsertGrant } from "../shared/db";
import { historyText, listHistory, openHistoryDb, queryHistory, type HistoryFilter } from "../helper/historyDb";
import type { Access, AgentId, AgentSnapshot, HistoryRow, ThemeSource } from "../shared/types";
import { loadClaude } from "./agents/claude";
import { cursorWatchPaths, cursorWorkers, loadCursor } from "./agents/cursor";
import { mirrorConfigGrants } from "./agents/mirror";
import { loadCodex, loadGemini, loadT3 } from "./agents/others";
import { Broker } from "./broker";
import { claudeHooksInstalled, codexHooksInstalled, cursorHooksInstalled, geminiHooksInstalled, mergeClaudeHooks, mergeCodexHooks, mergeCursorHooks, mergeGeminiHooks, removeClaudeHooks, removeCodexHooks, removeCursorHooks, removeGeminiHooks } from "./hookInstall";
import { readJson } from "./agents/fs";
import { writeWithBackup } from "./backup";
import { applyDueClaudeTrust, revokeClaudeTrust } from "./claudeTrust";
import { revokeStoredGrant } from "./revokeConfig";
import { AUTO_ALLOWS, parseAutoAllowOff } from "../shared/autoAllow";
import { MAIN_RETENTION_DAYS, NOISE_RETENTION_DAYS, parseRetentionDays, retentionDays } from "../shared/retention";
import { coveredPending } from "../hook/decide";
import { parentFolders } from "../shared/parents";
import { publishClaudeRules } from "./rulesMode";
import { guiQuitScript, parsePs, percentiles, restartTargets } from "./system";
import { readUiState, writeUiState } from "./uiState";
import { FULL_DISK_URL, hasFullDiskAccess } from "./fullDisk";
import { macAppPresent, setupReady, type HelperState, type SetupAgent, type SetupStatus } from "../shared/setup";
import { readTcc } from "./tcc";

const exec = promisify(execFile);
const pendingRestart = new Set<AgentId>();

function claudeRoot(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homeDir(), ".claude");
}

type HookAgent = "claude-code" | "cursor" | "codex" | "gemini";

function hookPath(agent: HookAgent, home: string): string {
  if (agent === "cursor") return join(home, ".cursor/hooks.json");
  if (agent === "codex") return join(home, ".codex/hooks.json");
  if (agent === "gemini") return join(home, ".gemini/settings.json");
  return join(claudeRoot(), "settings.json");
}

function writeHookFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeWithBackup(path, `${JSON.stringify(value, null, 2)}\n`);
}

function hookScript(): string {
  return app.isPackaged ? join(process.resourcesPath, "app.asar.unpacked/out/main/leash-hook.js") : join(app.getAppPath(), "out/main/leash-hook.js");
}

function hookCommand(kind: "claude" | "cursor" | "codex" | "gemini"): string {
  return `ELECTRON_RUN_AS_NODE=1 "${process.execPath}" "${hookScript()}" ${kind}`;
}

async function ensureSweepAgent(): Promise<void> {
  const script = hookScript();
  if (!IS_MAC || !existsSync(script)) return;
  const { installSweepAgent, sweepServiceTarget } = await import("./helperInstall");
  const plist = installSweepAgent(process.execPath, script);
  const uid = process.getuid?.();
  if (uid === undefined) return;
  await exec("/bin/launchctl", ["bootout", sweepServiceTarget(uid)]).catch(() => undefined);
  await exec("/bin/launchctl", ["bootstrap", `gui/${uid}`, plist]).catch(() => undefined);
}

async function psText(): Promise<string> {
  if (process.platform === "win32") return "";
  try {
    return (await exec("ps", ["-axo", "pid,ppid,args"])).stdout;
  } catch {
    return "";
  }
}

async function psLines(): Promise<string[]> {
  return (await psText()).split("\n");
}

const cursorStateDb = () => join(app.getPath("appData"), "Cursor/User/globalStorage/state.vscdb");

export function startRuntime(options: { userData: string; openApproval: () => void; closeApproval: () => void; setPending: (count: number) => void; notify: (title: string, body: string) => void }): { revokeAll: () => { revoked: number } } {
  const db = openGrantsDb(grantsDbPath());
  collapseGrantDupes(db);
  const home = homeDir();
  let snapshots: AgentSnapshot[] = [];
  let history: HistoryRow[] = [];
  let historySeen = readUiState(options.userData).historySeen ?? 0;
  const timeouts = new Map<string, NodeJS.Timeout>();

  const broker = new Broker((pending) => {
    options.setPending(pending.length);
    if (pending.length) options.openApproval();
    else options.closeApproval();
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
      loadCursor(join(home, ".cursor"), cursorStateDb(), workers),
      loadT3(join(home, ".t3/userdata/settings.json")),
      loadCodex(join(home, ".codex/config.toml")),
      loadGemini(join(home, ".gemini")),
    ];
    for (const [id, appName] of [["claude-code", "Claude"], ["cursor", "Cursor"]] as const) {
      const snapshot = snapshots.find((item) => item.id === id);
      if (snapshot && macAppPresent(appName, home, existsSync)) snapshot.installed = true;
    }
    const privacy = IS_MAC ? readTcc(join(homedir(), "Library/Application Support/com.apple.TCC/TCC.db")) : [];
    for (const snapshot of snapshots) {
      const bundles = new Set(TCC_CLIENTS.filter((client) => client.agent === snapshot.id).map((client) => client.bundleId));
      snapshot.privacy = privacy.filter((row) => bundles.has(row.bundleId) || (snapshot.id === "claude-code" && isClaudeBinary(row.client)));
    }
    mirrorConfigGrants(db, snapshots, home, Date.now());
    const claude = snapshots.find((snapshot) => snapshot.id === "claude-code");
    publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, claude?.enforcement === "rules");
  };

  const claudeJson = () => join(home, ".claude.json");
  void scan().catch((error) => console.error(error));

  let timer: NodeJS.Timeout | null = null;
  const rescan = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void scan().catch((error) => console.error(error)), 300);
  };
  for (const path of [claudeRoot(), join(home, ".claude.json"), ...cursorWatchPaths(join(home, ".cursor"), cursorStateDb()), join(home, ".t3/userdata/settings.json")]) {
    try {
      watch(path, rescan);
    } catch {
      /* missing config files are normal */
    }
  }
  setInterval(() => {
    if (applyDueClaudeTrust(db, claudeJson(), Date.now()).length) rescan();
  }, 30_000);

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

  const allow = (paths: string[], agent: AgentId | "*", access: Access, ttlSeconds: number | null, exact = false) => {
    const expiresAt = ttlSeconds === null ? null : Date.now() + ttlSeconds * 1000;
    for (const path of paths) {
      const root = exact || !path.split("/").pop()?.includes(".") ? path : dirname(path);
      if (root === "/" || root === "/Users") continue;
      upsertGrant(db, { agent, path: root, access, source: "leash", createdAt: Date.now(), expiresAt });
    }
    const claude = snapshots.find((snapshot) => snapshot.id === "claude-code");
    publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, claude?.enforcement === "rules");
  };

  const withHistory = <T,>(read: (historyDb: ReturnType<typeof openHistoryDb>) => T): T => {
    const historyDb = openHistoryDb(join(process.env.AGENTIC_LEASH_HISTORY_DIR || HISTORY_DIR, "history.db"), true);
    try {
      return read(historyDb);
    } finally {
      historyDb.close();
    }
  };
  const revokeAll = () => {
    const grants = listGrants(db);
    for (const grant of grants) revokeStoredGrant(home, grant);
    deleteGrants(db, "source = ? OR source = ?", "leash", "config");
    setSetting(db, "lockdown", "1");
    publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, snapshots.find((snapshot) => snapshot.id === "claude-code")?.enforcement === "rules");
    rescan();
    return { revoked: grants.length };
  };

  ipcMain.handle("agents:list", () => snapshots);
  ipcMain.handle("grants:list", () => listGrants(db));
  ipcMain.handle("grants:status", () => ({ count: listGrants(db).length, lockdown: getSetting(db, "lockdown", "0") === "1" }));
  ipcMain.handle("grants:revoke", (_event, id: number) => {
    const grant = listGrants(db).find((item) => item.id === id);
    if (grant) revokeStoredGrant(home, grant);
    deleteGrant(db, id);
    rescan();
  });
  ipcMain.handle("grants:revoke-all", () => revokeAll());
  ipcMain.handle("grants:create", (_event, input: { agent: AgentId | "*"; path: string; access: Access; ttlSeconds: number | null }) => {
    allow([input.path], input.agent, input.access, input.ttlSeconds);
  });
  ipcMain.handle("grants:unlock", () => setSetting(db, "lockdown", "0"));
  const autoAllowRows = () => {
    const off = new Set(parseAutoAllowOff(getSetting(db, "auto_allow_off", "[]")));
    return AUTO_ALLOWS.map((rule) => ({ ...rule, enabled: !off.has(rule.id) }));
  };
  ipcMain.handle("auto-allow:list", () => autoAllowRows());
  ipcMain.handle("auto-allow:set", (_event, id: string, enabled: boolean) => {
    if (!AUTO_ALLOWS.some((rule) => rule.id === id) || typeof enabled !== "boolean") return autoAllowRows();
    const off = new Set(parseAutoAllowOff(getSetting(db, "auto_allow_off", "[]")));
    if (enabled) off.delete(id);
    else off.add(id);
    setSetting(db, "auto_allow_off", JSON.stringify([...off]));
    return autoAllowRows();
  });
  ipcMain.handle("decisions:list", () => listDecisions(db));
  ipcMain.handle("history:list", () => history);
  ipcMain.handle("history:query", (_event, filter: HistoryFilter) => withHistory((historyDb) => queryHistory(historyDb, filter)));
  const retentionState = () => ({
    main: retentionDays(getSetting(db, "history_days", ""), MAIN_RETENTION_DAYS),
    noise: retentionDays(getSetting(db, "noise_days", ""), NOISE_RETENTION_DAYS),
  });
  ipcMain.handle("history:retention:get", () => retentionState());
  ipcMain.handle("history:retention:set", (_event, which: "main" | "noise", days: number) => {
    const parsed = which === "main" || which === "noise" ? parseRetentionDays(String(days)) : null;
    if (parsed === null) return retentionState();
    setSetting(db, which === "main" ? "history_days" : "noise_days", String(parsed));
    return retentionState();
  });
  ipcMain.handle("history:text", (_event, id: number) => withHistory((historyDb) => historyText(historyDb, id)));
  ipcMain.handle("approval:list", () => broker.list());
  ipcMain.handle("approval:close", () => options.closeApproval());
  const releaseCovered = () => {
    const options = {
      now: Date.now(),
      lockdown: getSetting(db, "lockdown", "0") === "1",
      protectedRoots: protectedRoots(home),
      home,
      autoAllowOff: parseAutoAllowOff(getSetting(db, "auto_allow_off", "[]")),
    };
    for (const coveredId of coveredPending(broker.list(), listGrants(db), options)) {
      const timeout = timeouts.get(coveredId);
      if (timeout) clearTimeout(timeout);
      timeouts.delete(coveredId);
      broker.decide(coveredId, { decision: "allow" });
    }
  };
  ipcMain.handle("approval:decide", (_event, id: string, decision: "allow" | "deny", ttlSeconds: number | null, scopePath?: string) => {
    const pending = broker.list().find((item) => item.id === id);
    const timeout = timeouts.get(id);
    if (timeout) clearTimeout(timeout);
    if (decision === "allow" && pending) {
      const scope = typeof scopePath === "string" && parentFolders(pending.request.paths).includes(scopePath) ? scopePath : undefined;
      allow(scope ? [scope] : pending.request.paths, pending.request.agent, pending.request.access, ttlSeconds === undefined ? DEFAULT_TTL_S : ttlSeconds, Boolean(scope));
    }
    broker.decide(id, { decision, ttlSeconds: ttlSeconds ?? undefined });
    if (decision === "allow") releaseCovered();
  });
  // Agents that aren't running read the new config on their next start, so they drop out here.
  const staleTargets = async () => {
    if (!pendingRestart.size) return [];
    const targets = restartTargets(parsePs(await psText())).filter((target) => pendingRestart.has(target.agent));
    for (const agent of pendingRestart) if (!targets.some((target) => target.agent === agent)) pendingRestart.delete(agent);
    return targets;
  };
  ipcMain.handle("runtime:restart-needed", async () => {
    const targets = await staleTargets();
    const byName = new Map<string, { name: string; kind: "gui" | "cli"; count: number }>();
    for (const target of targets) {
      const entry = byName.get(target.name) ?? { name: target.name, kind: target.kind, count: 0 };
      entry.count += 1;
      byName.set(target.name, entry);
    }
    return [...byName.values()];
  });
  ipcMain.handle("runtime:restart", async () => {
    const targets = await staleTargets();
    const quit = new Set<string>();
    for (const target of targets) {
      try {
        if (IS_MAC && target.kind === "gui" && target.bundleId) {
          if (!quit.has(target.bundleId)) await exec("/usr/bin/osascript", ["-e", guiQuitScript(target.bundleId)]);
          quit.add(target.bundleId);
        } else process.kill(target.pid, "SIGTERM");
      } catch {
        /* already exited, or the app refused to quit */
      }
    }
    pendingRestart.clear();
  });
  ipcMain.handle("runtime:dismiss-restart", () => pendingRestart.clear());
  const agentInstalled = (id: AgentId): boolean => {
    if (id === "claude-code") return existsSync(claudeRoot()) || macAppPresent("Claude", home, existsSync);
    if (id === "cursor") return existsSync(join(home, ".cursor")) || macAppPresent("Cursor", home, existsSync);
    if (id === "codex") return existsSync(join(home, ".codex/config.toml"));
    if (id === "gemini") return existsSync(join(home, ".gemini/settings.json")) || existsSync(join(home, ".gemini/trustedFolders.json"));
    return false;
  };
  const hookRows = (): SetupAgent[] => {
    const disabled = new Set(readUiState(options.userData).disabledAgents ?? []);
    const hooks: Record<string, boolean | null> = {
      "claude-code": claudeHooksInstalled(readJson(hookPath("claude-code", home)), hookCommand("claude")),
      cursor: cursorHooksInstalled(readJson(hookPath("cursor", home)), hookCommand("cursor")),
      codex: codexHooksInstalled(readJson(hookPath("codex", home)), hookCommand("codex")),
      gemini: geminiHooksInstalled(readJson(hookPath("gemini", home)), hookCommand("gemini")),
    };
    return (["claude-code", "cursor", "codex", "gemini"] as const).map((id) => ({
      id,
      installed: agentInstalled(id),
      enabled: !disabled.has(id),
      hooks: hooks[id] ?? null,
    }));
  };
  const helperState = async (): Promise<HelperState> => {
    if (!app.isPackaged) return "skipped";
    if (!IS_MAC) return "stopped";
    try {
      const { stdout } = await exec("/bin/launchctl", ["print", "system/com.agenticleash.helper"]);
      return stdout.includes("state = running") ? "running" : "stopped";
    } catch {
      return "stopped";
    }
  };
  const currentSetup = async (): Promise<SetupStatus> => {
    if (process.env.AGENTIC_LEASH_SKIP_SETUP) return { helper: "skipped", fda: true, agents: hookRows(), ready: true };
    const helper = await helperState();
    const fda = !IS_MAC || hasFullDiskAccess(join(homedir(), "Library/Application Support/com.apple.TCC/TCC.db"));
    const agents = hookRows();
    return { helper, fda, agents, ready: setupReady({ helper, fda, agents }) };
  };
  const installAgent = (agent: HookAgent) => {
    const path = hookPath(agent, home);
    const kind = agent === "claude-code" ? "claude" : agent;
    const command = hookCommand(kind);
    const existing = readJson(path);
    const next = agent === "cursor" ? mergeCursorHooks(existing, command) : agent === "codex" ? mergeCodexHooks(existing, command) : agent === "gemini" ? mergeGeminiHooks(existing, command) : mergeClaudeHooks(existing, command);
    writeHookFile(path, next);
    pendingRestart.add(agent);
  };
  const uninstallAgent = (agent: HookAgent) => {
    const path = hookPath(agent, home);
    if (!existsSync(path)) return;
    const existing = readJson(path);
    const next = agent === "cursor" ? removeCursorHooks(existing) : agent === "codex" ? removeCodexHooks(existing) : agent === "gemini" ? removeGeminiHooks(existing) : removeClaudeHooks(existing);
    writeHookFile(path, next);
    pendingRestart.add(agent);
  };
  ipcMain.handle("hooks:status", () => hookRows().every((agent) => agent.hooks !== false));
  ipcMain.handle("hooks:install", (_event, agent: HookAgent) => {
    if (agent !== "claude-code" && agent !== "cursor" && agent !== "codex" && agent !== "gemini") return;
    installAgent(agent);
  });
  ipcMain.handle("hooks:uninstall", (_event, agent: HookAgent) => {
    if (agent !== "claude-code" && agent !== "cursor" && agent !== "codex" && agent !== "gemini") return;
    uninstallAgent(agent);
  });
  ipcMain.handle("setup:get", () => currentSetup());
  ipcMain.handle("agents:enabled", (_event, id: AgentId, enabled: boolean) => {
    const state = readUiState(options.userData);
    const disabled = new Set(state.disabledAgents ?? []);
    if (enabled) disabled.delete(id);
    else disabled.add(id);
    writeUiState(options.userData, { ...state, disabledAgents: [...disabled] });
    if (!enabled && (id === "claude-code" || id === "cursor" || id === "codex" || id === "gemini")) uninstallAgent(id);
  });
  ipcMain.handle("diagnostics:get", async () => {
    const stats = percentiles(decisionDurations(db));
    let helperStatus = IS_MAC ? "not installed" : "unsupported on this OS";
    if (IS_MAC) try {
      const { stdout } = await exec("/bin/launchctl", ["print", "system/com.agenticleash.helper"]);
      helperStatus = stdout.includes("state = running") ? "running" : stdout.split("\n")[0] || "installed";
    } catch {
      helperStatus = "not installed";
    }
    const last = listDecisions(db, 1)[0];
    return diagnosticsReport({
      claude: claudeHooksInstalled(readJson(join(claudeRoot(), "settings.json")), hookCommand("claude")),
      cursor: cursorHooksInstalled(readJson(join(home, ".cursor/hooks.json")), hookCommand("cursor")),
      codex: codexHooksInstalled(readJson(join(home, ".codex/hooks.json")), hookCommand("codex")),
      gemini: geminiHooksInstalled(readJson(join(home, ".gemini/settings.json")), hookCommand("gemini")),
      helperStatus,
      lastSweep: getSetting(db, "last_sweep", "") || null,
      hookP50Ms: stats.p50,
      hookP95Ms: stats.p95,
      lastDecision: last ? { ts: last.ts, agent: last.agent, tool: last.tool, verdict: last.verdict, reason: last.reason } : null,
    });
  });
  ipcMain.handle("theme:get", () => readUiState(options.userData).theme ?? "system");
  ipcMain.handle("theme:set", (_event, theme: ThemeSource) => {
    writeUiState(options.userData, { ...readUiState(options.userData), theme });
    nativeTheme.themeSource = theme;
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("theme:changed", theme);
    return theme;
  });
  ipcMain.handle("fda:status", () => IS_MAC && hasFullDiskAccess(join(homedir(), "Library/Application Support/com.apple.TCC/TCC.db")));
  ipcMain.handle("fda:open", () => (IS_MAC ? exec("/usr/bin/open", [FULL_DISK_URL]) : undefined));
  ipcMain.handle("tcc:reset", async (_event, service: string, bundleId: string) => {
    if (!IS_MAC) return;
    await exec("/usr/bin/tccutil", ["reset", service.replace(/^kTCCService/, ""), bundleId]);
    scan();
  });
  ipcMain.handle("trust:scheduled", () => listScheduled(db));
  ipcMain.handle("trust:revoke", (_event, path: string) => {
    revokeClaudeTrust(claudeJson(), path);
    cancelScheduled(db, path);
    rescan();
  });
  ipcMain.handle("trust:schedule", (_event, path: string, dueAt: number) => {
    if (typeof path !== "string" || !path.startsWith("/") || !Number.isFinite(dueAt) || dueAt <= Date.now()) return;
    scheduleRevoke(db, path, dueAt);
  });
  ipcMain.handle("trust:cancel", (_event, path: string) => cancelScheduled(db, path));
  ipcMain.handle("agents:remove-mcp", (_event, agent: AgentId, name: string) => {
    const files: Partial<Record<AgentId, string>> = { "claude-code": claudeJson(), cursor: join(home, ".cursor/mcp.json"), gemini: join(home, ".gemini/settings.json") };
    const path = files[agent];
    if (!path || typeof name !== "string") return;
    type Servers = { mcpServers?: Record<string, unknown> };
    const json = readJson(path) as Servers & { projects?: Record<string, Servers> };
    const scopes = [json, ...Object.values(json.projects ?? {})].filter((scope) => scope.mcpServers && name in scope.mcpServers);
    if (!scopes.length) return;
    for (const scope of scopes) delete scope.mcpServers![name];
    writeWithBackup(path, `${JSON.stringify(json, null, 2)}\n`);
    pendingRestart.add(agent);
    rescan();
  });
  ipcMain.handle("onboarding:get", () => Boolean(readUiState(options.userData).onboarded));
  ipcMain.handle("onboarding:set", (_event, done: boolean) => {
    writeUiState(options.userData, { ...readUiState(options.userData), onboarded: done });
  });
  ipcMain.handle("helper:install", async () => {
    if (!IS_MAC) throw new Error("The activity helper is macOS-only.");
    const { helperInstallScript } = await import("./helperInstall");
    await exec("/usr/bin/osascript", ["-e", helperInstallScript(process.execPath, hookScript().replace("leash-hook.js", "leash-helper.js"))]);
  });

  try {
    globalShortcut.register(IS_MAC ? "Control+Alt+Command+L" : "Control+Alt+Shift+L", () => void revokeAll());
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

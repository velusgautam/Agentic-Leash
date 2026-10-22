import { execFile } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statfsSync, statSync, watch, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { app, BrowserWindow, globalShortcut, ipcMain, nativeTheme } from "electron";
import { DEFAULT_TTL_S, grantsDbPath, HISTORY_DIR, homeDir, isClaudeBinary, IS_MAC, leashDir, POPUP_TIMEOUT_S, protectedRoots, socketPath, TCC_CLIENTS } from "../shared/constants";
import { diagnosticsReport } from "../shared/diagnostics";
import { cancelScheduled, collapseGrantDupes, createRule, decisionDurations, deleteGrant, deleteGrants, deleteRule, extendGrant, countBlocked, getSetting, listApprovals, listDecisions, listGrants, listRules, listScheduled, openGrantsDb, recordApproval, scheduleRevoke, setSetting, updateRule, upsertCommandGrant, upsertGrant } from "../shared/db";
import { historyEvent, historyStorageBytes, historyText, listHistory, openHistoryDb, optimizeHistory, queryHistory, readHistoryStats, summarizeHistory, type HistoryFilter } from "../helper/historyDb";
import { purgeCommand } from "../helper/leash-helper";
import { checkRestore } from "../shared/restore";
import { parseApprovalStyle, type ApprovalStyle } from "../shared/approvalStyle";
import { suggestRules, SUGGEST_WINDOW_MS } from "../shared/suggestions";
import type { Access, AgentId, AgentSnapshot, HistoryRow, PendingRequest, ThemeSource } from "../shared/types";
import { loadClaude } from "./agents/claude";
import { cursorWatchPaths, cursorWorkers, loadCursor } from "./agents/cursor";
import { mirrorConfigGrants } from "./agents/mirror";
import { loadCodex, loadGemini, loadHermes, loadT3 } from "./agents/others";
import { Broker } from "./broker";
import { claudeHooksInstalled, codexHooksInstalled, cursorHooksInstalled, geminiHooksInstalled, mergeClaudeHooks, mergeCodexHooks, mergeCursorHooks, mergeGeminiHooks, removeClaudeHooks, removeCodexHooks, removeCursorHooks, removeGeminiHooks } from "./hookInstall";
import { readJson } from "./agents/fs";
import { hermesHooksInstalled, hermesScript, mergeHermesConfig, removeHermesConfig } from "./hermesHooks";
import { writeWithBackup } from "./backup";
import { applyDueClaudeTrust, revokeClaudeTrust } from "./claudeTrust";
import { revokeStoredGrant } from "./revokeConfig";
import { AUTO_ALLOWS, parseAutoAllowOff } from "../shared/autoAllow";
import { addIgnored, deleteIgnored, listIgnored, setIgnoredEnabled } from "../shared/ignored";
import { MAIN_RETENTION_DAYS, NOISE_RETENTION_DAYS, parseRetentionDays, retentionDays } from "../shared/retention";
import { CAP_DEFAULT_GB, CLEANUP_MODES, parseCapGb, rearmDismissed, storageWarning, type CleanupMode, type HistoryStats } from "../shared/storage";
import type { HistoryCleanupResult } from "../shared/bridge";
import { coveredPending } from "../hook/decide";
import { grantRoot, parentFolders } from "../shared/parents";
import { helperInstallScript, helperMaintenanceScript, helperUninstallScript, installSweepAgent, sweepServiceTarget } from "./helperInstall";
import { LOGIN_AGENT_LABEL } from "./loginItem";
import { publishClaudeRules } from "./rulesMode";
import { guiQuitScript, parsePs, percentiles, restartTargets } from "./system";
import { readUiState, writeUiState } from "./uiState";
import { removeLeftovers, uninstallLeftovers } from "./uninstall";
import { FULL_DISK_URL, hasFullDiskAccess } from "./fullDisk";
import { macAppPresent, rememberOnboarding, setupReady, type HelperState, type SetupAgent, type SetupStatus } from "../shared/setup";
import { readTcc } from "./tcc";
import { historySig } from "../shared/historySig";

const exec = promisify(execFile);
const pendingRestart = new Set<AgentId>();

function claudeRoot(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homeDir(), ".claude");
}

type HookAgent = "claude-code" | "cursor" | "codex" | "gemini" | "hermes";

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

function pathBytes(path: string): number {
  try {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat) return 0;
    return stat.isDirectory() ? readdirSync(path).reduce((total, name) => total + pathBytes(join(path, name)), 0) : stat.size;
  } catch {
    return 0;
  }
}

async function psLines(): Promise<string[]> {
  return (await psText()).split("\n");
}

const cursorStateDb = () => join(app.getPath("appData"), "Cursor/User/globalStorage/state.vscdb");

const broadcast = (channel: string, payload?: unknown) => {
  for (const window of BrowserWindow.getAllWindows()) if (!window.webContents.isDestroyed()) window.webContents.send(channel, payload);
};

export function startRuntime(options: { userData: string; openApproval: () => void; closeApproval: () => void; setPending: (count: number) => void; notify: (title: string, body: string) => void; finishUninstall: () => void; disableLoginItem: () => void; onStatus?: (status: { count: number; lockdown: boolean }) => void; notifyPending?: (item: PendingRequest, decide: (decision: "allow" | "deny") => void) => (() => void) | void }): { revokeAll: () => { revoked: number }; unlock: () => void } {
  const db = openGrantsDb(grantsDbPath());
  collapseGrantDupes(db);
  const home = homeDir();
  const historyPath = join(process.env.AGENTIC_LEASH_HISTORY_DIR || HISTORY_DIR, "history.db");
  let snapshots: AgentSnapshot[] = [];
  let history: HistoryRow[] = [];
  let historySeen = readUiState(options.userData).historySeen ?? 0;
  let historyPaused = false;
  let uninstalling = false;
  const timeouts = new Map<string, NodeJS.Timeout>();

  const notified = new Map<string, (() => void) | void>();
  const broker = new Broker((pending) => {
    options.setPending(pending.length);
    broadcast("pending:changed", pending);
    const notifyStyle = parseApprovalStyle(getSetting(db, "approval_style", "popup")) === "notification";
    if (!pending.length) options.closeApproval();
    else if (!notifyStyle) options.openApproval();
    for (const item of pending) {
      if (timeouts.has(item.id)) continue;
      timeouts.set(item.id, setTimeout(() => broker.decide(item.id, { decision: "timeout" }), POPUP_TIMEOUT_S * 1000));
    }
    for (const [id, cleanup] of notified) {
      if (pending.some((item) => item.id === id)) continue;
      notified.delete(id);
      cleanup?.();
    }
    for (const item of pending) {
      if (notified.has(item.id)) continue;
      if (!notifyStyle) {
        notified.set(item.id, undefined);
        continue;
      }
      notified.set(item.id, options.notifyPending?.(item, (decision) => decideApproval(item.id, decision, decision === "allow" ? 900 : null)));
    }
  });
  try {
    broker.listen(socketPath());
  } catch {
    /* socket stays down; hooks fall back */
  }

  const scan = async () => {
    if (uninstalling) return;
    const workers = cursorWorkers(await psLines());
    snapshots = [
      loadClaude(claudeRoot(), join(home, ".claude.json")),
      loadCursor(join(home, ".cursor"), cursorStateDb(), workers),
      loadT3(join(home, ".t3/userdata/settings.json")),
      loadCodex(join(home, ".codex/config.toml")),
      loadGemini(join(home, ".gemini")),
      loadHermes(join(home, ".hermes")),
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
    broadcast("agents:changed");
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
    if (uninstalling || historyPaused) return;
    try {
      const historyDb = openHistoryDb(historyPath, true);
      const rows = listHistory(historyDb, 0, 300);
      historyDb.close();
      const changed = historySig(rows) !== historySig(history);
      history = rows;
      if (changed) broadcast("history:changed", rows);
      for (const row of rows) {
        if (row.sensitive && row.id > historySeen) options.notify("Sensitive path", `${row.agent} touched ${row.path}`);
      }
      const max = rows.reduce((id, row) => Math.max(id, row.id), historySeen);
      if (max !== historySeen) {
        historySeen = max;
        writeUiState(options.userData, { ...readUiState(options.userData), historySeen });
      }
    } catch {
      if (history.length) broadcast("history:changed", []);
      history = [];
    }
  };
  pollHistory();
  setInterval(pollHistory, 500);

  const allow = (paths: string[], agent: AgentId | "*", access: Access, ttlSeconds: number | null, exact = false) => {
    const expiresAt = ttlSeconds === null ? null : Date.now() + ttlSeconds * 1000;
    const roots: string[] = [];
    for (const path of paths) {
      const root = grantRoot(path, exact, (item) => statSync(item, { throwIfNoEntry: false })?.isDirectory() ?? false);
      if (root) {
        upsertGrant(db, { agent, path: root, access, source: "leash", createdAt: Date.now(), expiresAt });
        roots.push(root);
      }
    }
    const claude = snapshots.find((snapshot) => snapshot.id === "claude-code");
    publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, claude?.enforcement === "rules");
    return roots;
  };

  const withHistory = <T,>(read: (historyDb: ReturnType<typeof openHistoryDb>) => T): T => {
    if (historyPaused) throw new Error("History is being optimized.");
    const historyDb = openHistoryDb(historyPath, true);
    try {
      return read(historyDb);
    } finally {
      historyDb.close();
    }
  };
  const grantStatus = () => ({ count: listGrants(db).length, lockdown: getSetting(db, "lockdown", "0") === "1" });
  const publishStatus = () => {
    const status = grantStatus();
    broadcast("grants:status-changed", status);
    options.onStatus?.(status);
  };
  const revokeAll = () => {
    const grants = listGrants(db);
    for (const grant of grants) revokeStoredGrant(home, grant);
    deleteGrants(db, "source = ? OR source = ?", "leash", "config");
    setSetting(db, "lockdown", "1");
    publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, snapshots.find((snapshot) => snapshot.id === "claude-code")?.enforcement === "rules");
    rescan();
    publishStatus();
    return { revoked: grants.length };
  };
  const unlock = () => {
    setSetting(db, "lockdown", "0");
    publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, snapshots.find((snapshot) => snapshot.id === "claude-code")?.enforcement === "rules");
    publishStatus();
  };

  ipcMain.handle("agents:list", () => snapshots);
  ipcMain.handle("grants:list", () => listGrants(db));
  ipcMain.handle("grants:status", () => grantStatus());
  ipcMain.handle("grants:revoke", (_event, id: number) => {
    const grant = listGrants(db).find((item) => item.id === id);
    if (grant) revokeStoredGrant(home, grant);
    deleteGrant(db, id);
    rescan();
    publishStatus();
  });
  ipcMain.handle("grants:revoke-all", () => revokeAll());
  ipcMain.handle("grants:create", (_event, input: { agent: AgentId | "*"; path: string; access: Access; ttlSeconds: number | null }) => {
    allow([input.path], input.agent, input.access, input.ttlSeconds, true);
    publishStatus();
  });
  ipcMain.handle("grants:extend", (_event, id: number, seconds: number) => {
    if (!Number.isInteger(id) || !Number.isFinite(seconds) || seconds <= 0) return { expiresAt: null };
    const expiresAt = extendGrant(db, id, seconds, Date.now());
    if (expiresAt !== null) {
      rescan();
      publishStatus();
    }
    return { expiresAt };
  });
  const dismissedSuggestions = (): string[] => {
    try {
      const parsed = JSON.parse(getSetting(db, "suggestions:dismissed", "[]"));
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  };
  const currentSuggestions = () => suggestRules(listApprovals(db, Date.now() - SUGGEST_WINDOW_MS), listGrants(db), dismissedSuggestions(), Date.now());
  ipcMain.handle("suggestions:list", () => currentSuggestions());
  ipcMain.handle("suggestions:accept", (_event, key: string) => {
    const item = currentSuggestions().find((suggestion) => suggestion.key === key);
    if (!item) return;
    if (item.command) upsertCommandGrant(db, { agent: item.agent, command: item.command, createdAt: Date.now(), expiresAt: null });
    else if (item.path) allow([item.path], item.agent as AgentId | "*", item.access, null, true);
    publishStatus();
  });
  ipcMain.handle("suggestions:dismiss", (_event, key: string) => {
    if (typeof key !== "string") return;
    setSetting(db, "suggestions:dismissed", JSON.stringify([...dismissedSuggestions().filter((item) => item !== key), key].slice(-200)));
    publishStatus();
  });
  ipcMain.handle("approval-style:get", () => parseApprovalStyle(getSetting(db, "approval_style", "popup")));
  ipcMain.handle("approval-style:set", (_event, style: ApprovalStyle) => setSetting(db, "approval_style", parseApprovalStyle(style)));
  ipcMain.handle("grants:unlock", () => unlock());
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
  const releaseCovered = () => {
    const options = {
      now: Date.now(),
      lockdown: getSetting(db, "lockdown", "0") === "1",
      protectedRoots: protectedRoots(home),
      home,
      autoAllowOff: parseAutoAllowOff(getSetting(db, "auto_allow_off", "[]")),
      rules: listRules(db),
    };
    for (const coveredId of coveredPending(broker.list(), listGrants(db), options)) {
      const timeout = timeouts.get(coveredId);
      if (timeout) clearTimeout(timeout);
      timeouts.delete(coveredId);
      broker.decide(coveredId, { decision: "allow" });
    }
  };
  ipcMain.handle("rules:list", () => listRules(db));
  ipcMain.handle("rules:create", (_event, input: { kind: unknown; agent: unknown; value: unknown }) => {
    const result = createRule(db, input, home, Date.now());
    if (!result.error) {
      publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, snapshots.find((snapshot) => snapshot.id === "claude-code")?.enforcement === "rules");
      releaseCovered();
    }
    return result;
  });
  ipcMain.handle("rules:update", (_event, id: number, input: { kind: unknown; agent: unknown; value: unknown }) => {
    const result = updateRule(db, id, input, home, Date.now());
    if (!result.error) {
      publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, snapshots.find((snapshot) => snapshot.id === "claude-code")?.enforcement === "rules");
      releaseCovered();
    }
    return result;
  });
  ipcMain.handle("rules:delete", (_event, id: number) => {
    const rules = deleteRule(db, id);
    publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, snapshots.find((snapshot) => snapshot.id === "claude-code")?.enforcement === "rules");
    releaseCovered();
    return rules;
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
  const capGb = () => parseCapGb(getSetting(db, "history_cap_gb", "")) ?? CAP_DEFAULT_GB;
  ipcMain.handle("history:cap:get", () => ({ gb: capGb() }));
  ipcMain.handle("history:cap:set", (_event, gb: number) => {
    const parsed = parseCapGb(String(gb));
    if (parsed !== null) setSetting(db, "history_cap_gb", String(parsed));
    return { gb: capGb() };
  });
  const historyStats = () => withHistory((historyDb) => readHistoryStats(historyDb));
  const storageInfo = () => {
    const historyDir = dirname(historyPath);
    const logPath = join(historyDir, "helper.log");
    const sizeBytes = historyStorageBytes(historyPath);
    const disk = existsSync(historyDir) ? statfsSync(historyDir) : null;
    let stats: HistoryStats | null = null;
    try {
      stats = existsSync(historyPath) ? historyStats() : null;
    } catch {
      stats = null;
    }
    return {
      stats,
      files: [
        { label: "History database", path: historyPath, bytes: sizeBytes },
        { label: "Helper log", path: logPath, bytes: pathBytes(logPath) + pathBytes(`${logPath}.1`) },
        { label: "Grants and settings", path: grantsDbPath(), bytes: historyStorageBytes(grantsDbPath()) },
        { label: "App data", path: options.userData, bytes: pathBytes(options.userData) },
      ],
      freeBytes: disk ? disk.bavail * disk.bsize : 0,
      requiredBytes: sizeBytes + 64 * 1024 * 1024,
    };
  };
  ipcMain.handle("history:storage:info", () => storageInfo());
  ipcMain.handle("history:warning:get", () => {
    try {
      const stats = historyStats();
      const state = readUiState(options.userData);
      const stored = state.storageWarningDismissed ?? 0;
      const dismissed = rearmDismissed(stats, stored);
      if (dismissed !== stored) writeUiState(options.userData, { ...state, storageWarningDismissed: dismissed });
      return { warning: storageWarning(stats, dismissed), capBytes: stats?.capBytes ?? 0 };
    } catch {
      return { warning: null, capBytes: 0 };
    }
  });
  ipcMain.handle("history:warning:dismiss", (_event, step: number) => {
    if (!Number.isInteger(step) || step >= 100) return;
    const state = readUiState(options.userData);
    writeUiState(options.userData, { ...state, storageWarningDismissed: Math.max(state.storageWarningDismissed ?? 0, step) });
  });
  let optimizingHistory = false;
  ipcMain.handle("history:purge:run", async (_event, mode: CleanupMode, days?: number) => {
    if (!CLEANUP_MODES.includes(mode)) throw new Error("Unknown history cleanup.");
    const keepDays = mode === "older" ? parseRetentionDays(String(days)) : null;
    if (mode === "older" && keepDays === null) throw new Error("Pick from 5 to 365 days.");
    if (optimizingHistory) throw new Error("History cleanup is already running.");
    const info = storageInfo();
    if (!existsSync(historyPath)) throw new Error("There is no history database to clean up.");
    if (mode !== "all" && info.freeBytes < info.requiredBytes) throw new Error("Not enough free disk space to clean up history safely.");
    optimizingHistory = true;
    historyPaused = true;
    try {
      let result: HistoryCleanupResult;
      if (IS_MAC && app.isPackaged) {
        const helperScript = hookScript().replace("leash-hook.js", "leash-helper.js");
        const args = mode === "compact" ? ["--optimize", historyPath] : ["--purge", mode, historyPath, ...(keepDays === null ? [] : [String(keepDays)])];
        const { stdout } = await exec("/usr/bin/osascript", ["-e", helperMaintenanceScript(process.execPath, helperScript, args)]);
        let deleted: number | null = null;
        try {
          deleted = (JSON.parse(stdout.trim().split("\n").pop() ?? "") as { deleted?: number | null }).deleted ?? null;
        } catch {
          deleted = null;
        }
        result = { beforeBytes: info.files[0]!.bytes, afterBytes: historyStorageBytes(historyPath), deleted };
      } else {
        result = mode === "compact" ? { ...optimizeHistory(historyPath), deleted: null } : purgeCommand(mode, historyPath, keepDays === null ? undefined : String(keepDays));
      }
      pollHistory();
      return result;
    } finally {
      historyPaused = false;
      optimizingHistory = false;
    }
  });
  ipcMain.handle("ignored:list", () => listIgnored(db));
  ipcMain.handle("ignored:set", (_event, id: number, enabled: boolean) => {
    if (!Number.isInteger(id) || typeof enabled !== "boolean") return listIgnored(db);
    setIgnoredEnabled(db, id, enabled);
    return listIgnored(db);
  });
  ipcMain.handle("ignored:add", (_event, prefix: string) => {
    const added = typeof prefix === "string" && addIgnored(db, prefix) !== null;
    return { rows: listIgnored(db), added };
  });
  ipcMain.handle("ignored:delete", (_event, id: number) => {
    if (Number.isInteger(id)) deleteIgnored(db, id);
    return listIgnored(db);
  });
  ipcMain.handle("history:text", (_event, id: number) => withHistory((historyDb) => historyText(historyDb, id)));
  ipcMain.handle("history:summary", (_event, from: number) => {
    const since = Number.isFinite(from) ? from : 0;
    return { ...withHistory((historyDb) => summarizeHistory(historyDb, since)), blocked: countBlocked(db, since) };
  });
  ipcMain.handle("history:restore", (_event, id: number) => {
    if (!Number.isInteger(id)) return { ok: false, reason: "That history entry is gone." };
    const { event, text } = withHistory((historyDb) => ({ event: historyEvent(historyDb, id), text: historyText(historyDb, id) }));
    if (!event) return { ok: false, reason: "That history entry is gone." };
    let current: string | null = null;
    try {
      current = readFileSync(event.path, "utf8");
    } catch {
      /* missing or unreadable */
    }
    const check = checkRestore({ kind: event.kind, path: event.path, before: text.before, after: text.after, current, home, protectedRoots: protectedRoots(home) });
    if (!check.ok || text.before === null) return check.ok ? { ok: false, reason: "There is no earlier version to restore." } : check;
    try {
      const mode = statSync(event.path).mode & 0o777;
      writeFileSync(event.path, text.before, { mode });
      chmodSync(event.path, mode);
    } catch {
      return { ok: false, reason: "The file could not be written." };
    }
    return { ok: true };
  });
  ipcMain.handle("approval:list", () => broker.list());
  ipcMain.handle("approval:close", () => options.closeApproval());
  const decideApproval = (id: string, decision: "allow" | "deny", ttlSeconds: number | null, scopePath?: string) => {
    const pending = broker.list().find((item) => item.id === id);
    const timeout = timeouts.get(id);
    if (timeout) clearTimeout(timeout);
    const ttl = ttlSeconds === undefined ? DEFAULT_TTL_S : ttlSeconds;
    if (decision === "allow" && pending) {
      const { agent, access } = pending.request;
      const scope = typeof scopePath === "string" && parentFolders(pending.request.paths).includes(scopePath) ? scopePath : undefined;
      const roots = allow(scope ? [scope] : pending.request.paths, agent, access, ttl, Boolean(scope));
      const ts = Date.now();
      for (const path of roots) recordApproval(db, { ts, agent, path, command: null, access, ttlSeconds: ttl });
      const command = pending.request.command?.trim() ?? "";
      if (command) {
        upsertCommandGrant(db, {
          agent,
          command,
          createdAt: Date.now(),
          expiresAt: ttl === null ? null : Date.now() + ttl * 1000,
        });
        recordApproval(db, { ts, agent, path: null, command, access, ttlSeconds: ttl });
      }
    }
    broker.decide(id, { decision, ttlSeconds: ttlSeconds ?? undefined });
    if (decision === "allow") {
      releaseCovered();
      publishStatus();
    }
  };
  ipcMain.handle("approval:decide", (_event, id: string, decision: "allow" | "deny", ttlSeconds: number | null, scopePath?: string) => decideApproval(id, decision, ttlSeconds, scopePath));
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
    if (id === "hermes") return existsSync(join(home, ".hermes"));
    return false;
  };
  const hookRows = (): SetupAgent[] => {
    const disabled = new Set(readUiState(options.userData).disabledAgents ?? []);
    const hooks: Record<string, boolean | null> = {
      "claude-code": claudeHooksInstalled(readJson(hookPath("claude-code", home)), hookCommand("claude")),
      cursor: cursorHooksInstalled(readJson(hookPath("cursor", home)), hookCommand("cursor")),
      codex: codexHooksInstalled(readJson(hookPath("codex", home)), hookCommand("codex")),
      gemini: geminiHooksInstalled(readJson(hookPath("gemini", home)), hookCommand("gemini")),
      hermes: hermesHooksInstalled(existsSync(join(home, ".hermes/config.yaml")) ? readFileSync(join(home, ".hermes/config.yaml"), "utf8") : "", join(home, ".hermes/agent-hooks/agentic-leash.sh")),
    };
    return (["claude-code", "cursor", "codex", "gemini", "hermes"] as const).map((id) => ({
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
    const fda = !IS_MAC || helper === "skipped" || hasFullDiskAccess(join(homedir(), "Library/Application Support/com.apple.TCC/TCC.db"));
    const agents = hookRows();
    const state = readUiState(options.userData);
    const onboarded = rememberOnboarding(Boolean(state.onboarded), agents);
    if (onboarded && !state.onboarded) writeUiState(options.userData, { ...state, onboarded: true });
    return { helper, fda, agents, ready: setupReady({ helper, fda, agents }, onboarded) };
  };
  const installHermes = () => {
    const scriptPath = join(home, ".hermes/agent-hooks/agentic-leash.sh");
    mkdirSync(dirname(scriptPath), { recursive: true });
    writeFileSync(scriptPath, hermesScript(process.execPath, hookScript()));
    chmodSync(scriptPath, 0o755);
    const config = join(home, ".hermes/config.yaml");
    const text = existsSync(config) ? readFileSync(config, "utf8") : "";
    mkdirSync(dirname(config), { recursive: true });
    writeWithBackup(config, mergeHermesConfig(text, scriptPath));
  };
  const uninstallHermes = () => {
    const config = join(home, ".hermes/config.yaml");
    if (existsSync(config)) writeWithBackup(config, removeHermesConfig(readFileSync(config, "utf8")));
    const scriptPath = join(home, ".hermes/agent-hooks/agentic-leash.sh");
    if (existsSync(scriptPath)) rmSync(scriptPath);
  };
  const installAgent = (agent: HookAgent) => {
    if (agent === "hermes") {
      installHermes();
      pendingRestart.add("hermes");
      return;
    }
    const path = hookPath(agent, home);
    const kind = agent === "claude-code" ? "claude" : agent;
    const command = hookCommand(kind);
    const existing = readJson(path);
    const next = agent === "cursor" ? mergeCursorHooks(existing, command) : agent === "codex" ? mergeCodexHooks(existing, command) : agent === "gemini" ? mergeGeminiHooks(existing, command) : mergeClaudeHooks(existing, command);
    writeHookFile(path, next);
    pendingRestart.add(agent);
  };
  const uninstallAgent = (agent: HookAgent) => {
    if (agent === "hermes") {
      uninstallHermes();
      pendingRestart.add("hermes");
      return;
    }
    const path = hookPath(agent, home);
    if (!existsSync(path)) return;
    const existing = readJson(path);
    const next = agent === "cursor" ? removeCursorHooks(existing) : agent === "codex" ? removeCodexHooks(existing) : agent === "gemini" ? removeGeminiHooks(existing) : removeClaudeHooks(existing);
    writeHookFile(path, next);
    pendingRestart.add(agent);
  };
  ipcMain.handle("hooks:status", () => hookRows().every((agent) => agent.hooks !== false));
  ipcMain.handle("hooks:install", (_event, agent: HookAgent) => {
    if (agent !== "claude-code" && agent !== "cursor" && agent !== "codex" && agent !== "gemini" && agent !== "hermes") return;
    installAgent(agent);
  });
  ipcMain.handle("hooks:uninstall", (_event, agent: HookAgent) => {
    if (agent !== "claude-code" && agent !== "cursor" && agent !== "codex" && agent !== "gemini" && agent !== "hermes") return;
    uninstallAgent(agent);
  });
  ipcMain.handle("setup:get", () => currentSetup());
  ipcMain.handle("agents:enabled", (_event, id: AgentId, enabled: boolean) => {
    const state = readUiState(options.userData);
    const disabled = new Set(state.disabledAgents ?? []);
    if (enabled) disabled.delete(id);
    else disabled.add(id);
    writeUiState(options.userData, { ...state, disabledAgents: [...disabled] });
    if (!enabled && (id === "claude-code" || id === "cursor" || id === "codex" || id === "gemini" || id === "hermes")) uninstallAgent(id);
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
      hermes: hermesHooksInstalled(existsSync(join(home, ".hermes/config.yaml")) ? readFileSync(join(home, ".hermes/config.yaml"), "utf8") : "", join(home, ".hermes/agent-hooks/agentic-leash.sh")),
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
    await exec("/usr/bin/osascript", ["-e", helperInstallScript(process.execPath, hookScript().replace("leash-hook.js", "leash-helper.js"))]);
  });
  ipcMain.handle("app:uninstall", async () => {
    if (IS_MAC && app.isPackaged) await exec("/usr/bin/osascript", ["-e", helperUninstallScript()]);
    uninstalling = true;
    for (const agent of ["claude-code", "cursor", "codex", "gemini", "hermes"] as const) uninstallAgent(agent);
    publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, false);
    if (IS_MAC) {
      const uid = process.getuid?.();
      if (uid !== undefined) {
        await exec("/bin/launchctl", ["bootout", sweepServiceTarget(uid)]).catch(() => undefined);
        await exec("/bin/launchctl", ["bootout", `gui/${uid}/${LOGIN_AGENT_LABEL}`]).catch(() => undefined);
      }
    } else options.disableLoginItem();
    removeLeftovers(uninstallLeftovers({ home, claudeRoot: claudeRoot(), userData: options.userData, historyDir: dirname(historyPath), systemHistory: HISTORY_DIR }));
    options.finishUninstall();
  });

  try {
    globalShortcut.register(IS_MAC ? "Control+Alt+Command+L" : "Control+Alt+Shift+L", () => {
      const { revoked } = revokeAll();
      options.notify("Lockdown is on", `Revoked ${revoked} grants. Agent tool calls are blocked until you end lockdown.`);
    });
  } catch {
    /* shortcut already owned */
  }
  void ensureSweepAgent();
  nativeTheme.themeSource = readUiState(options.userData).theme ?? "system";
  publishStatus();
  return { revokeAll, unlock };
}

export function leashDataDir(): string {
  return leashDir();
}

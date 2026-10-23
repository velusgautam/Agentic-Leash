import { execFileSync, spawn } from "node:child_process";
import { chmodSync, createWriteStream, existsSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { grantsDbPath } from "../shared/constants";
import { getSetting } from "../shared/db";
import { BUILTIN_IGNORED, enabledIgnoredPrefixes } from "../shared/ignored";
import { eventBucket } from "../shared/noise";
import { isUnder } from "../shared/paths";
import { MAIN_RETENTION_DAYS, NOISE_RETENTION_DAYS, retentionDays } from "../shared/retention";
import { capBytes, HARD_CAP_STOP, PRUNE_START, type HistoryStats } from "../shared/storage";
import type { HistoryEvent } from "../shared/types";
import { classify } from "./classify";
import { appliedIgnoredKey, checkpointHistory, convertAutoVacuumIfSafe, dropIgnored, historyCounts, historyStorageBytes, historyUsage, ignoredKey, insertEvents, openHistoryDb, optimizeHistory, pruneBySize, pruneHistory, purgeHistory, readHistoryStats, resetHistory, splitHistory, writeHistoryStats } from "./historyDb";
import { lsofText, pollNet } from "./net";
import { ProcTree, type EsEvent } from "./proctree";
import { ContentCache, gitBaseline, readText } from "./snapshots";

const EVENTS = ["open", "close", "create", "unlink", "rename", "exec", "fork", "exit"];
const DEFAULT_HISTORY = "/Library/Application Support/AgenticLeash/history.db";
const LOG_LIMIT = 10 * 1024 * 1024;
const COUNTS_EVERY_MS = 10 * 60 * 1000;
const USAGE_EVERY_MS = 5000;
const OPTIMIZE_EVERY_MS = 60 * 60 * 1000;
const FLUSH_RETRIES = 40;

function userHome(): string {
  if (process.env.AGENTIC_LEASH_HOME) return process.env.AGENTIC_LEASH_HOME;
  try {
    const user = execFileSync("/usr/bin/stat", ["-f", "%Su", "/dev/console"], { encoding: "utf8" }).trim();
    if (user && user !== "root") {
      const text = execFileSync("/usr/bin/dscl", [".", "-read", `/Users/${user}`, "NFSHomeDirectory"], { encoding: "utf8" });
      const match = /NFSHomeDirectory:\s*(\S+)/.exec(text);
      if (match) return match[1]!;
    }
  } catch {
    /* console user is unavailable in some test runs */
  }
  return homedir();
}

function readIgnored(home: string, previous?: string[]): string[] {
  try {
    const db = new DatabaseSync(grantsDbPath(home), { readOnly: true });
    const prefixes = enabledIgnoredPrefixes(db);
    db.close();
    return prefixes;
  } catch {
    // A transient read error must not swap the list: a changed key would trigger a full rescan.
    return previous ?? [...BUILTIN_IGNORED];
  }
}

function grantPaths(now: number): string[] {
  try {
    const db = new DatabaseSync(grantsDbPath(userHome()), { readOnly: true });
    const rows = db.prepare("SELECT path, expires_at FROM grants").all() as unknown as { path: string; expires_at: number | null }[];
    db.close();
    return rows.filter((row) => row.expires_at === null || row.expires_at > now).map((row) => row.path);
  } catch {
    return [];
  }
}

export function startHelper(historyPath: string, eslogger = "/usr/bin/eslogger"): void {
  const db = openHistoryDb(historyPath);
  try {
    chmodSync(dirname(historyPath), 0o755);
    chmodSync(historyPath, 0o644);
  } catch {
    /* dev runs are not root */
  }
  const tree = new ProcTree();
  let queue: HistoryEvent[] = [];
  const seen = new Set<string>();
  let grants = grantPaths(Date.now());
  const cache = new ContentCache({
    readText,
    gitShow: gitBaseline,
    granted: (file) => grants.some((root) => isUnder(file, root)),
  });
  const home = userHome();
  let ignored = readIgnored(home);
  let appliedKey = appliedIgnoredKey(db);
  const applyIgnored = () => {
    ignored = readIgnored(home, ignored);
    const key = ignoredKey(ignored);
    if (key === appliedKey) return;
    dropIgnored(db, ignored);
    appliedKey = key;
  };
  const previous = readHistoryStats(db);
  let stats: HistoryStats = { usedBytes: 0, fileBytes: 0, capBytes: capBytes(""), counts: [], prunedAt: null, prunedRows: 0, hardCap: false, ...previous };
  let countedAt = 0;
  let armed = false;
  let checkedAt = 0;
  let optimizedAt = 0;
  const prune = () => {
    let main = MAIN_RETENTION_DAYS;
    let noise = NOISE_RETENTION_DAYS;
    let capValue = "";
    try {
      const grantsDb = new DatabaseSync(grantsDbPath(home), { readOnly: true });
      main = retentionDays(getSetting(grantsDb, "history_days", ""), MAIN_RETENTION_DAYS);
      noise = retentionDays(getSetting(grantsDb, "noise_days", ""), NOISE_RETENTION_DAYS);
      capValue = getSetting(grantsDb, "history_cap_gb", "");
      grantsDb.close();
    } catch {
      /* grants db is absent until the app has opened */
    }
    const now = Date.now();
    const cap = capBytes(capValue);
    const deleted = pruneHistory(db, now, main, noise);
    checkpointHistory(db);
    const pass = pruneBySize(db, cap, now);
    const usedBytes = historyUsage(db);
    const rows = deleted + pass.deleted;
    if (rows || now - countedAt >= COUNTS_EVERY_MS) {
      stats.counts = historyCounts(db);
      countedAt = now;
    }
    const hardCap = pass.hardCap || (stats.hardCap && usedBytes >= cap * HARD_CAP_STOP);
    stats = { ...stats, usedBytes, fileBytes: historyStorageBytes(historyPath), capBytes: cap, hardCap, ...(rows ? { prunedAt: now, prunedRows: rows } : {}) };
    writeHistoryStats(db, stats);
    if (rows || now - optimizedAt >= OPTIMIZE_EVERY_MS) {
      db.exec("PRAGMA optimize");
      optimizedAt = now;
    }
    armed = usedBytes < cap * PRUNE_START;
  };
  splitHistory(db);
  applyIgnored();
  prune();
  let failures = 0;
  const timer = setInterval(() => {
    if (!queue.length) return;
    const batch = queue;
    queue = [];
    try {
      insertEvents(db, batch, ignored);
      failures = 0;
    } catch (error) {
      failures += 1;
      // SQLITE_BUSY or similar: retry on the next flush, but give up after ~10s so a bad batch can't pile up forever.
      if (failures < FLUSH_RETRIES) queue = batch.concat(queue);
      else {
        log.write(`dropped ${batch.length} events after ${failures} failed inserts: ${error instanceof Error ? error.message : String(error)}\n`);
        failures = 0;
      }
      return;
    }
    const now = Date.now();
    if (!armed || now - checkedAt < USAGE_EVERY_MS) return;
    checkedAt = now;
    if (historyUsage(db) >= stats.capBytes * PRUNE_START) prune();
  }, 250);
  const netTimer = setInterval(() => {
    grants = grantPaths(Date.now());
    applyIgnored();
    queue.push(...pollNet({ pids: tree.pids(), seen, now: Date.now(), agentFor: (pid) => tree.agent(pid) as HistoryEvent["agent"], lsof: lsofText }));
  }, 2000);
  const logPath = join(dirname(historyPath), "helper.log");
  let log = createWriteStream(logPath, { flags: "a" });
  const rotateLog = () => {
    if (!existsSync(logPath) || statSync(logPath).size <= LOG_LIMIT) return;
    log.end();
    renameSync(logPath, `${logPath}.1`);
    log = createWriteStream(logPath, { flags: "a" });
  };
  let converted = false;
  const pruneTimer = setInterval(() => {
    prune();
    if (!converted) {
      converted = true; // one attempt per start; a skipped or failed one is left to Optimize
      const started = Date.now();
      try {
        checkpointHistory(db);
        const result = convertAutoVacuumIfSafe(db, historyPath);
        if (result.status === "converted") log.write(`auto-vacuum converted in ${Date.now() - started}ms (${result.bytes} bytes)\n`);
        else if (result.status !== "already") log.write(`auto-vacuum conversion skipped: ${result.status} (db ${result.bytes} bytes, free ${result.free} bytes)\n`);
      } catch (error) {
        log.write(`auto-vacuum conversion failed: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
    rotateLog();
  }, 60_000);
  let stopping = false;
  let child: ReturnType<typeof spawn> | null = null;
  const spawnLogger = () => {
    if (stopping) return;
    child = spawn(eslogger, EVENTS, { stdio: ["ignore", "pipe", "pipe"] });
    child.stderr?.on("data", (chunk: Buffer) => log.write(chunk));
    const lines = createInterface({ input: child.stdout! });
    lines.on("line", (line) => {
      try {
        const event = JSON.parse(line) as EsEvent;
        tree.apply(event);
        const classified = classify(event, tree, home);
        if (classified && eventBucket(classified, ignored) !== "drop") queue.push(cache.observe(classified));
      } catch {
        /* eslogger sometimes emits a partial line */
      }
    });
    child.on("exit", () => {
      if (!stopping) setTimeout(spawnLogger, 2000);
    });
  };
  spawnLogger();
  const stop = () => {
    stopping = true;
    clearInterval(timer);
    clearInterval(netTimer);
    clearInterval(pruneTimer);
    child?.kill("SIGKILL");
    if (queue.length) insertEvents(db, queue.splice(0), ignored);
    db.close();
    log.end();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

export function purgeCommand(mode: string, path: string, days?: string): { beforeBytes: number; afterBytes: number; deleted: number | null } {
  if (mode === "all") return { ...resetHistory(path), deleted: null };
  if (mode !== "reads" && mode !== "noise" && mode !== "older") throw new Error(`Unknown purge mode: ${mode}`);
  const beforeBytes = historyStorageBytes(path);
  const db = openHistoryDb(path);
  let deleted: number;
  try {
    deleted = purgeHistory(db, mode, Date.now(), mode === "older" ? Number(days) : undefined);
  } finally {
    db.close();
  }
  return { beforeBytes, afterBytes: optimizeHistory(path).afterBytes, deleted };
}

if (process.argv[1]?.includes("leash-helper")) {
  if (process.argv[2] === "--optimize") {
    const path = process.argv[3] || DEFAULT_HISTORY;
    process.stdout.write(`${JSON.stringify(optimizeHistory(path))}\n`);
  } else if (process.argv[2] === "--purge") {
    process.stdout.write(`${JSON.stringify(purgeCommand(process.argv[3] ?? "", process.argv[4] || DEFAULT_HISTORY, process.argv[5]))}\n`);
  } else {
    const path = process.argv[2] || DEFAULT_HISTORY;
    startHelper(path);
  }
}

import { execFileSync, spawn } from "node:child_process";
import { chmodSync, createWriteStream } from "node:fs";
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
import type { HistoryEvent } from "../shared/types";
import { classify } from "./classify";
import { checkpointHistory, dropIgnored, insertEvents, openHistoryDb, optimizeHistory, pruneHistory, splitHistory } from "./historyDb";
import { lsofText, pollNet } from "./net";
import { ProcTree, type EsEvent } from "./proctree";
import { ContentCache, gitBaseline, readText } from "./snapshots";

const EVENTS = ["open", "close", "create", "unlink", "rename", "exec", "fork", "exit"];

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

function readIgnored(home: string): string[] {
  try {
    const db = new DatabaseSync(grantsDbPath(home), { readOnly: true });
    const prefixes = enabledIgnoredPrefixes(db);
    db.close();
    return prefixes;
  } catch {
    return [...BUILTIN_IGNORED];
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
  const queue: HistoryEvent[] = [];
  const seen = new Set<string>();
  let grants = grantPaths(Date.now());
  const cache = new ContentCache({
    readText,
    gitShow: gitBaseline,
    granted: (file) => grants.some((root) => isUnder(file, root)),
  });
  const home = userHome();
  let ignored = readIgnored(home);
  let ignoredKey = "";
  const applyIgnored = () => {
    ignored = readIgnored(home);
    const key = ignored.join("\0");
    if (key === ignoredKey) return;
    ignoredKey = key;
    dropIgnored(db, ignored);
  };
  const prune = () => {
    let main = MAIN_RETENTION_DAYS;
    let noise = NOISE_RETENTION_DAYS;
    try {
      const grantsDb = new DatabaseSync(grantsDbPath(home), { readOnly: true });
      main = retentionDays(getSetting(grantsDb, "history_days", ""), MAIN_RETENTION_DAYS);
      noise = retentionDays(getSetting(grantsDb, "noise_days", ""), NOISE_RETENTION_DAYS);
      grantsDb.close();
    } catch {
      /* grants db is absent until the app has opened */
    }
    pruneHistory(db, Date.now(), main, noise);
    checkpointHistory(db);
  };
  splitHistory(db);
  applyIgnored();
  prune();
  const timer = setInterval(() => {
    if (!queue.length) return;
    insertEvents(db, queue.splice(0), ignored);
  }, 250);
  const netTimer = setInterval(() => {
    grants = grantPaths(Date.now());
    applyIgnored();
    queue.push(...pollNet({ pids: tree.pids(), seen, now: Date.now(), agentFor: (pid) => tree.agent(pid) as HistoryEvent["agent"], lsof: lsofText }));
  }, 2000);
  const pruneTimer = setInterval(prune, 60_000);
  const log = createWriteStream(join(dirname(historyPath), "helper.log"), { flags: "a" });
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

if (process.argv[1]?.includes("leash-helper")) {
  if (process.argv[2] === "--optimize") {
    const path = process.argv[3] || "/Library/Application Support/AgenticLeash/history.db";
    process.stdout.write(`${JSON.stringify(optimizeHistory(path))}\n`);
  } else {
    const path = process.argv[2] || "/Library/Application Support/AgenticLeash/history.db";
    startHelper(path);
  }
}

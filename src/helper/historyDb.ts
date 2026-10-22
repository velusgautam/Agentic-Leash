import { chmodSync, chownSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ignoredMatchSql } from "../shared/ignored";
import { eventBucket } from "../shared/noise";
import { MAIN_RETENTION_DAYS, NOISE_RETENTION_DAYS } from "../shared/retention";
import type { HistoryEvent, HistoryRow } from "../shared/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const EVENT_COLS = "id, ts, agent, pid, exe, kind, path, dest_path, sha256, before_blob, after_blob, sensitive, source, minute_key";
const EVENT_TABLE = `
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  agent TEXT NOT NULL,
  pid INTEGER NOT NULL,
  exe TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  dest_path TEXT,
  sha256 TEXT,
  before_blob TEXT,
  after_blob TEXT,
  sensitive INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  minute_key TEXT
`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (${EVENT_TABLE});
CREATE UNIQUE INDEX IF NOT EXISTS events_read_collapse ON events (minute_key) WHERE minute_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_path ON events (path, ts);
CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
CREATE TABLE IF NOT EXISTS noise (${EVENT_TABLE});
CREATE UNIQUE INDEX IF NOT EXISTS noise_read_collapse ON noise (minute_key) WHERE minute_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS noise_ts ON noise (ts);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export function openHistoryDb(path: string, readOnly = false): DatabaseSync {
  if (!readOnly) mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { readOnly });
  db.exec("PRAGMA busy_timeout = 5000");
  if (!readOnly) {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(SCHEMA);
  }
  return db;
}

function maxId(db: DatabaseSync): number {
  const events = (db.prepare("SELECT MAX(id) AS n FROM events").get() as { n: number | null }).n ?? 0;
  const noise = (db.prepare("SELECT MAX(id) AS n FROM noise").get() as { n: number | null }).n ?? 0;
  return Math.max(events, noise);
}

export function insertEvents(db: DatabaseSync, events: HistoryEvent[], ignored: readonly string[] = []): void {
  const kept = events.flatMap((event) => {
    const bucket = eventBucket(event, ignored);
    return bucket === "drop" ? [] : [{ event, bucket }];
  });
  if (!kept.length) return;
  let next = maxId(db);
  const insertMain = db.prepare(`INSERT OR IGNORE INTO events (${EVENT_COLS}) VALUES (${Array(14).fill("?").join(", ")})`);
  const insertNoise = db.prepare(`INSERT OR IGNORE INTO noise (${EVENT_COLS}) VALUES (${Array(14).fill("?").join(", ")})`);
  db.exec("BEGIN");
  try {
    for (const item of kept) {
      next += 1;
      const event = item.event;
      const minute = event.kind === "read" ? `${event.agent}|${event.path}|${Math.floor(event.ts / 60000)}` : null;
      const args = [next, event.ts, event.agent, event.pid, event.exe, event.kind, event.path, event.destPath ?? null, event.sha256 ?? null, event.beforeBlob ?? null, event.afterBlob ?? null, event.sensitive ? 1 : 0, event.source, minute];
      (item.bucket === "noise" ? insertNoise : insertMain).run(...args);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

const KINDS = new Set(["read", "write", "create", "delete", "rename", "exec", "net"]);

interface HistorySql {
  id: number;
  ts: number;
  agent: string;
  exe?: string;
  kind: string;
  path: string;
  dest_path: string | null;
  sensitive: number;
  before_blob?: string | null;
  after_blob?: string | null;
}

function toRow(row: HistorySql, withText: boolean): HistoryRow {
  return {
    id: row.id,
    ts: row.ts,
    agent: row.agent,
    exe: row.exe ?? "",
    kind: row.kind,
    path: row.path,
    destPath: row.dest_path,
    sensitive: row.sensitive === 1,
    beforeText: withText ? (row.before_blob ?? null) : null,
    afterText: withText ? (row.after_blob ?? null) : null,
  };
}

export interface HistoryFilter {
  from: number | null;
  to: number | null;
  agents: string[];
  path: string;
  kind: string;
  sensitive: boolean;
  includeNoise?: boolean;
  offset: number;
  limit: number;
}

const LIST_COLS = "id, ts, agent, exe, kind, path, dest_path, sensitive";

export function listHistory(db: DatabaseSync, afterId = 0, limit = 200): HistoryRow[] {
  const rows = db.prepare(`SELECT ${LIST_COLS} FROM events WHERE id > ? ORDER BY id DESC LIMIT ?`).all(afterId, limit) as unknown as HistorySql[];
  return rows.map((row) => toRow(row, false));
}

function filters(filter: HistoryFilter): { clause: string; args: (string | number)[] } {
  const where = ["1 = 1"];
  const args: (string | number)[] = [];
  if (filter.from !== null) {
    where.push("ts >= ?");
    args.push(filter.from);
  }
  if (filter.to !== null) {
    where.push("ts <= ?");
    args.push(filter.to);
  }
  const agents = filter.agents.filter((agent) => /^[a-z0-9-]+$/.test(agent));
  if (agents.length) {
    where.push(`agent IN (${agents.map(() => "?").join(", ")})`);
    args.push(...agents);
  }
  if (filter.path) {
    where.push("path LIKE ? ESCAPE '\\'");
    args.push(`%${filter.path.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
  }
  if (KINDS.has(filter.kind)) {
    where.push("kind = ?");
    args.push(filter.kind);
  }
  if (filter.sensitive) where.push("sensitive = 1");
  return { clause: where.join(" AND "), args };
}

function hasNoiseTable(db: DatabaseSync): boolean {
  return Boolean(db.prepare("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'noise'").get());
}

export function queryHistory(db: DatabaseSync, filter: HistoryFilter): { rows: HistoryRow[]; total: number } {
  const { clause, args } = filters(filter);
  const tables = filter.includeNoise && hasNoiseTable(db) ? ["events", "noise"] : ["events"];
  const union = tables.map((table) => `SELECT ${LIST_COLS} FROM ${table} WHERE ${clause}`).join(" UNION ALL ");
  const unionArgs = tables.flatMap(() => args);
  const total = Number((db.prepare(`SELECT count(*) AS n FROM (${union})`).get(...unionArgs) as { n: number }).n);
  const rows = db.prepare(`SELECT * FROM (${union}) ORDER BY id DESC LIMIT ? OFFSET ?`).all(...unionArgs, filter.limit, filter.offset) as unknown as HistorySql[];
  return { rows: rows.map((row) => toRow(row, false)), total };
}

export function historyText(db: DatabaseSync, id: number): { before: string | null; after: string | null } {
  const sql = "SELECT before_blob, after_blob FROM events WHERE id = ?";
  const noiseSql = hasNoiseTable(db) ? sql.replace("events", "noise") : null;
  const row = (db.prepare(sql).get(id) ?? (noiseSql ? db.prepare(noiseSql).get(id) : undefined)) as { before_blob: string | null; after_blob: string | null } | undefined;
  return { before: row?.before_blob ?? null, after: row?.after_blob ?? null };
}

function verifyHistory(path: string): void {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const result = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    if (result.integrity_check !== "ok") throw new Error(`History integrity check failed: ${result.integrity_check}`);
  } finally {
    db.close();
  }
}

export function replaceHistory(original: string, replacement: string, verify: (path: string) => void = verifyHistory): void {
  const backup = `${original}.backup-${process.pid}-${Date.now()}`;
  renameSync(original, backup);
  try {
    renameSync(replacement, original);
    verify(original);
    rmSync(backup, { force: true });
  } catch (error) {
    rmSync(original, { force: true });
    renameSync(backup, original);
    rmSync(replacement, { force: true });
    throw error;
  }
}

export interface HistoryOptimization {
  beforeBytes: number;
  afterBytes: number;
}

export function historyStorageBytes(path: string): number {
  return ["", "-wal", "-shm"].reduce((total, suffix) => {
    const file = `${path}${suffix}`;
    return total + (existsSync(file) ? statSync(file).size : 0);
  }, 0);
}

export function optimizeHistory(path: string): HistoryOptimization {
  const before = statSync(path);
  const beforeBytes = historyStorageBytes(path);
  const replacement = `${path}.optimize-${process.pid}-${Date.now()}`;
  rmSync(replacement, { force: true });
  rmSync(`${replacement}-wal`, { force: true });
  rmSync(`${replacement}-shm`, { force: true });
  const source = new DatabaseSync(path);
  try {
    source.exec("PRAGMA busy_timeout = 5000");
    const current = source.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    if (current.journal_mode === "wal") {
      const checkpoint = source.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get() as { busy: number; log: number; checkpointed: number };
      if (checkpoint.busy !== 0 || checkpoint.log !== 0) throw new Error("Cannot optimize history while an active history connection is open.");
    }
    const mode = source.prepare("PRAGMA journal_mode = DELETE").get() as { journal_mode: string };
    if (mode.journal_mode !== "delete") throw new Error("Cannot optimize history while an active history connection is open.");
  } finally {
    source.close();
  }
  for (const suffix of ["-wal", "-shm"]) rmSync(`${path}${suffix}`, { force: true });
  try {
    const compact = openHistoryDb(replacement);
    try {
      compact.prepare("ATTACH DATABASE ? AS source").run(path);
      compact.exec("BEGIN");
      try {
        compact.exec(`INSERT INTO events (${EVENT_COLS}) SELECT ${EVENT_COLS} FROM source.events WHERE kind <> 'exec'`);
        const sourceNoise = compact.prepare("SELECT 1 AS n FROM source.sqlite_master WHERE type = 'table' AND name = 'noise'").get();
        if (sourceNoise) compact.exec(`INSERT INTO noise (${EVENT_COLS}) SELECT ${EVENT_COLS} FROM source.noise WHERE kind <> 'exec'`);
        const sourceMeta = compact.prepare("SELECT 1 AS n FROM source.sqlite_master WHERE type = 'table' AND name = 'meta'").get();
        if (sourceMeta) compact.exec("INSERT OR REPLACE INTO meta (key, value) SELECT key, value FROM source.meta");
        compact.exec("COMMIT");
      } catch (error) {
        compact.exec("ROLLBACK");
        throw error;
      }
      compact.exec("DETACH DATABASE source");
      compact.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      const mode = compact.prepare("PRAGMA journal_mode = DELETE").get() as { journal_mode: string };
      if (mode.journal_mode !== "delete") throw new Error("Could not finalize optimized history.");
    } finally {
      compact.close();
    }
    verifyHistory(replacement);
    chmodSync(replacement, before.mode);
    if (process.platform !== "win32") chownSync(replacement, before.uid, before.gid);
    replaceHistory(path, replacement);
    return { beforeBytes, afterBytes: historyStorageBytes(path) };
  } finally {
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = `${replacement}${suffix}`;
      if (existsSync(file)) rmSync(file, { force: true });
    }
  }
}

export function splitHistory(db: DatabaseSync): void {
  if (db.prepare("SELECT value FROM meta WHERE key = 'noise-split'").get()) return;
  const rows = db.prepare("SELECT id, kind, path, dest_path FROM events").all() as unknown as { id: number; kind: string; path: string; dest_path: string | null }[];
  const move = db.prepare(
    `INSERT OR IGNORE INTO noise (${EVENT_COLS}) SELECT ${EVENT_COLS} FROM events WHERE id = ?`,
  );
  const del = db.prepare("DELETE FROM events WHERE id = ?");
  db.exec("BEGIN");
  try {
    for (const row of rows) {
      const bucket = eventBucket({ kind: row.kind, path: row.path, destPath: row.dest_path });
      if (bucket === "main") continue;
      if (bucket === "noise") move.run(row.id);
      del.run(row.id);
    }
    db.prepare("INSERT INTO meta (key, value) VALUES ('noise-split', '1')").run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function dropIgnored(db: DatabaseSync, prefixes: readonly string[]): void {
  if (!prefixes.length) return;
  const tables = ["events", ...(hasNoiseTable(db) ? ["noise"] : [])];
  for (const prefix of prefixes) {
    const match = ignoredMatchSql(prefix);
    for (const table of tables) db.prepare(`DELETE FROM ${table} WHERE ${match.sql}`).run(...match.args);
  }
}

export function pruneHistory(db: DatabaseSync, now: number, mainDays = MAIN_RETENTION_DAYS, noiseDays = NOISE_RETENTION_DAYS): void {
  db.prepare("DELETE FROM events WHERE ts < ?").run(now - mainDays * DAY_MS);
  db.prepare("DELETE FROM noise WHERE ts < ?").run(now - noiseDays * DAY_MS);
}

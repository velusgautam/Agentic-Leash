import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { HISTORY_RETENTION_MS } from "../shared/constants";
import { NOISE_SQL } from "../shared/noise";
import { sha256 } from "./classify";
import type { HistoryEvent, HistoryRow } from "../shared/types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
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
);
CREATE UNIQUE INDEX IF NOT EXISTS events_read_collapse ON events (minute_key) WHERE minute_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_path ON events (path, ts);
CREATE TABLE IF NOT EXISTS blobs (sha256 TEXT PRIMARY KEY, content BLOB NOT NULL);
`;

export function openHistoryDb(path: string, readOnly = false): DatabaseSync {
  if (!readOnly) mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { readOnly });
  if (!readOnly) db.exec(SCHEMA);
  return db;
}

function remember(db: DatabaseSync, text: string | undefined): string | null {
  if (!text) return null;
  db.prepare("INSERT OR IGNORE INTO blobs (sha256, content) VALUES (?, ?)").run(sha256(text), text);
  return text;
}

export function insertEvents(db: DatabaseSync, events: HistoryEvent[]): void {
  if (!events.length) return;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO events (ts, agent, pid, exe, kind, path, dest_path, sha256, before_blob, after_blob, sensitive, source, minute_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.exec("BEGIN");
  try {
    for (const event of events) {
      const minute = event.kind === "read" ? `${event.agent}|${event.path}|${Math.floor(event.ts / 60000)}` : null;
      insert.run(event.ts, event.agent, event.pid, event.exe, event.kind, event.path, event.destPath ?? null, event.sha256 ?? null, remember(db, event.beforeBlob), remember(db, event.afterBlob), event.sensitive ? 1 : 0, event.source, minute);
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
  hideNoise?: boolean;
  offset: number;
  limit: number;
}

export function listHistory(db: DatabaseSync, afterId = 0, limit = 200, hideNoise = false): HistoryRow[] {
  const noise = hideNoise ? `AND (sensitive = 1 OR NOT ${NOISE_SQL})` : "";
  const rows = db
    .prepare(`SELECT id, ts, agent, kind, path, dest_path, sensitive FROM events WHERE id > ? ${noise} ORDER BY id DESC LIMIT ?`)
    .all(afterId, limit) as unknown as HistorySql[];
  return rows.map((row) => toRow(row, false));
}

export function queryHistory(db: DatabaseSync, filter: HistoryFilter): { rows: HistoryRow[]; total: number } {
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
  if (filter.hideNoise) where.push(`(sensitive = 1 OR NOT ${NOISE_SQL})`);
  const clause = where.join(" AND ");
  const total = Number((db.prepare(`SELECT count(*) AS n FROM events WHERE ${clause}`).get(...args) as { n: number }).n);
  const rows = db
    .prepare(`SELECT id, ts, agent, kind, path, dest_path, sensitive FROM events WHERE ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, filter.limit, filter.offset) as unknown as HistorySql[];
  return { rows: rows.map((row) => toRow(row, false)), total };
}

export function historyText(db: DatabaseSync, id: number): { before: string | null; after: string | null } {
  const row = db.prepare("SELECT before_blob, after_blob FROM events WHERE id = ?").get(id) as { before_blob: string | null; after_blob: string | null } | undefined;
  return { before: row?.before_blob ?? null, after: row?.after_blob ?? null };
}

export function pruneHistory(db: DatabaseSync, now: number): void {
  db.prepare("DELETE FROM events WHERE ts < ?").run(now - HISTORY_RETENTION_MS);
  db.exec("DELETE FROM blobs WHERE sha256 NOT IN (SELECT sha256 FROM events WHERE sha256 IS NOT NULL)");
}

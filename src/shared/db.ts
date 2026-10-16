import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Access, AgentId, DecisionRow, Grant } from "./types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS grants (
  id INTEGER PRIMARY KEY,
  agent TEXT NOT NULL,
  path TEXT NOT NULL,
  access TEXT NOT NULL CHECK (access IN ('read','write')),
  source TEXT NOT NULL CHECK (source IN ('leash','config')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS grants_live ON grants (agent, expires_at);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  agent TEXT NOT NULL,
  tool TEXT NOT NULL,
  paths TEXT NOT NULL,
  verdict TEXT NOT NULL,
  reason TEXT,
  grant_id INTEGER,
  duration_ms INTEGER
);
`;

interface GrantSql {
  id: number;
  agent: string;
  path: string;
  access: string;
  source: string;
  created_at: number;
  expires_at: number | null;
}

function toGrant(row: GrantSql): Grant {
  return {
    id: row.id,
    agent: row.agent as AgentId | "*",
    path: row.path,
    access: row.access as Access,
    source: row.source as "leash" | "config",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function openGrantsDb(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

export function listGrants(db: DatabaseSync): Grant[] {
  return db.prepare("SELECT * FROM grants ORDER BY id").all().map((row) => toGrant(row as unknown as GrantSql));
}

export function insertGrant(
  db: DatabaseSync,
  grant: { agent: string; path: string; access: Access; source: "leash" | "config"; createdAt: number; expiresAt: number | null },
): number {
  const result = db
    .prepare("INSERT INTO grants (agent, path, access, source, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(grant.agent, grant.path, grant.access, grant.source, grant.createdAt, grant.expiresAt);
  return Number(result.lastInsertRowid);
}

export function deleteGrant(db: DatabaseSync, id: number): void {
  db.prepare("DELETE FROM grants WHERE id = ?").run(id);
}

export function deleteGrants(db: DatabaseSync, where: string, ...args: (string | number)[]): number {
  const result = db.prepare(`DELETE FROM grants WHERE ${where}`).run(...args);
  return Number(result.changes);
}

export function getSetting(db: DatabaseSync, key: string, fallback = ""): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function recordDecision(
  db: DatabaseSync,
  row: { ts: number; agent: string; tool: string; paths: string[]; verdict: string; reason?: string; grantId?: number; durationMs?: number },
): void {
  db.prepare(
    "INSERT INTO decisions (ts, agent, tool, paths, verdict, reason, grant_id, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(row.ts, row.agent, row.tool, JSON.stringify(row.paths), row.verdict, row.reason ?? null, row.grantId ?? null, row.durationMs ?? null);
}

export function listDecisions(db: DatabaseSync, limit = 200): DecisionRow[] {
  const rows = db.prepare("SELECT * FROM decisions ORDER BY id DESC LIMIT ?").all(limit) as unknown as {
    id: number;
    ts: number;
    agent: string;
    tool: string;
    paths: string;
    verdict: string;
    reason: string | null;
    grant_id: number | null;
    duration_ms: number | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    ts: row.ts,
    agent: row.agent,
    tool: row.tool,
    paths: row.paths,
    verdict: row.verdict,
    reason: row.reason,
    grantId: row.grant_id,
    durationMs: row.duration_ms,
  }));
}

export function decisionDurations(db: DatabaseSync): number[] {
  return (db.prepare("SELECT duration_ms FROM decisions WHERE duration_ms IS NOT NULL").all() as unknown as { duration_ms: number }[]).map(
    (row) => row.duration_ms,
  );
}

export function pruneDecisions(db: DatabaseSync, olderThan: number): number {
  return Number(db.prepare("DELETE FROM decisions WHERE ts < ?").run(olderThan).changes);
}

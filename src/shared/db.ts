import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ensureIgnored } from "./ignored";
import { validateRule } from "./rules";
import type { Access, AgentId, AllowRule, DecisionRow, Grant, ScheduledRevoke } from "./types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS grants (
  id INTEGER PRIMARY KEY,
  agent TEXT NOT NULL,
  path TEXT NOT NULL,
  access TEXT NOT NULL CHECK (access IN ('read','write')),
  source TEXT NOT NULL CHECK (source IN ('leash','config')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  command TEXT
);
CREATE INDEX IF NOT EXISTS grants_live ON grants (agent, expires_at);
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('folder','command')),
  agent TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (kind, agent, value)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scheduled_revokes (
  path TEXT PRIMARY KEY,
  due_at INTEGER NOT NULL
);
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
CREATE TABLE IF NOT EXISTS ignored_noise (
  id INTEGER PRIMARY KEY,
  prefix TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  builtin INTEGER NOT NULL DEFAULT 0
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
  command: string | null;
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
    command: row.command ?? null,
  };
}

export function openGrantsDb(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  const cols = db.prepare("PRAGMA table_info(grants)").all() as { name: string }[];
  if (!cols.some((col) => col.name === "command")) db.exec("ALTER TABLE grants ADD COLUMN command TEXT");
  ensureIgnored(db);
  return db;
}

export function listGrants(db: DatabaseSync): Grant[] {
  return db.prepare("SELECT * FROM grants ORDER BY id").all().map((row) => toGrant(row as unknown as GrantSql));
}

type GrantWrite = { agent: string; path: string; access: Access; source: "leash" | "config"; createdAt: number; expiresAt: number | null; command?: string | null };

export function insertGrant(db: DatabaseSync, grant: GrantWrite): number {
  const result = db
    .prepare("INSERT INTO grants (agent, path, access, source, created_at, expires_at, command) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(grant.agent, grant.path, grant.access, grant.source, grant.createdAt, grant.expiresAt, grant.command ?? null);
  return Number(result.lastInsertRowid);
}

export function upsertGrant(db: DatabaseSync, grant: GrantWrite): number {
  const existing = db
    .prepare("SELECT id, created_at, expires_at FROM grants WHERE agent = ? AND path = ? AND access = ? AND source = ? AND command IS NULL ORDER BY id LIMIT 1")
    .get(grant.agent, grant.path, grant.access, grant.source) as { id: number; created_at: number; expires_at: number | null } | undefined;
  if (!existing) return insertGrant(db, grant);
  const expiresAt = existing.expires_at === null || grant.expiresAt === null ? null : Math.max(existing.expires_at, grant.expiresAt);
  if (expiresAt === existing.expires_at) return existing.id;
  db.prepare("UPDATE grants SET created_at = ?, expires_at = ? WHERE id = ?").run(grant.createdAt, expiresAt, existing.id);
  return existing.id;
}

export function upsertCommandGrant(db: DatabaseSync, grant: { agent: string; command: string; createdAt: number; expiresAt: number | null }): number {
  const existing = db
    .prepare("SELECT id, created_at, expires_at FROM grants WHERE agent = ? AND command = ? AND path = '' AND command IS NOT NULL AND access = 'write' AND source = 'leash' ORDER BY id LIMIT 1")
    .get(grant.agent, grant.command) as { id: number; created_at: number; expires_at: number | null } | undefined;
  if (!existing) {
    return insertGrant(db, { agent: grant.agent, path: "", access: "write", source: "leash", createdAt: grant.createdAt, expiresAt: grant.expiresAt, command: grant.command });
  }
  const expiresAt = existing.expires_at === null || grant.expiresAt === null ? null : Math.max(existing.expires_at, grant.expiresAt);
  if (expiresAt === existing.expires_at) return existing.id;
  db.prepare("UPDATE grants SET created_at = ?, expires_at = ? WHERE id = ?").run(existing.created_at, expiresAt, existing.id);
  return existing.id;
}

export function collapseGrantDupes(db: DatabaseSync): void {
  const groups = new Map<string, Grant[]>();
  for (const grant of listGrants(db)) {
    const key = `${grant.source}\0${grant.agent}\0${grant.access}\0${grant.path}\0${grant.command ?? ""}`;
    const group = groups.get(key);
    if (group) group.push(grant);
    else groups.set(key, [grant]);
  }
  const update = db.prepare("UPDATE grants SET expires_at = ? WHERE id = ?");
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep = group.reduce((a, b) => (a.id < b.id ? a : b));
    const expiresAt = group.some((grant) => grant.expiresAt === null) ? null : Math.max(...group.map((grant) => grant.expiresAt ?? 0));
    if (keep.expiresAt !== expiresAt) update.run(expiresAt, keep.id);
    for (const grant of group) if (grant.id !== keep.id) deleteGrant(db, grant.id);
  }
}

export function listScheduled(db: DatabaseSync): ScheduledRevoke[] {
  const rows = db.prepare("SELECT path, due_at FROM scheduled_revokes ORDER BY due_at").all() as unknown as { path: string; due_at: number }[];
  return rows.map((row) => ({ path: row.path, dueAt: row.due_at }));
}

export function scheduleRevoke(db: DatabaseSync, path: string, dueAt: number): void {
  db.prepare("INSERT INTO scheduled_revokes (path, due_at) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET due_at = excluded.due_at").run(path, dueAt);
}

export function cancelScheduled(db: DatabaseSync, path: string): void {
  db.prepare("DELETE FROM scheduled_revokes WHERE path = ?").run(path);
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

function ruleRows(db: DatabaseSync): AllowRule[] {
  const rows = db.prepare("SELECT id, kind, agent, value, created_at FROM rules ORDER BY id").all() as {
    id: number;
    kind: AllowRule["kind"];
    agent: AllowRule["agent"];
    value: string;
    created_at: number;
  }[];
  return rows.map((row) => ({ id: row.id, kind: row.kind, agent: row.agent, value: row.value, createdAt: row.created_at }));
}

export function listRules(db: DatabaseSync): AllowRule[] {
  return ruleRows(db);
}

export function createRule(db: DatabaseSync, input: { kind: unknown; agent: unknown; value: unknown }, home: string, now: number): { rules: AllowRule[]; error: string | null } {
  const parsed = validateRule(input, home);
  if (!parsed.ok) return { rules: ruleRows(db), error: parsed.error };
  if (ruleRows(db).some((rule) => rule.kind === parsed.kind && rule.agent === parsed.agent && rule.value === parsed.value)) {
    return { rules: ruleRows(db), error: "Already in the allow list." };
  }
  db.prepare("INSERT INTO rules (kind, agent, value, created_at) VALUES (?, ?, ?, ?)").run(parsed.kind, parsed.agent, parsed.value, now);
  return { rules: ruleRows(db), error: null };
}

export function updateRule(db: DatabaseSync, id: number, input: { kind: unknown; agent: unknown; value: unknown }, home: string, now: number): { rules: AllowRule[]; error: string | null } {
  const parsed = validateRule(input, home);
  if (!parsed.ok) return { rules: ruleRows(db), error: parsed.error };
  const rows = ruleRows(db);
  if (!rows.some((rule) => rule.id === id)) return { rules: rows, error: "That rule is gone." };
  if (rows.some((rule) => rule.id !== id && rule.kind === parsed.kind && rule.agent === parsed.agent && rule.value === parsed.value)) {
    return { rules: rows, error: "Already in the allow list." };
  }
  db.prepare("UPDATE rules SET kind = ?, agent = ?, value = ?, created_at = ? WHERE id = ?").run(parsed.kind, parsed.agent, parsed.value, now, id);
  return { rules: ruleRows(db), error: null };
}

export function deleteRule(db: DatabaseSync, id: number): AllowRule[] {
  db.prepare("DELETE FROM rules WHERE id = ?").run(id);
  return ruleRows(db);
}

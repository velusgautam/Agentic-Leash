import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { isClaudeBinary, TCC_CLIENTS, TCC_LABELS } from "../shared/constants";
import type { AgentSnapshot } from "../shared/types";

export function tccRows(rows: { service: string; client: string; auth_value: number }[]): AgentSnapshot["privacy"] {
  const known = new Set(TCC_CLIENTS.map((client) => client.bundleId));
  return rows
    .filter((row) => known.has(row.client) || isClaudeBinary(row.client))
    .map((row) => ({ service: row.service, client: row.client, authValue: row.auth_value, bundleId: row.client, via: TCC_LABELS[row.client] ?? (isClaudeBinary(row.client) ? "claude binary" : undefined) }));
}

export function readTcc(dbPath: string): AgentSnapshot["privacy"] {
  if (!existsSync(dbPath)) return [];
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare("SELECT service, client, auth_value FROM access").all() as unknown as { service: string; client: string; auth_value: number }[];
    db.close();
    return tccRows(rows);
  } catch {
    return [];
  }
}

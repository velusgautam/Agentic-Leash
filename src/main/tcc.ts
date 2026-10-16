import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { TCC_CLIENTS } from "../shared/constants";
import type { AgentSnapshot } from "../shared/types";

export function readTcc(dbPath: string): AgentSnapshot["privacy"] {
  if (!existsSync(dbPath)) return [];
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare("SELECT service, client, auth_value FROM access").all() as unknown as { service: string; client: string; auth_value: number }[];
    db.close();
    const known = new Set(TCC_CLIENTS.map((client) => client.bundleId));
    return rows
      .filter((row) => known.has(row.client))
      .map((row) => ({ service: row.service, client: row.client, authValue: row.auth_value, bundleId: row.client }));
  } catch {
    return [];
  }
}

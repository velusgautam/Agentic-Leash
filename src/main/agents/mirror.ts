import type { AgentSnapshot, Grant } from "../../shared/types";
import { isConcretePath, normalise } from "../../shared/paths";
import type { DatabaseSync } from "node:sqlite";
import { deleteGrants, insertGrant } from "../../shared/db";

export function configGrantRows(snapshots: AgentSnapshot[], home: string, now: number): Omit<Grant, "id">[] {
  const rows: Omit<Grant, "id">[] = [];
  for (const snapshot of snapshots) {
    if (snapshot.enforcement === "monitor-only" && snapshot.id !== "claude-code" && snapshot.id !== "cursor") continue;
    for (const folder of snapshot.folders) {
      if (folder.locked || !isConcretePath(folder.path)) continue;
      rows.push({ agent: snapshot.id, path: normalise(folder.path, home, home), access: folder.access, source: "config", createdAt: now, expiresAt: null, command: null });
    }
  }
  return rows;
}

export function mirrorConfigGrants(db: DatabaseSync, snapshots: AgentSnapshot[], home: string, now: number): void {
  deleteGrants(db, "source = ?", "config");
  for (const row of configGrantRows(snapshots, home, now)) insertGrant(db, row);
}

import { DECISION_RETENTION_MS } from "../shared/constants";
import { deleteGrants, listGrants, pruneDecisions } from "../shared/db";
import type { DatabaseSync } from "node:sqlite";
import type { Grant } from "../shared/types";

export function expireLeashGrants(db: DatabaseSync, now: number): Grant[] {
  const expired = listGrants(db).filter((grant) => grant.source === "leash" && grant.expiresAt !== null && grant.expiresAt <= now);
  if (expired.length) deleteGrants(db, "source = 'leash' AND expires_at IS NOT NULL AND expires_at <= ?", now);
  return expired;
}

export function pruneOldDecisions(db: DatabaseSync, now: number): number {
  return pruneDecisions(db, now - DECISION_RETENTION_MS);
}

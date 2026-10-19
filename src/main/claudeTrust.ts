import { existsSync, readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { cancelScheduled, listScheduled } from "../shared/db";
import { writeWithBackup } from "./backup";

export interface ClaudeConfig {
  projects?: Record<string, { hasTrustDialogAccepted?: boolean }>;
}

export function clearClaudeTrust(json: ClaudeConfig, path: string): boolean {
  const project = json.projects?.[path];
  if (!project?.hasTrustDialogAccepted) return false;
  project.hasTrustDialogAccepted = false;
  return true;
}

export function revokeClaudeTrust(file: string, path: string): boolean {
  if (!existsSync(file)) return false;
  const json = JSON.parse(readFileSync(file, "utf8")) as ClaudeConfig;
  if (!clearClaudeTrust(json, path)) return false;
  writeWithBackup(file, `${JSON.stringify(json, null, 2)}\n`);
  return true;
}

export function applyDueClaudeTrust(db: DatabaseSync, file: string, now: number): string[] {
  const due = listScheduled(db).filter((row) => row.dueAt <= now);
  if (!due.length) return [];
  if (!existsSync(file)) {
    for (const row of due) cancelScheduled(db, row.path);
    return [];
  }
  let json: ClaudeConfig;
  try {
    json = JSON.parse(readFileSync(file, "utf8")) as ClaudeConfig;
  } catch {
    return [];
  }
  let changed = false;
  for (const row of due) if (clearClaudeTrust(json, row.path)) changed = true;
  if (changed) writeWithBackup(file, `${JSON.stringify(json, null, 2)}\n`);
  for (const row of due) cancelScheduled(db, row.path);
  return due.map((row) => row.path);
}

import { existsSync, readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { getSetting, listGrants, setSetting } from "../shared/db";
import type { Grant } from "../shared/types";
import { normalise } from "../shared/paths";
import { readJson } from "./agents/fs";
import { writeWithBackup } from "./backup";

export interface LeashRules {
  additionalDirectories: string[];
  deny: string[];
}

const LOCKDOWN_DENY = ["Read", "Edit", "Write", "Bash", "WebFetch", "WebSearch", "mcp__*"];
const SENSITIVE_DENY = ["Read(//Users/*/.ssh/**)", "Read(//Users/*/.aws/**)", "Read(**/.env*)", "Read(~/Library/Keychains/**)"];

export function rulesForGrants(grants: Grant[], lockdown: boolean, home: string): LeashRules {
  const additionalDirectories = grants
    .filter((grant) => grant.source === "leash" && (grant.agent === "claude-code" || grant.agent === "*"))
    .map((grant) => normalise(grant.path, home, home));
  const deny = [...SENSITIVE_DENY];
  if (lockdown) deny.push(...LOCKDOWN_DENY);
  return { additionalDirectories: [...new Set(additionalDirectories)], deny };
}

type Settings = { permissions?: { allow?: string[]; deny?: string[]; additionalDirectories?: string[] }; hooks?: unknown };

export function applyRules(settings: Settings, next: LeashRules, previous: LeashRules): Settings {
  const permissions = { ...(settings.permissions ?? {}) };
  const dirs = new Set(permissions.additionalDirectories ?? []);
  for (const dir of previous.additionalDirectories) dirs.delete(dir);
  for (const dir of next.additionalDirectories) dirs.add(dir);
  const deny = (permissions.deny ?? []).filter((rule) => !previous.deny.includes(rule));
  for (const rule of next.deny) if (!deny.includes(rule)) deny.push(rule);
  return { ...settings, permissions: { ...permissions, additionalDirectories: [...dirs], deny } };
}

export function stripRules(settings: Settings, previous: LeashRules): Settings {
  return applyRules(settings, { additionalDirectories: [], deny: [] }, previous);
}

export type ClaudeMode = "hook" | "rules";

export function publishClaudeRules(db: DatabaseSync, settingsPath: string, home: string, rulesMode: boolean, now = Date.now()): void {
  const previous = JSON.parse(getSetting(db, "leash_rules", '{"additionalDirectories":[],"deny":[]}')) as LeashRules;
  const live = listGrants(db).filter((grant) => grant.expiresAt === null || grant.expiresAt > now);
  const next = rulesMode ? rulesForGrants(live, getSetting(db, "lockdown", "0") === "1", home) : { additionalDirectories: [] as string[], deny: [] as string[] };
  const dirty = next.additionalDirectories.length + next.deny.length + previous.additionalDirectories.length + previous.deny.length > 0;
  if (!dirty) return;
  const updated = applyRules((existsSync(settingsPath) ? readJson(settingsPath) : {}) as Settings, next, previous);
  const text = `${JSON.stringify(updated, null, 2)}\n`;
  if (!existsSync(settingsPath) || readFileSync(settingsPath, "utf8") !== text) writeWithBackup(settingsPath, text);
  setSetting(db, "leash_rules", JSON.stringify(next));
}

export function migratedRules(prev: ClaudeMode, next: ClaudeMode, live: Grant[], lockdown: boolean, home: string, previous: LeashRules): { write: LeashRules; clear: boolean } {
  if (prev === "hook" && next === "rules") return { write: rulesForGrants(live, lockdown, home), clear: false };
  if (prev === "rules" && next === "hook") return { write: { additionalDirectories: [], deny: [] }, clear: true };
  if (next === "rules") return { write: rulesForGrants(live, lockdown, home), clear: false };
  return { write: previous, clear: false };
}

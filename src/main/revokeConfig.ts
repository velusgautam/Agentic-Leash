import { existsSync } from "node:fs";
import { join } from "node:path";
import { normalise } from "../shared/paths";
import type { Grant } from "../shared/types";
import { readJson } from "./agents/fs";
import { writeWithBackup } from "./backup";
import { revokeClaudeTrust } from "./claudeTrust";

function samePath(rule: string, path: string, home: string): boolean {
  const match = /^(?:Read|Write)\((.*)\)$/.exec(rule);
  return Boolean(match && normalise(match[1]!, home, home) === path);
}

export function removeCursorPath(file: string, path: string, home: string): boolean {
  if (!existsSync(file)) return false;
  const json = readJson(file) as { permissions?: { allow?: string[]; deny?: string[] } };
  const allow = json.permissions?.allow ?? [];
  const deny = json.permissions?.deny ?? [];
  const nextAllow = allow.filter((rule) => !samePath(rule, path, home));
  const nextDeny = deny.filter((rule) => !samePath(rule, path, home));
  if (nextAllow.length === allow.length && nextDeny.length === deny.length) return false;
  writeWithBackup(file, `${JSON.stringify({ ...json, permissions: { ...json.permissions, allow: nextAllow, deny: nextDeny } }, null, 2)}\n`);
  return true;
}

export function revokeStoredGrant(home: string, grant: Grant): boolean {
  if (grant.source === "leash") return true;
  if (grant.agent === "claude-code" || grant.agent === "*") return revokeClaudeTrust(join(home, ".claude.json"), grant.path);
  if (grant.agent === "cursor") return removeCursorPath(join(home, ".cursor/cli-config.json"), grant.path, home);
  return false;
}

import type { ApprovalRow } from "./db";
import type { Grant, RuleSuggestion } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SUGGEST_WINDOW_MS = 14 * DAY_MS;
const MIN_COUNT = 3;
const MAX_SUGGESTIONS = 5;

export function suggestionKey(row: { agent: string; access: string; path: string | null; command: string | null }): string {
  return `${row.agent}|${row.access}|${row.path ?? ""}|${row.command ?? ""}`;
}

export function suggestRules(approvals: ApprovalRow[], grants: Grant[], dismissed: string[], now: number): RuleSuggestion[] {
  const skip = new Set(dismissed);
  const forever = grants.filter((grant) => grant.expiresAt === null);
  const groups = new Map<string, RuleSuggestion>();
  for (const row of approvals) {
    if (row.ttlSeconds === null || row.ts < now - SUGGEST_WINDOW_MS || (!row.path && !row.command)) continue;
    const key = suggestionKey(row);
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      group.lastAt = Math.max(group.lastAt, row.ts);
    } else groups.set(key, { key, agent: row.agent, path: row.path ?? null, command: row.command ?? null, access: row.access, count: 1, lastAt: row.ts });
  }
  const covered = (item: RuleSuggestion) =>
    forever.some((grant) => (grant.agent === item.agent || grant.agent === "*") && (item.command ? grant.command === item.command : !grant.command && grant.path === item.path && (grant.access === "write" || grant.access === item.access)));
  return [...groups.values()]
    .filter((item) => item.count >= MIN_COUNT && !skip.has(item.key) && !covered(item))
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, MAX_SUGGESTIONS);
}

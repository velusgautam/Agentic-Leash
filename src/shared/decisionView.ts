import type { DecisionRow } from "./types";

export function decisionTarget(row: Pick<DecisionRow, "paths" | "command" | "url">): string {
  if (row.command) return row.command;
  if (row.url) return row.url;
  try {
    const parsed: unknown = JSON.parse(row.paths);
    if (Array.isArray(parsed)) return parsed.map(String).join(", ");
  } catch {
    /* fall through to the raw string */
  }
  return row.paths;
}

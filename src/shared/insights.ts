import type { DecisionStat } from "./db";
import type { Grant, HistoryRow } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const UNUSED_AFTER_MS = 30 * 60 * 1000;
const STALE_AFTER_MS = 14 * DAY_MS;

export interface DayStat {
  day: number;
  auto: number;
  prompted: number;
  blocked: number;
}

export interface AgentStat {
  agent: string;
  auto: number;
  prompted: number;
  denied: number;
  timedOut: number;
  secret: number;
  folders: { path: string; count: number }[];
}

export interface UnusedGrant {
  id: number;
  agent: string;
  target: string;
  command: boolean;
  createdAt: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
}

export interface Insights {
  from: number;
  days: DayStat[];
  promptsToday: number;
  promptsPerDay: number;
  autoShare: number | null;
  medianWaitMs: number | null;
  blocked: number;
  secretTouches: number;
  agents: AgentStat[];
  unused: UnusedGrant[];
  alerts: HistoryRow[];
}

function startOfDay(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** The project-sized folder a path belongs to: `~/a/b` under home, otherwise `/a/b`. */
export function folderOf(path: string, home: string): string {
  const inside = path.startsWith(`${home}/`);
  const parts = (inside ? path.slice(home.length) : path).split("/").filter(Boolean);
  const keep = parts.slice(0, Math.min(2, Math.max(1, parts.length - 1)));
  return inside ? `~/${keep.join("/")}` : `/${keep.join("/")}`;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function parsePaths(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function buildInsights(input: { decisions: DecisionStat[]; grants: Grant[]; alerts: HistoryRow[]; now: number; days: number; home: string }): Insights {
  const { decisions, grants, now, home } = input;
  const today = startOfDay(now);
  const from = today - (input.days - 1) * DAY_MS;
  const days: DayStat[] = Array.from({ length: input.days }, (_, index) => ({ day: from + index * DAY_MS, auto: 0, prompted: 0, blocked: 0 }));
  const agents = new Map<string, AgentStat & { folderCounts: Map<string, number> }>();
  const waits: number[] = [];
  let blocked = 0;
  let secretTouches = 0;
  let auto = 0;
  let total = 0;

  for (const row of decisions) {
    if (row.ts < from) continue;
    const day = days[Math.floor((startOfDay(row.ts) - from) / DAY_MS)];
    const stat = agents.get(row.agent) ?? { agent: row.agent, auto: 0, prompted: 0, denied: 0, timedOut: 0, secret: 0, folders: [], folderCounts: new Map() };
    agents.set(row.agent, stat);
    const isBlocked = row.verdict === "deny" || row.verdict === "timeout";
    total += 1;
    if (row.prompted) {
      stat.prompted += 1;
      if (day) day.prompted += 1;
      if (row.durationMs != null) waits.push(row.durationMs);
    } else if (!isBlocked) {
      stat.auto += 1;
      auto += 1;
      if (day) day.auto += 1;
    }
    if (isBlocked) {
      blocked += 1;
      if (day) day.blocked += 1;
    }
    if (row.verdict === "deny") stat.denied += 1;
    if (row.verdict === "timeout") stat.timedOut += 1;
    if (row.secret) {
      stat.secret += 1;
      secretTouches += 1;
    }
    for (const folder of new Set(parsePaths(row.paths).map((path) => folderOf(path, home)))) stat.folderCounts.set(folder, (stat.folderCounts.get(folder) ?? 0) + 1);
  }

  const unused: UnusedGrant[] = grants
    .filter((grant) => grant.source === "leash" && (grant.expiresAt === null || grant.expiresAt > now))
    .filter((grant) => (grant.lastUsedAt == null ? grant.createdAt < now - UNUSED_AFTER_MS : grant.expiresAt === null && grant.lastUsedAt < now - STALE_AFTER_MS))
    .map((grant) => ({ id: grant.id, agent: grant.agent, target: grant.command ?? grant.path, command: grant.command != null, createdAt: grant.createdAt, expiresAt: grant.expiresAt, lastUsedAt: grant.lastUsedAt ?? null }))
    .sort((a, b) => a.createdAt - b.createdAt);

  const prompts = days.reduce((sum, day) => sum + day.prompted, 0);
  return {
    from,
    days,
    promptsToday: days.at(-1)?.prompted ?? 0,
    promptsPerDay: Math.round((prompts / input.days) * 10) / 10,
    autoShare: total ? auto / total : null,
    medianWaitMs: median(waits),
    blocked,
    secretTouches,
    agents: [...agents.values()]
      .map(({ folderCounts, ...stat }) => ({
        ...stat,
        folders: [...folderCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([path, count]) => ({ path, count })),
      }))
      .sort((a, b) => b.auto + b.prompted - (a.auto + a.prompted)),
    unused,
    alerts: input.alerts,
  };
}

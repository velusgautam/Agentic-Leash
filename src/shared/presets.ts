import type { PresetId } from "./types";

export const SESSION_IDLE_S = 30 * 60;
export const SESSION_MAX_S = 12 * 60 * 60;
export const END_OF_DAY_HOUR = 19;

// Popup choices are Once, This session, Today, Always in repo, and 15 min for personal folders.
// 1 hour, 8 hours and Always stay for the Access page and older callers.
export const APPROVAL_PRESETS: { id: PresetId; label: string; seconds: number | null; hint: string }[] = [
  { id: "once", label: "Once", seconds: 0, hint: "Only this call. Nothing is saved." },
  { id: "15m", label: "15 min", seconds: 15 * 60, hint: "For the next 15 minutes." },
  { id: "session", label: "This session", seconds: SESSION_IDLE_S, hint: "Until the agent is idle for 30 minutes, at most 12 hours." },
  { id: "1h", label: "1 hour", seconds: 60 * 60, hint: "For the next hour." },
  { id: "today", label: "Today", seconds: null, hint: "Until your end of day." },
  { id: "8h", label: "8 hours", seconds: 8 * 60 * 60, hint: "For the next 8 hours." },
  { id: "repo", label: "Always in repo", seconds: null, hint: "This repo, with no time limit. Secrets and startup files in it still ask." },
  { id: "always", label: "Always", seconds: null, hint: "No time limit." },
];

/** Shortest to longest, so a choice can be clamped down to the nearest one allowed. */
export const PRESET_ORDER: PresetId[] = APPROVAL_PRESETS.map((preset) => preset.id);

export function presetById(id: PresetId) {
  return APPROVAL_PRESETS.find((preset) => preset.id === id)!;
}

export function isPresetId(value: unknown): value is PresetId {
  return APPROVAL_PRESETS.some((preset) => preset.id === value);
}

/** Older callers send seconds. Map them to the preset with that length. */
export function presetFromSeconds(seconds: number | null): PresetId {
  if (seconds === null) return "always";
  if (seconds <= 0) return "once";
  return APPROVAL_PRESETS.find((preset) => preset.id !== "session" && preset.seconds === seconds)?.id ?? "1h";
}

/** When "Today" ends: the end-of-day hour, or midnight once that hour has passed. */
export function todayExpiry(now: number, hour = END_OF_DAY_HOUR): number {
  const end = new Date(now);
  end.setHours(hour, 0, 0, 0);
  if (end.getTime() > now) return end.getTime();
  end.setHours(24, 0, 0, 0);
  return end.getTime();
}

export const repoName = (repo: string | null) => repo?.split(/[\\/]/).filter(Boolean).pop() ?? "repo";

export function presetLabel(id: PresetId, repo: string | null = null): string {
  return id === "repo" ? `Always in ${repoName(repo)}` : presetById(id).label;
}

/** Button text for a choice: "Allow once", "Allow this session", "Always in agentic-leash". */
export function allowText(id: PresetId, repo: string | null = null): string {
  if (id === "repo") return presetLabel(id, repo);
  if (id === "once") return "Allow once";
  if (id === "session") return "Allow this session";
  if (id === "today") return "Allow today";
  if (id === "always") return "Allow always";
  return `Allow ${presetById(id).label}`;
}

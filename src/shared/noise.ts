import { matchesIgnored } from "./ignored";

// Agent machinery and OS scratch. A sensitive path stays visible even inside one of these.
const DIRS = [
  "/.git",
  "/node_modules",
  "/.cache",
  "/Library/Caches",
  "/Library/Logs",
  "/private/var/folders",
  "/var/folders",
  "/.claude/projects",
  "/.claude/plugins",
  "/.claude/debug",
  "/.claude/cache",
  "/.claude/statsig",
  "/.claude/telemetry",
  "/.claude/shell-snapshots",
  "/.claude/todos",
  "/.claude/session-env",
  "/.claude/ide",
  "/.claude/skills/synced",
  "/.cursor/projects",
  "/.cursor/ai-tracking",
  "/Cursor/logs",
  "/Cursor/Cache",
  "/Cursor/CachedData",
  "/.npm/_logs",
  "/.npm/_cacache",
  "/agent-transcripts",
  "/.codex/sessions",
  "/.gemini/tmp",
];

const PREFIXES = ["/dev/", "/tmp/", "/private/tmp/", "/System/", "/usr/lib/", "/usr/share/"];

const NAMES = [".DS_Store", ".last-complete-round", ".localized"];

const SUFFIXES = [".tmp", ".temp", ".swp", ".swo"];

const JUNK_PREFIXES = ["/dev/"];

function base(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function personal(path: string): boolean {
  const name = base(path);
  if (name === ".env" || name.startsWith(".env.")) return true;
  return ["/.ssh/", "/.aws/", "/.gnupg/", "/Library/Keychains/", "/.kube/"].some((part) => path.includes(part));
}

function scratch(path: string): boolean {
  if (PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (DIRS.some((dir) => path.includes(`${dir}/`) || path.endsWith(dir))) return true;
  const name = base(path);
  if (NAMES.includes(name) || name.endsWith("~")) return true;
  const lower = name.toLowerCase();
  return SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

export function isNoise(path: string): boolean {
  return !personal(path) && scratch(path);
}

export function isJunk(path: string): boolean {
  if (JUNK_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  const name = base(path);
  if (NAMES.includes(name) || name.endsWith("~")) return true;
  const lower = name.toLowerCase();
  return SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function tmpPath(path: string): boolean {
  return path === "/tmp" || path === "/private/tmp" || path.startsWith("/tmp/") || path.startsWith("/private/tmp/");
}

export function eventBucket(event: { kind: string; path: string; destPath?: string | null }, ignored: readonly string[] = []): "main" | "noise" | "drop" {
  if (event.kind === "net") return "main";
  if (ignored.some((prefix) => matchesIgnored(event.path, prefix) || (event.destPath ? matchesIgnored(event.destPath, prefix) : false))) return "drop";
  if (personal(event.path) || (event.destPath ? personal(event.destPath) : false)) return "main";
  if (isJunk(event.path)) return "drop";
  if (!isNoise(event.path)) return "main";
  if (event.kind === "read") return tmpPath(event.path) ? "noise" : "drop";
  return "noise";
}

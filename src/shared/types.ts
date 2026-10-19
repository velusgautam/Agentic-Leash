export type AgentId = "claude-code" | "cursor" | "t3-code" | "codex" | "gemini";
export type Access = "read" | "write";
export type Enforcement = "hook" | "rules" | "monitor-only";
export type ThemeSource = "system" | "light" | "dark";

export interface Grant {
  id: number;
  agent: AgentId | "*";
  path: string;
  access: Access;
  source: "leash" | "config";
  createdAt: number;
  expiresAt: number | null;
}

export interface ScheduledRevoke {
  path: string;
  dueAt: number;
}

export interface HookRequest {
  agent: "claude-code" | "cursor" | "codex";
  event: string;
  tool: string;
  access: Access;
  paths: string[];
  cwd: string;
  url?: string;
  command?: string;
  sessionId?: string;
}

export type Verdict = { kind: "pass" } | { kind: "deny"; reason: string } | { kind: "prompt" };

export interface DecideOptions {
  now: number;
  lockdown: boolean;
  protectedRoots: string[];
  home?: string;
  autoAllowOff?: string[];
}

export interface HistoryEvent {
  ts: number;
  agent: AgentId | "unknown";
  pid: number;
  exe: string;
  kind: "read" | "write" | "create" | "delete" | "rename" | "exec" | "net";
  path: string;
  destPath?: string;
  sha256?: string;
  beforeBlob?: string;
  afterBlob?: string;
  sensitive: boolean;
  source: "eslogger" | "hook" | "net";
}

export interface AgentSnapshot {
  id: AgentId;
  name: string;
  installed: boolean;
  enforcement: Enforcement;
  note?: string;
  folders: { path: string; access: Access; source: string; locked: boolean }[];
  mcpServers: { name: string; url?: string; command?: string; source: string; locked: boolean }[];
  network: { rule: string; effect: "allow" | "deny"; source: string; locked: boolean }[];
  children: AgentId[];
  workers: string[];
  privacy: { service: string; client: string; authValue: number; bundleId: string; via?: string }[];
}

export interface DecisionRow {
  id: number;
  ts: number;
  agent: string;
  tool: string;
  paths: string;
  verdict: string;
  reason: string | null;
  grantId: number | null;
  durationMs: number | null;
}

export interface HistoryRow {
  id: number;
  ts: number;
  agent: string;
  exe: string;
  kind: string;
  path: string;
  destPath: string | null;
  sensitive: boolean;
  beforeText: string | null;
  afterText: string | null;
}

export interface PendingRequest {
  id: string;
  request: HookRequest;
}

export interface Diagnostics {
  hooks: { agent: string; label: string; status: "installed" | "missing" | "none" }[];
  helperStatus: string;
  lastSweep: string | null;
  hookP50Ms: number | null;
  hookP95Ms: number | null;
  lastDecision: { ts: number; agent: string; tool: string; verdict: string; reason: string | null } | null;
  errors: string[];
}

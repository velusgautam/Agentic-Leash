import type { AutoAllow } from "./autoAllow";
import type { IgnoredRow } from "./ignored";
import type { SetupStatus } from "./setup";
import type { Access, AgentId, AgentSnapshot, AllowRule, DecisionRow, Diagnostics, Grant, HistoryRow, PendingRequest, ScheduledRevoke, ThemeSource } from "./types";

export interface OpenAtLoginState {
  enabled: boolean;
  available: boolean;
}

export interface LeashBridge {
  platform: string;
  getOpenAtLogin(): Promise<OpenAtLoginState>;
  setOpenAtLogin(enabled: boolean): Promise<OpenAtLoginState>;
  listAgents(): Promise<AgentSnapshot[]>;
  listGrants(): Promise<Grant[]>;
  revokeGrant(id: number): Promise<void>;
  revokeAll(): Promise<{ revoked: number }>;
  grantStatus(): Promise<{ count: number; lockdown: boolean }>;
  createGrant(input: { agent: AgentId | "*"; path: string; access: Access; ttlSeconds: number | null }): Promise<void>;
  listAutoAllows(): Promise<(AutoAllow & { enabled: boolean })[]>;
  setAutoAllow(id: string, enabled: boolean): Promise<(AutoAllow & { enabled: boolean })[]>;
  listRules(): Promise<AllowRule[]>;
  createRule(input: { kind: AllowRule["kind"]; agent: AllowRule["agent"]; value: string }): Promise<{ rules: AllowRule[]; error: string | null }>;
  updateRule(id: number, input: { kind: AllowRule["kind"]; agent: AllowRule["agent"]; value: string }): Promise<{ rules: AllowRule[]; error: string | null }>;
  deleteRule(id: number): Promise<AllowRule[]>;
  unlock(): Promise<void>;
  listDecisions(): Promise<DecisionRow[]>;
  listHistory(): Promise<HistoryRow[]>;
  queryHistory(filter: { from: number | null; to: number | null; agents: string[]; path: string; kind: string; sensitive: boolean; includeNoise?: boolean; offset: number; limit: number }): Promise<{ rows: HistoryRow[]; total: number }>;
  historyRetention(): Promise<{ main: number; noise: number }>;
  setHistoryRetention(which: "main" | "noise", days: number): Promise<{ main: number; noise: number }>;
  listIgnored(): Promise<IgnoredRow[]>;
  setIgnored(id: number, enabled: boolean): Promise<IgnoredRow[]>;
  addIgnored(prefix: string): Promise<{ rows: IgnoredRow[]; added: boolean }>;
  deleteIgnored(id: number): Promise<IgnoredRow[]>;
  historyText(id: number): Promise<{ before: string | null; after: string | null }>;
  listPending(): Promise<PendingRequest[]>;
  decidePending(id: string, decision: "allow" | "deny", ttlSeconds: number | null, scopePath?: string): Promise<void>;
  closeApproval(): Promise<void>;
  restartNeeded(): Promise<{ name: string; kind: "gui" | "cli"; count: number }[]>;
  restartAgents(): Promise<void>;
  dismissRestart(): Promise<void>;
  hooksInstalled(): Promise<boolean>;
  installHooks(agent: "claude-code" | "cursor" | "codex" | "gemini" | "hermes"): Promise<void>;
  uninstallHooks(agent: "claude-code" | "cursor" | "codex" | "gemini" | "hermes"): Promise<void>;
  setup(): Promise<SetupStatus>;
  setAgentEnabled(id: AgentId, enabled: boolean): Promise<void>;
  diagnostics(): Promise<Diagnostics>;
  getTheme(): Promise<ThemeSource>;
  setTheme(theme: ThemeSource): Promise<ThemeSource>;
  onTheme(listener: (theme: ThemeSource) => void): () => void;
  onGrantStatus(listener: (status: { count: number; lockdown: boolean }) => void): () => void;
  resetTcc(service: string, bundleId: string): Promise<void>;
  removeMcp(agent: AgentId, name: string): Promise<void>;
  scheduledRevokes(): Promise<ScheduledRevoke[]>;
  revokeTrust(path: string): Promise<void>;
  scheduleTrust(path: string, dueAt: number): Promise<void>;
  cancelTrust(path: string): Promise<void>;
  onboardingDone(): Promise<boolean>;
  setOnboarding(done: boolean): Promise<void>;
  installHelper(): Promise<void>;
  uninstallApp(): Promise<void>;
  takeNav(): Promise<string | null>;
  onNavigate(listener: () => void): () => void;
  fullDiskAccess(): Promise<boolean>;
  openFullDiskAccess(): Promise<void>;
}

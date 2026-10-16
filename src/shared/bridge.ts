import type { Access, AgentId, AgentSnapshot, DecisionRow, Diagnostics, Grant, HistoryRow, PendingRequest, ThemeSource } from "./types";

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
  revokeAll(): Promise<void>;
  createGrant(input: { agent: AgentId | "*"; path: string; access: Access; ttlSeconds: number | null }): Promise<void>;
  unlock(): Promise<void>;
  listDecisions(): Promise<DecisionRow[]>;
  listHistory(): Promise<HistoryRow[]>;
  listPending(): Promise<PendingRequest[]>;
  decidePending(id: string, decision: "allow" | "deny", ttlSeconds: number | null): Promise<void>;
  restartNeeded(): Promise<boolean>;
  restartAgents(): Promise<void>;
  hooksInstalled(): Promise<boolean>;
  installHooks(): Promise<boolean>;
  uninstallHooks(): Promise<void>;
  diagnostics(): Promise<Diagnostics>;
  getTheme(): Promise<ThemeSource>;
  setTheme(theme: ThemeSource): Promise<ThemeSource>;
  onTheme(listener: (theme: ThemeSource) => void): () => void;
  resetTcc(service: string, bundleId: string): Promise<void>;
  removeMcp(file: string, name: string): Promise<void>;
  onboardingDone(): Promise<boolean>;
  setOnboarding(done: boolean): Promise<void>;
  installHelper(): Promise<void>;
}

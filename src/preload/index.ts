import { contextBridge, ipcRenderer } from "electron";
import type { LeashBridge } from "../shared/bridge";
import type { ThemeSource } from "../shared/types";

const leash: LeashBridge = {
  platform: process.platform,
  getOpenAtLogin: () => ipcRenderer.invoke("login-item:get"),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke("login-item:set", enabled),
  listAgents: () => ipcRenderer.invoke("agents:list"),
  listGrants: () => ipcRenderer.invoke("grants:list"),
  revokeGrant: (id) => ipcRenderer.invoke("grants:revoke", id),
  revokeAll: () => ipcRenderer.invoke("grants:revoke-all"),
  grantStatus: () => ipcRenderer.invoke("grants:status"),
  createGrant: (input) => ipcRenderer.invoke("grants:create", input),
  listAutoAllows: () => ipcRenderer.invoke("auto-allow:list"),
  setAutoAllow: (id, enabled) => ipcRenderer.invoke("auto-allow:set", id, enabled),
  unlock: () => ipcRenderer.invoke("grants:unlock"),
  listDecisions: () => ipcRenderer.invoke("decisions:list"),
  listHistory: () => ipcRenderer.invoke("history:list"),
  queryHistory: (filter) => ipcRenderer.invoke("history:query", filter),
  historyRetention: () => ipcRenderer.invoke("history:retention:get"),
  setHistoryRetention: (which, days) => ipcRenderer.invoke("history:retention:set", which, days),
  historyText: (id) => ipcRenderer.invoke("history:text", id),
  listPending: () => ipcRenderer.invoke("approval:list"),
  decidePending: (id, decision, ttlSeconds, scopePath) => ipcRenderer.invoke("approval:decide", id, decision, ttlSeconds, scopePath),
  closeApproval: () => ipcRenderer.invoke("approval:close"),
  restartNeeded: () => ipcRenderer.invoke("runtime:restart-needed"),
  restartAgents: () => ipcRenderer.invoke("runtime:restart"),
  dismissRestart: () => ipcRenderer.invoke("runtime:dismiss-restart"),
  hooksInstalled: () => ipcRenderer.invoke("hooks:status"),
  installHooks: (agent) => ipcRenderer.invoke("hooks:install", agent),
  uninstallHooks: (agent) => ipcRenderer.invoke("hooks:uninstall", agent),
  setup: () => ipcRenderer.invoke("setup:get"),
  setAgentEnabled: (id, enabled) => ipcRenderer.invoke("agents:enabled", id, enabled),
  diagnostics: () => ipcRenderer.invoke("diagnostics:get"),
  getTheme: () => ipcRenderer.invoke("theme:get"),
  setTheme: (theme) => ipcRenderer.invoke("theme:set", theme),
  onTheme: (listener) => {
    const wrapped = (_event: unknown, theme: ThemeSource) => listener(theme);
    ipcRenderer.on("theme:changed", wrapped);
    return () => ipcRenderer.removeListener("theme:changed", wrapped);
  },
  resetTcc: (service, bundleId) => ipcRenderer.invoke("tcc:reset", service, bundleId),
  removeMcp: (agent, name) => ipcRenderer.invoke("agents:remove-mcp", agent, name),
  scheduledRevokes: () => ipcRenderer.invoke("trust:scheduled"),
  revokeTrust: (path) => ipcRenderer.invoke("trust:revoke", path),
  scheduleTrust: (path, dueAt) => ipcRenderer.invoke("trust:schedule", path, dueAt),
  cancelTrust: (path) => ipcRenderer.invoke("trust:cancel", path),
  onboardingDone: () => ipcRenderer.invoke("onboarding:get"),
  setOnboarding: (done) => ipcRenderer.invoke("onboarding:set", done),
  installHelper: () => ipcRenderer.invoke("helper:install"),
  uninstallApp: () => ipcRenderer.invoke("app:uninstall"),
  takeNav: () => ipcRenderer.invoke("nav:take"),
  onNavigate: (listener) => {
    const wrapped = () => listener();
    ipcRenderer.on("nav:open", wrapped);
    return () => ipcRenderer.removeListener("nav:open", wrapped);
  },
  fullDiskAccess: () => ipcRenderer.invoke("fda:status"),
  openFullDiskAccess: () => ipcRenderer.invoke("fda:open"),
};

contextBridge.exposeInMainWorld("leash", leash);

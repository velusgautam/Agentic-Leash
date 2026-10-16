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
  createGrant: (input) => ipcRenderer.invoke("grants:create", input),
  unlock: () => ipcRenderer.invoke("grants:unlock"),
  listDecisions: () => ipcRenderer.invoke("decisions:list"),
  listHistory: () => ipcRenderer.invoke("history:list"),
  listPending: () => ipcRenderer.invoke("approval:list"),
  decidePending: (id, decision, ttlSeconds) => ipcRenderer.invoke("approval:decide", id, decision, ttlSeconds),
  restartNeeded: () => ipcRenderer.invoke("runtime:restart-needed"),
  restartAgents: () => ipcRenderer.invoke("runtime:restart"),
  hooksInstalled: () => ipcRenderer.invoke("hooks:status"),
  installHooks: () => ipcRenderer.invoke("hooks:install"),
  uninstallHooks: () => ipcRenderer.invoke("hooks:uninstall"),
  diagnostics: () => ipcRenderer.invoke("diagnostics:get"),
  getTheme: () => ipcRenderer.invoke("theme:get"),
  setTheme: (theme) => ipcRenderer.invoke("theme:set", theme),
  onTheme: (listener) => {
    const wrapped = (_event: unknown, theme: ThemeSource) => listener(theme);
    ipcRenderer.on("theme:changed", wrapped);
    return () => ipcRenderer.removeListener("theme:changed", wrapped);
  },
  resetTcc: (service, bundleId) => ipcRenderer.invoke("tcc:reset", service, bundleId),
  removeMcp: (file, name) => ipcRenderer.invoke("agents:remove-mcp", file, name),
  onboardingDone: () => ipcRenderer.invoke("onboarding:get"),
  setOnboarding: (done) => ipcRenderer.invoke("onboarding:set", done),
  installHelper: () => ipcRenderer.invoke("helper:install"),
};

contextBridge.exposeInMainWorld("leash", leash);

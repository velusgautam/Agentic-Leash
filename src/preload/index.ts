import { contextBridge, ipcRenderer } from "electron";
import type { LeashBridge } from "../shared/bridge";

const leash: LeashBridge = {
  platform: process.platform,
  getOpenAtLogin: () => ipcRenderer.invoke("login-item:get"),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke("login-item:set", enabled),
};

contextBridge.exposeInMainWorld("leash", leash);

import { contextBridge } from "electron";
import type { LeashBridge } from "../shared/bridge";

const leash: LeashBridge = { platform: process.platform };

contextBridge.exposeInMainWorld("leash", leash);

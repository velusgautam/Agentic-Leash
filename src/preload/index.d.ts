import type { LeashBridge } from "../shared/bridge";

declare global {
  interface Window {
    leash: LeashBridge;
  }
}

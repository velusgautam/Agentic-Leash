import { useLeashData } from "~/hooks/useLeash";

const INITIAL = { count: 0, lockdown: false };
const load = () => window.leash.grantStatus();
const subscribe = (refresh: () => void) => window.leash.onGrantStatus(refresh);

export function useGrantStatus() {
  return useLeashData(load, subscribe, INITIAL, 5000);
}

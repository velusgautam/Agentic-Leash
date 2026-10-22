import { useEffect, useRef, useState } from "react";
import type { PendingRequest } from "../../../shared/types";

export function useLeashData<T>(load: () => Promise<T>, subscribe: ((refresh: () => void) => () => void) | null, initial: T, fallbackMs?: number): T {
  const [data, setData] = useState(initial);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let live = true;
    let latest = 0;
    const refresh = () => {
      const request = ++latest;
      void loadRef.current().then((value) => live && request === latest && setData(value)).catch(() => {});
    };
    refresh();
    const off = subscribe?.(refresh);
    const timer = fallbackMs ? window.setInterval(refresh, fallbackMs) : 0;
    return () => {
      live = false;
      off?.();
      window.clearInterval(timer);
    };
  }, [subscribe, fallbackMs]);
  return data;
}

const EMPTY_PENDING: PendingRequest[] = [];
export function usePending() {
  const [pending, setPending] = useState(EMPTY_PENDING);
  useEffect(() => {
    let live = true;
    let pushed = false;
    void window.leash.listPending().then((rows) => live && !pushed && setPending(rows));
    const off = window.leash.onPending((rows) => {
      pushed = true;
      setPending(rows);
    });
    return () => {
      live = false;
      off();
    };
  }, []);
  return pending;
}

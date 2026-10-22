import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { SetupStatus } from "../../../shared/setup";

interface SetupApi {
  status: SetupStatus | null;
  completedThisSession: boolean;
  busy: string | null;
  failed: string | null;
  refresh: () => void;
  run: (key: string, work: () => Promise<unknown>) => void;
}

const SetupContext = createContext<SetupApi | null>(null);

export function SetupProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [completedThisSession, setCompleted] = useState(false);
  const sawSetup = useRef(false);
  useEffect(() => {
    if (!status) return;
    if (!status.ready) sawSetup.current = true;
    else if (sawSetup.current) setCompleted(true);
  }, [status]);
  useEffect(() => {
    const tick = () => void window.leash.setup().then(setStatus);
    tick();
    const timer = window.setInterval(tick, 2000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  const refresh = () => void window.leash.setup().then(setStatus);
  const run = (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    setFailed(null);
    void Promise.resolve(work())
      .then(() => window.leash.setup())
      .then(setStatus)
      .catch(() => setFailed(key))
      .finally(() => setBusy((current) => (current === key ? null : current)));
  };
  return <SetupContext.Provider value={{ status, completedThisSession, busy, failed, refresh, run }}>{children}</SetupContext.Provider>;
}

export function useSetup(): SetupApi {
  const value = useContext(SetupContext);
  if (!value) throw new Error("useSetup requires SetupProvider");
  return value;
}

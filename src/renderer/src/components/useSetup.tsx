import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { SetupStatus } from "../../../shared/setup";

interface SetupApi {
  status: SetupStatus | null;
  busy: string | null;
  failed: string | null;
  run: (key: string, work: () => Promise<unknown>) => void;
}

const SetupContext = createContext<SetupApi | null>(null);

export function SetupProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
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
  const run = (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    setFailed(null);
    void Promise.resolve(work())
      .then(() => window.leash.setup())
      .then(setStatus)
      .catch(() => setFailed(key))
      .finally(() => setBusy((current) => (current === key ? null : current)));
  };
  return <SetupContext.Provider value={{ status, busy, failed, run }}>{children}</SetupContext.Provider>;
}

export function useSetup(): SetupApi {
  const value = useContext(SetupContext);
  if (!value) throw new Error("useSetup requires SetupProvider");
  return value;
}

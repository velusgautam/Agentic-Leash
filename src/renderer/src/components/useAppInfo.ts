import { useEffect, useState } from "react";
import type { AppInfo } from "../../../shared/types";

export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void window.leash.appInfo().then(setInfo);
  }, []);
  return info;
}

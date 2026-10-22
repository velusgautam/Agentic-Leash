import { useEffect, useState } from "react";

export function useGrantStatus() {
  const [status, setStatus] = useState({ count: 0, lockdown: false });
  useEffect(() => {
    const tick = () => void window.leash.grantStatus().then(setStatus);
    tick();
    const timer = window.setInterval(tick, 5000);
    const off = window.leash.onGrantStatus(setStatus);
    return () => {
      window.clearInterval(timer);
      off();
    };
  }, []);
  return status;
}

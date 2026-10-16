import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";

export function FullDiskControl() {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    const tick = () => void window.leash.fullDiskAccess().then(setGranted);
    tick();
    const timer = window.setInterval(tick, 2000);
    return () => window.clearInterval(timer);
  }, []);
  if (window.leash.platform !== "darwin") return null;
  return (
    <span className="flex items-center gap-2">
      <span className="text-xs whitespace-nowrap text-muted-foreground">{granted === null ? "Checking" : granted ? "Granted" : "Not granted"}</span>
      <Button size="sm" onClick={() => void window.leash.openFullDiskAccess()}>Open Full Disk Access</Button>
    </span>
  );
}

import { SetupButton } from "~/components/SetupButton";
import { Button } from "~/components/ui/button";
import { useSetup } from "~/components/useSetup";

export function FullDiskControl() {
  const { status } = useSetup();
  if (window.leash.platform !== "darwin") return null;
  // Dev builds inherit the launching terminal's Full Disk Access, so the probe says nothing about Agentic Leash.app.
  if (status?.helper === "skipped") return <Button size="sm" disabled>Available in the installed app</Button>;
  return <SetupButton kind="fda" actionKey="fda" done={Boolean(status?.fda)} onClick={() => window.leash.openFullDiskAccess()} />;
}

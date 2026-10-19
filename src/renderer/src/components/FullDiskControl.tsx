import { SetupButton } from "~/components/SetupButton";
import { useSetup } from "~/components/useSetup";

export function FullDiskControl() {
  const { status } = useSetup();
  if (window.leash.platform !== "darwin") return null;
  return <SetupButton kind="fda" actionKey="fda" done={Boolean(status?.fda)} onClick={() => window.leash.openFullDiskAccess()} />;
}

import { actionLabel, actionState, type ActionKind } from "../../../shared/setup";
import { Button } from "~/components/ui/button";
import { useSetup } from "~/components/useSetup";

export function SetupButton({ kind, actionKey, done, onClick }: { kind: ActionKind; actionKey: string; done: boolean; onClick: () => Promise<unknown> }) {
  const { status, busy, failed, run } = useSetup();
  const state = actionState({ known: Boolean(status), busy: busy === actionKey, failed: failed === actionKey, done });
  const locked = state === "checking" || state === "working" || state === "done";
  return (
    <Button size="sm" disabled={locked} onClick={() => run(actionKey, onClick)}>
      {actionLabel(kind, state)}
    </Button>
  );
}

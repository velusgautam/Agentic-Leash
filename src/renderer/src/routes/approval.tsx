import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { denyCountdown, pendingSecondsLeft, POPUP_TIMEOUT_S } from "../../../shared/pending";
import { ApprovalChoices, allowLabel, isBroad, Kbd, PRESETS } from "~/components/ApprovalChoices";
import { AGENT_LABELS, AgentIcon } from "~/components/Icons";
import { Button } from "~/components/ui/button";
import { usePending } from "~/hooks/useLeash";

const ARM_MS = 600;

function CloseButton() {
  return (
    <Button size="icon-sm" variant="ghost" aria-label="Close" className="size-7" onClick={() => void window.leash.closeApproval()}>
      <X />
    </Button>
  );
}

export function ApprovalPage() {
  const pending = usePending();
  const [now, setNow] = useState(() => Date.now());
  const [choice, setChoice] = useState(1);
  const [scope, setScope] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const current = pending[0];
  useEffect(() => {
    setChoice(1);
    setScope(null);
  }, [current?.id]);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      setArmed(false);
      timer = window.setTimeout(() => setArmed(true), ARM_MS);
    };
    arm();
    window.addEventListener("focus", arm);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", arm);
    };
  }, [current?.id]);
  const broad = isBroad(scope, choice);
  const allow = () => current && void window.leash.decidePending(current.id, "allow", PRESETS[choice]!.seconds, scope ?? undefined);
  const deny = () => current && void window.leash.decidePending(current.id, "deny", null);
  const allowAll = () => {
    const seconds = PRESETS[choice]!.seconds;
    for (const id of pending.map((item) => item.id)) void window.leash.decidePending(id, "allow", seconds);
  };
  const denyAll = () => {
    for (const id of pending.map((item) => item.id)) void window.leash.decidePending(id, "deny", null);
  };
  const noLimit = PRESETS[choice]!.seconds === null;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!current) return;
      if (event.key === "Enter" && armed && !broad) allow();
      if (event.key === "Escape") deny();
      const index = PRESETS.findIndex((item) => item.key === event.key);
      if (index >= 0) setChoice(index);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!current) {
    return (
      <div className="drag-region flex h-dvh items-center gap-3 bg-popover px-4 text-sm text-popover-foreground">
        <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />
        <p className="flex-1">No requests waiting.</p>
        <CloseButton />
      </div>
    );
  }

  const { request } = current;
  return (
    <div className="flex h-dvh flex-col bg-popover text-popover-foreground">
      <header className="drag-region flex shrink-0 items-center gap-3 border-b border-border/60 px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card">
          <AgentIcon agent={request.agent} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold tracking-tight">
            {AGENT_LABELS[request.agent] ?? request.agent} wants {request.access} access
          </h1>
          <p className="truncate text-xs text-muted-foreground">{request.tool} tool · {request.cwd}</p>
        </div>
        {pending.length > 1 ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">1 of {pending.length}</span> : null}
        <CloseButton />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 [&>*]:shrink-0">
        <ApprovalChoices request={request} choice={choice} onChoice={setChoice} scope={scope} onScope={setScope} showKeys />
      </div>
      {pending.length > 1 ? (
        <div className="flex shrink-0 items-center gap-2 border-t border-border/60 px-4 py-1.5">
          <p className="mr-auto text-xs text-muted-foreground tabular-nums">{pending.length} waiting:</p>
          <Button size="sm" variant="ghost" className="h-7" onClick={denyAll}>Deny all ({pending.length})</Button>
          <Button size="sm" variant="outline" className="h-7" disabled={!armed || noLimit} title={noLimit ? "Choose a time limit to allow several at once" : undefined} onClick={allowAll}>Allow all ({pending.length})</Button>
        </div>
      ) : null}
      <footer className="flex shrink-0 items-center gap-2 border-t border-border/60 bg-muted/50 px-4 py-2.5">
        <p className="mr-auto text-xs text-muted-foreground tabular-nums">{denyCountdown(pendingSecondsLeft(current.askedAt, now, POPUP_TIMEOUT_S))}</p>
        <Button size="sm" variant="ghost" className="h-8 text-sm" onClick={deny}>
          Deny <Kbd>esc</Kbd>
        </Button>
        <Button size="sm" variant={broad ? "destructive" : "default"} disabled={!armed} className="h-8 text-sm" onClick={() => allow()}>
          {allowLabel(scope, choice)} {broad ? null : <Kbd>↵</Kbd>}
        </Button>
      </footer>
    </div>
  );
}

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { parentFolders } from "../../../shared/parents";
import { denyCountdown, pendingSecondsLeft, POPUP_TIMEOUT_S } from "../../../shared/pending";
import type { PendingRequest } from "../../../shared/types";
import { AGENT_LABELS, AgentIcon } from "~/components/Icons";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

const PRESETS = [
  { key: "1", label: "15 min", seconds: 15 * 60 },
  { key: "2", label: "1 hour", seconds: 60 * 60 },
  { key: "3", label: "8 hours", seconds: 8 * 60 * 60 },
  { key: "4", label: "Always", seconds: null },
] as const;

const folderLabel = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  return parts[0] === "Users" && parts.length === 2 ? "~" : parts.at(-1) ?? path;
};

const Kbd = ({ children, className }: { children: string; className?: string }) => (
  <kbd className={cn("rounded border border-current/20 px-1 font-sans text-[10px] leading-4 font-medium opacity-70", className)}>{children}</kbd>
);

function CloseButton() {
  return (
    <Button size="icon-sm" variant="ghost" aria-label="Close" className="size-7" onClick={() => void window.leash.closeApproval()}>
      <X />
    </Button>
  );
}

export function ApprovalPage() {
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [choice, setChoice] = useState(1);
  const [scope, setScope] = useState<string | null>(null);
  const load = () => {
    setNow(Date.now());
    void window.leash.listPending().then(setPending);
  };
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 300);
    return () => window.clearInterval(timer);
  }, []);
  const current = pending[0];
  useEffect(() => {
    setChoice(1);
    setScope(null);
  }, [current?.id]);
  const allow = () => current && void window.leash.decidePending(current.id, "allow", PRESETS[choice]!.seconds, scope ?? undefined);
  const deny = () => current && void window.leash.decidePending(current.id, "deny", null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!current) return;
      if (event.key === "Enter") allow();
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
  const folders = parentFolders(request.paths);
  const target = request.command
    ? { label: "Command", value: request.command }
    : request.url
      ? { label: "URL", value: request.url }
      : { label: request.paths.length > 1 ? "Paths" : "Path", value: request.paths.join("\n") };
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
        <div>
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">{target.label}</div>
          <pre className="max-h-24 overflow-auto rounded-lg border border-border/60 bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">{target.value}</pre>
        </div>
        {folders.length ? (
          <div>
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">Or allow this whole folder</div>
            <div className="flex max-h-16 flex-wrap gap-1 overflow-auto">
              {folders.map((folder) => (
                <button
                  key={folder}
                  type="button"
                  title={folder}
                  aria-pressed={scope === folder}
                  onClick={() => setScope((value) => (value === folder ? null : folder))}
                  className={cn("rounded-md border px-2 py-1 font-mono text-xs", scope === folder ? "border-primary bg-primary/10 font-medium ring-1 ring-primary/30" : "border-border bg-background hover:bg-accent")}
                >
                  {folderLabel(folder)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">Allow for</div>
          <div role="radiogroup" aria-label="Allow for" className="grid grid-cols-4 gap-1 rounded-lg border border-border/60 bg-muted/40 p-0.5">
            {PRESETS.map((preset, index) => (
              <button
                key={preset.key}
                type="button"
                role="radio"
                aria-checked={choice === index}
                onClick={() => setChoice(index)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                  choice === index ? "bg-background font-medium shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {preset.label}
                <Kbd>{preset.key}</Kbd>
              </button>
            ))}
          </div>
        </div>
      </div>
      <footer className="flex shrink-0 items-center gap-2 border-t border-border/60 bg-muted/50 px-4 py-2.5">
        <p className="mr-auto text-xs text-muted-foreground tabular-nums">{denyCountdown(pendingSecondsLeft(current.askedAt, now, POPUP_TIMEOUT_S))}</p>
        <Button size="sm" variant="ghost" className="h-8 text-sm" onClick={deny}>
          Deny <Kbd>esc</Kbd>
        </Button>
        <Button size="sm" className="h-8 text-sm" onClick={() => allow()}>
          Allow {scope ? `${folderLabel(scope)} ` : ""}{PRESETS[choice]!.seconds === null ? "always" : `for ${PRESETS[choice]!.label}`} <Kbd>↵</Kbd>
        </Button>
      </footer>
    </div>
  );
}

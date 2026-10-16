import type { ReactNode } from "react";
import { ArrowRightLeft, Eye, FilePlus2, Globe, Pencil, ShieldAlert, SquareTerminal, Trash2, type LucideIcon } from "lucide-react";
import type { HistoryRow } from "../../../shared/types";
import { AGENT_LABELS, AgentIcon } from "~/components/Icons";
import { cn } from "~/lib/utils";

const KINDS: Record<string, { icon: LucideIcon; tone: string }> = {
  read: { icon: Eye, tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  write: { icon: Pencil, tone: "bg-amber-500/12 text-amber-700 dark:text-amber-300" },
  create: { icon: FilePlus2, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  delete: { icon: Trash2, tone: "bg-red-500/10 text-red-700 dark:text-red-300" },
  rename: { icon: ArrowRightLeft, tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  exec: { icon: SquareTerminal, tone: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300" },
  net: { icon: Globe, tone: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" },
};

export const EVENT_KINDS = Object.keys(KINDS);

export function KindBadge({ kind }: { kind: string }) {
  const { icon: Icon, tone } = KINDS[kind] ?? { icon: Eye, tone: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", tone)}>
      <Icon className="size-3" aria-hidden />
      {kind}
    </span>
  );
}

export function EventList({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/40 shadow-xs/5">
      <ul className="min-w-max divide-y divide-border/50">{children}</ul>
    </div>
  );
}

export function EventRow({ row, showDate, selected, onSelect }: { row: HistoryRow; showDate?: boolean; selected?: boolean; onSelect?: () => void }) {
  const time = showDate ? new Date(row.ts).toLocaleString() : new Date(row.ts).toLocaleTimeString();
  const body = (
    <>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">{time}</span>
      <span className="flex items-center gap-2">
        <AgentIcon agent={row.agent} />
        {AGENT_LABELS[row.agent] ?? row.agent}
      </span>
      <KindBadge kind={row.kind} />
      <span className="flex items-center gap-2 font-mono text-xs">
        {row.sensitive ? <ShieldAlert className="size-3.5 text-destructive" aria-label="Sensitive" /> : null}
        <span className={row.sensitive ? "text-destructive" : undefined}>{row.path}</span>
        {row.destPath ? <span className="text-muted-foreground">→ {row.destPath}</span> : null}
      </span>
    </>
  );
  const layout = cn(
    "grid w-full items-center gap-4 px-4 py-2.5 text-left text-sm whitespace-nowrap",
    showDate ? "grid-cols-[11rem_8.5rem_5.5rem_auto]" : "grid-cols-[5.5rem_8.5rem_5.5rem_auto]",
    row.sensitive && "bg-destructive/6 shadow-[inset_3px_0_0_var(--color-destructive)]",
    selected && "bg-accent",
  );
  return (
    <li>
      {onSelect ? (
        <button type="button" className={cn(layout, "hover:bg-accent/60")} onClick={onSelect}>
          {body}
        </button>
      ) : (
        <div className={layout}>{body}</div>
      )}
    </li>
  );
}

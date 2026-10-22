import { ShieldAlert } from "lucide-react";
import { EVENT_KINDS } from "~/components/EventRow";
import { AGENT_LABELS, AgentIcon } from "~/components/Icons";
import { cn } from "~/lib/utils";

export const control = "h-8 rounded-lg border border-border bg-background/60 text-sm shadow-xs/5 outline-none focus-visible:ring-2 focus-visible:ring-ring";
const active = "bg-background font-medium shadow-xs ring-1 ring-border";
const idle = "text-muted-foreground hover:text-foreground";

export function AgentChips({ choices, value, onChange }: { choices: string[]; value: string[]; onChange: (next: string[]) => void }) {
  const toggle = (agent: string) => onChange(value.includes(agent) ? value.filter((item) => item !== agent) : [...value, agent]);
  return (
    <div role="group" aria-label="Agents" className="flex h-8 items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
      <button type="button" aria-pressed={value.length === 0} onClick={() => onChange([])} className={cn("h-full rounded-md px-2.5 text-xs", value.length === 0 ? active : idle)}>
        All agents
      </button>
      {choices.map((agent) => (
        <button key={agent} type="button" aria-pressed={value.includes(agent)} onClick={() => toggle(agent)} className={cn("flex h-full items-center gap-1.5 rounded-md px-2.5 text-xs", value.includes(agent) ? active : idle)}>
          <AgentIcon agent={agent} className="size-3.5" />
          {AGENT_LABELS[agent] ?? agent}
        </button>
      ))}
    </div>
  );
}

export function KindSelect({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <select aria-label="Kind" className={cn(control, "px-2.5")} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="all">All kinds</option>
      {EVENT_KINDS.map((item) => <option key={item} value={item}>{item[0]!.toUpperCase() + item.slice(1)}</option>)}
    </select>
  );
}

export function SensitiveToggle({ on, count, onToggle }: { on: boolean; count?: number; onToggle: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onToggle} className={cn(control, "inline-flex items-center gap-1.5 px-2.5", on && "border-destructive/40 bg-destructive/10 text-destructive")}>
      <ShieldAlert className="size-3.5" aria-hidden />
      Sensitive{count ? ` · ${count}` : ""}
    </button>
  );
}

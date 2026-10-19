import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { Grant, HistoryRow } from "../../../shared/types";
import { EVENT_KINDS, EventList, EventRow } from "~/components/EventRow";
import { DetailSplit } from "~/components/DetailSplit";
import { coveringGrant, EventDetail } from "~/components/EventDetail";
import { HISTORY_AGENT, visibleAgent } from "../../../shared/setup";
import { AGENT_LABELS } from "~/components/Icons";
import { useSetup } from "~/components/useSetup";
import { cn } from "~/lib/utils";

const select = "rounded-lg border border-border bg-card/40 px-2.5 py-1.5 text-sm";

export function LivePage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [agent, setAgent] = useState("all");
  const [kind, setKind] = useState("all");
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const [selected, setSelected] = useState<HistoryRow | null>(null);
  const [text, setText] = useState<{ before: string | null; after: string | null } | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const loadGrants = () => void window.leash.listGrants().then(setGrants);
  useEffect(loadGrants, [selected?.id]);
  useEffect(() => {
    const tick = () => void window.leash.listHistory().then(setRows);
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setText(null);
    if (selected?.kind === "write") void window.leash.historyText(selected.id).then(setText);
  }, [selected?.id, selected?.kind]);
  const visible = rows.filter((row) => (agent === "all" || row.agent === agent) && (kind === "all" || row.kind === kind) && (!sensitiveOnly || row.sensitive));
  const sensitive = rows.filter((row) => row.sensitive).length;
  const { status } = useSetup();
  const agentOptions = (status?.agents ?? []).filter(visibleAgent).map((item) => HISTORY_AGENT[item.id]).filter((id): id is string => Boolean(id));
  const detail = selected ? (docked: boolean) => <EventDetail row={selected} text={text} grant={coveringGrant(selected, grants)} onRevoked={loadGrants} docked={docked} /> : null;
  return (
    <DetailSplit
      detail={detail}
      toolbar={
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
          </span>
          Live activity
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Agent" className={select} value={agent} onChange={(event) => setAgent(event.target.value)}>
            <option value="all">All agents</option>
            {agentOptions.map((id) => <option key={id} value={id}>{AGENT_LABELS[id] ?? id}</option>)}
          </select>
          <select aria-label="Kind" className={select} value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="all">All kinds</option>
            {EVENT_KINDS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button
            type="button"
            aria-pressed={sensitiveOnly}
            onClick={() => setSensitiveOnly((value) => !value)}
            className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm", sensitiveOnly ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-card/40")}
          >
            <ShieldAlert className="size-3.5" aria-hidden />
            Sensitive{sensitive ? ` · ${sensitive}` : ""}
          </button>
        </div>
      </div>
      }
      list={visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 px-6 py-12 text-center">
          <div className="text-3xl" aria-hidden>🦮</div>
          <p className="mt-2 text-sm font-medium">All quiet</p>
          <p className="mt-1 text-sm text-muted-foreground">File reads, writes and commands from your agents show up here once monitoring is on.</p>
        </div>
      ) : (
        <EventList>{visible.map((row) => <EventRow key={row.id} row={row} selected={selected?.id === row.id} onSelect={() => setSelected(row)} />)}</EventList>
      )}
    />
  );
}

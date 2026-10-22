import { useEffect, useState } from "react";
import type { Grant, HistoryRow } from "../../../shared/types";
import { EventList, EventRow } from "~/components/EventRow";
import { AgentChips, KindSelect, SensitiveToggle } from "~/components/EventFilters";
import { DetailSplit } from "~/components/DetailSplit";
import { coveringGrant, EventDetail } from "~/components/EventDetail";
import { HISTORY_AGENT, visibleAgent } from "../../../shared/setup";
import { useSetup } from "~/components/useSetup";

export function LivePage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [agents, setAgents] = useState<string[]>([]);
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
  const visible = rows.filter((row) => (agents.length === 0 || agents.includes(row.agent)) && (kind === "all" || row.kind === kind) && (!sensitiveOnly || row.sensitive));
  useEffect(() => {
    if (selected && !visible.some((row) => row.id === selected.id)) setSelected(null);
  }, [selected?.id, visible.map((row) => row.id).join(",")]);
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
          <AgentChips choices={agentOptions} value={agents} onChange={setAgents} />
          <KindSelect value={kind} onChange={setKind} />
          <SensitiveToggle on={sensitiveOnly} count={sensitive} onToggle={() => setSensitiveOnly((value) => !value)} />
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

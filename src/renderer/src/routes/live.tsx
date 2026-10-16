import { useEffect, useState } from "react";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import type { Grant, HistoryRow } from "../../../shared/types";
import { EVENT_KINDS, EventList, EventRow } from "~/components/EventRow";
import { DetailSplit } from "~/components/DetailSplit";
import { coveringGrant, EventDetail } from "~/components/EventDetail";
import { AGENT_LABELS } from "~/components/Icons";
import { cn } from "~/lib/utils";

const select = "rounded-lg border border-border bg-card/40 px-2.5 py-1.5 text-sm";

export function LivePage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [agent, setAgent] = useState("all");
  const [kind, setKind] = useState("all");
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const [important, setImportant] = useState(true);
  const [selected, setSelected] = useState<HistoryRow | null>(null);
  const [text, setText] = useState<{ before: string | null; after: string | null } | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const loadGrants = () => void window.leash.listGrants().then(setGrants);
  useEffect(loadGrants, [selected?.id]);
  useEffect(() => {
    const tick = () => void window.leash.listHistory(important).then(setRows);
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [important]);
  useEffect(() => {
    setText(null);
    if (selected?.kind === "write") void window.leash.historyText(selected.id).then(setText);
  }, [selected?.id, selected?.kind]);
  const visible = rows.filter((row) => (agent === "all" || row.agent === agent) && (kind === "all" || row.kind === kind) && (!sensitiveOnly || row.sensitive));
  const sensitive = rows.filter((row) => row.sensitive).length;
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
            {["claude", "cursor-agent", "codex", "gemini"].map((id) => <option key={id} value={id}>{AGENT_LABELS[id] ?? id}</option>)}
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
          <button
            type="button"
            aria-pressed={important}
            title="Hides /dev, temp files, caches, and agent session logs. .env, SSH keys and other sensitive files stay visible."
            onClick={() => setImportant((value) => !value)}
            className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm", important ? "border-border bg-card/40" : "border-primary/40 bg-primary/10")}
          >
            {important ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
            {important ? "Important only" : "All files"}
          </button>
        </div>
      </div>
      }
      list={visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 px-6 py-12 text-center">
          <div className="text-3xl" aria-hidden>🦮</div>
          <p className="mt-2 text-sm font-medium">{important ? "Nothing important right now" : "All quiet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{important ? "Temp files, /dev and agent logs are hidden. Switch to All files to see them." : "File reads, writes and commands from your agents show up here once monitoring is on."}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <EventList>{visible.map((row) => <EventRow key={row.id} row={row} selected={selected?.id === row.id} onSelect={() => setSelected(row)} />)}</EventList>
        </div>
      )}
    />
  );
}

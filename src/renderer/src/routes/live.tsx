import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { HistoryRow } from "../../../shared/types";
import { EVENT_KINDS, EventList, EventRow } from "~/components/EventRow";
import { AGENT_LABELS } from "~/components/Icons";
import { PageContainer } from "~/components/settings";
import { cn } from "~/lib/utils";

const select = "rounded-lg border border-border bg-card/40 px-2.5 py-1.5 text-sm";

export function LivePage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [agent, setAgent] = useState("all");
  const [kind, setKind] = useState("all");
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  useEffect(() => {
    const tick = () => void window.leash.listHistory().then(setRows);
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, []);
  const visible = rows.filter((row) => (agent === "all" || row.agent === agent) && (kind === "all" || row.kind === kind) && (!sensitiveOnly || row.sensitive));
  const sensitive = rows.filter((row) => row.sensitive).length;
  return (
    <PageContainer className="max-w-6xl">
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
            {["claude-code", "cursor", "codex", "gemini"].map((id) => <option key={id} value={id}>{AGENT_LABELS[id]}</option>)}
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
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 px-6 py-12 text-center">
          <div className="text-3xl" aria-hidden>🦮</div>
          <p className="mt-2 text-sm font-medium">All quiet</p>
          <p className="mt-1 text-sm text-muted-foreground">File reads, writes and commands from your agents show up here once monitoring is on.</p>
        </div>
      ) : (
        <EventList>{visible.map((row) => <EventRow key={row.id} row={row} />)}</EventList>
      )}
    </PageContainer>
  );
}

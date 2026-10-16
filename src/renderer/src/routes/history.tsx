import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { HistoryRow } from "../../../shared/types";
import { EventList, EventRow, KindBadge } from "~/components/EventRow";
import { PageContainer } from "~/components/settings";

export function HistoryPage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<HistoryRow | null>(null);
  useEffect(() => {
    void window.leash.listHistory().then(setRows);
  }, []);
  const visible = rows.filter((row) => row.path.toLowerCase().includes(query.toLowerCase()) || row.agent.includes(query.toLowerCase()));
  return (
    <PageContainer className="max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">History</h1>
        <label className="flex w-72 items-center gap-2 rounded-lg border border-border bg-card/40 px-2.5 py-1.5 text-sm">
          <Search className="size-3.5 text-muted-foreground" aria-hidden />
          <input aria-label="Search history" className="w-full bg-transparent outline-none" placeholder="Path or agent" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 px-6 py-12 text-center">
          <div className="text-3xl" aria-hidden>📭</div>
          <p className="mt-2 text-sm text-muted-foreground">No history yet</p>
        </div>
      ) : (
        <EventList>
          {visible.map((row) => <EventRow key={row.id} row={row} showDate selected={selected?.id === row.id} onSelect={() => setSelected(row)} />)}
        </EventList>
      )}
      {selected?.kind === "write" ? (
        <section className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
          <h2 className="flex items-center gap-2 border-b border-border/50 px-4 py-2.5 text-sm font-medium">
            <KindBadge kind="write" />
            <span className="font-mono text-xs">{selected.path}</span>
            <span className="ml-auto text-xs font-normal text-muted-foreground">best-effort baseline</span>
          </h2>
          <div className="grid grid-cols-2 divide-x divide-border/50 font-mono text-xs">
            <pre className="overflow-auto bg-red-500/5 p-3 whitespace-pre">{selected.beforeText ?? "(no baseline)"}</pre>
            <pre className="overflow-auto bg-emerald-500/5 p-3 whitespace-pre">{selected.afterText ?? "(no after copy)"}</pre>
          </div>
        </section>
      ) : null}
    </PageContainer>
  );
}

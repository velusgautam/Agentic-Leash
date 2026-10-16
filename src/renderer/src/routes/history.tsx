import { useEffect, useState } from "react";
import type { HistoryRow } from "../../../shared/types";
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
    <PageContainer>
      <h1 className="text-lg font-medium">History</h1>
      <input aria-label="Search history" className="rounded-md border border-border bg-transparent px-2 py-1.5 text-sm" placeholder="Path or agent" value={query} onChange={(event) => setQuery(event.target.value)} />
      {visible.length === 0 ? <p className="text-sm text-muted-foreground">No history yet</p> : null}
      <ul className="space-y-1 text-sm">
        {visible.map((row) => (
          <li key={row.id}>
            <button className="text-left" onClick={() => setSelected(row)}>{new Date(row.ts).toLocaleString()} · {row.agent} · {row.kind} · {row.path}</button>
          </li>
        ))}
      </ul>
      {selected?.kind === "write" ? (
        <section className="rounded-xl border border-border p-3">
          <h2 className="mb-2 text-sm font-medium">Diff · best-effort baseline</h2>
          <div className="grid grid-cols-2 gap-3 font-mono text-xs">
            <pre className="overflow-auto whitespace-pre-wrap">{selected.beforeText ?? "(no baseline)"}</pre>
            <pre className="overflow-auto whitespace-pre-wrap">{selected.afterText ?? "(no after copy)"}</pre>
          </div>
        </section>
      ) : null}
    </PageContainer>
  );
}

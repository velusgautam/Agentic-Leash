import { useEffect, useState } from "react";
import type { HistoryRow } from "../../../shared/types";
import { PageContainer } from "~/components/settings";

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
  return (
    <PageContainer>
      <h1 className="text-lg font-medium">Live activity</h1>
      <div className="flex gap-2 text-sm">
        <select aria-label="Agent" className="rounded-md border border-border bg-transparent px-2 py-1" value={agent} onChange={(event) => setAgent(event.target.value)}>
          <option value="all">All agents</option>
          <option value="claude-code">Claude Code</option>
          <option value="cursor">Cursor</option>
        </select>
        <select aria-label="Kind" className="rounded-md border border-border bg-transparent px-2 py-1" value={kind} onChange={(event) => setKind(event.target.value)}>
          {["all", "read", "write", "create", "delete", "rename", "exec", "net"].map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <label className="flex items-center gap-1"><input type="checkbox" checked={sensitiveOnly} onChange={(event) => setSensitiveOnly(event.target.checked)} /> Sensitive</label>
      </div>
      {visible.length === 0 ? <p className="text-sm text-muted-foreground">File reads, writes and commands from your agents show up here once monitoring is on.</p> : null}
      <ul className="space-y-1 text-sm">
        {visible.map((row) => (
          <li key={row.id} className={row.sensitive ? "text-destructive" : undefined}>
            {row.agent} · {row.kind} · {row.path} · {new Date(row.ts).toLocaleTimeString()}
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}

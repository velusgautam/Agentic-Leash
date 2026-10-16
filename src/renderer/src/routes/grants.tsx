import { useEffect, useState } from "react";
import { FolderLock, History, LockOpen, ShieldOff, Timer, Users } from "lucide-react";
import { viewGrants, type GrantSortKey, type SortDir } from "../../../shared/grantView";
import type { DecisionRow, Grant } from "../../../shared/types";
import { ConfirmAction, grantEffects, REVOKE_ALL_EFFECTS } from "~/components/ConfirmAction";
import { AGENT_LABELS, AgentIcon } from "~/components/Icons";
import { PageContainer, SettingsSection } from "~/components/settings";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

function remaining(expiresAt: number | null): string {
  if (expiresAt === null) return "Forever";
  const seconds = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return `${seconds}s`;
}

const pill = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap";
const VERDICT: Record<string, string> = {
  allow: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  pass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  deny: "bg-red-500/10 text-red-700 dark:text-red-300",
  ask: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
};

const agentName = (agent: string) => (agent === "*" ? "All agents" : AGENT_LABELS[agent] ?? agent);

function when(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Agent({ agent }: { agent: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      {agent === "*" ? <Users className="size-3.5 text-muted-foreground" aria-hidden /> : <AgentIcon agent={agent} className="size-3.5" />}
      {agentName(agent)}
    </span>
  );
}

function GrantList({ grants, agent, sort, dir, onAgent, onSort, onRevoke }: { grants: Grant[]; agent: string; sort: GrantSortKey; dir: SortDir; onAgent: (agent: string) => void; onSort: (sort: GrantSortKey) => void; onRevoke: (id: number) => void }) {
  const agents = [...new Set(grants.map((grant) => grant.agent))].sort((a, b) => agentName(a).localeCompare(agentName(b)));
  const rows = viewGrants(grants, { agent, sort, dir });
  const sortLabel = (key: GrantSortKey, asc: string, desc: string) => (sort === key ? (dir === "desc" ? desc : asc) : key === "approved" ? "Approved" : "Expires");
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-3">
        <div className="inline-flex flex-wrap rounded-lg border border-border p-0.5">
          {["all", ...agents].map((id) => (
            <button key={id} type="button" aria-pressed={agent === id} onClick={() => onAgent(id)} className={cn("rounded-md px-2.5 py-1 text-xs", agent === id ? "bg-accent font-medium" : "text-muted-foreground")}>
              {id === "all" ? "All" : agentName(id)}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          <button type="button" aria-pressed={sort === "approved"} onClick={() => onSort("approved")} className={cn("rounded-md px-2.5 py-1 text-xs", sort === "approved" ? "bg-accent font-medium" : "text-muted-foreground")}>
            {sortLabel("approved", "Oldest", "Newest")}
          </button>
          <button type="button" aria-pressed={sort === "expires"} onClick={() => onSort("expires")} className={cn("rounded-md px-2.5 py-1 text-xs", sort === "expires" ? "bg-accent font-medium" : "text-muted-foreground")}>
            {sortLabel("expires", "Expires soon", "Expires last")}
          </button>
        </div>
      </div>
      <SettingsSection title="Live grants">
        {rows.length === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground">No grants for {agentName(agent)}.</p> : null}
        {rows.map((grant) => (
          <div key={grant.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <FolderLock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="overflow-x-auto font-mono text-xs font-medium whitespace-nowrap">{grant.path}</div>
              <div className="flex flex-wrap items-center gap-2">
                <Agent agent={grant.agent} />
                <span className={cn(pill, grant.access === "write" ? "bg-amber-500/12 text-amber-700 dark:text-amber-300" : "bg-sky-500/10 text-sky-700 dark:text-sky-300")}>{grant.access}</span>
                <span className="text-xs text-muted-foreground tabular-nums" title={when(grant.createdAt)}>Approved {when(grant.createdAt)}</span>
                <span className={cn(pill, "bg-muted text-foreground/80")} title={grant.expiresAt === null ? "Forever" : when(grant.expiresAt)}><Timer className="size-3" aria-hidden />{remaining(grant.expiresAt)}</span>
                <span className="text-xs text-muted-foreground">{grant.source}</span>
              </div>
            </div>
            <ConfirmAction
              trigger={<Button size="sm" variant="destructive-outline">Revoke</Button>}
              title="Revoke this grant?"
              description={grant.path}
              effects={grantEffects(grant)}
              confirmLabel="Revoke"
              onConfirm={() => onRevoke(grant.id)}
            />
          </div>
        ))}
      </SettingsSection>
    </>
  );
}

export function GrantsPage() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [log, setLog] = useState(false);
  const [agent, setAgent] = useState("all");
  const [sort, setSort] = useState<GrantSortKey>("approved");
  const [dir, setDir] = useState<SortDir>("desc");
  const pickSort = (next: GrantSortKey) => {
    if (next === sort) setDir((value) => (value === "desc" ? "asc" : "desc"));
    else {
      setSort(next);
      setDir(next === "approved" ? "desc" : "asc");
    }
  };
  const load = () => {
    void window.leash.listGrants().then(setGrants);
    void window.leash.listDecisions().then(setDecisions);
  };
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <PageContainer>
      <div className="flex items-center justify-between px-3">
        <h1 className="text-lg font-semibold tracking-tight">Grants</h1>
        <Button size="sm" variant="outline" onClick={() => setLog((value) => !value)}>
          {log ? <FolderLock /> : <History />}
          {log ? "Show grants" : "Decision log"}
        </Button>
      </div>
      {log ? (
        <SettingsSection title="Decisions, last 30 days">
          {decisions.length === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground"><span aria-hidden className="mr-2">🗒️</span>No decisions yet</p> : null}
          {decisions.map((row) => (
            <div key={row.id} className="flex items-center gap-3 overflow-x-auto px-4 py-2.5 text-sm whitespace-nowrap">
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{new Date(row.ts).toLocaleString()}</span>
              <Agent agent={row.agent} />
              <span className="font-mono text-xs">{row.tool}</span>
              <span className={cn(pill, VERDICT[row.verdict] ?? "bg-muted text-muted-foreground")}>{row.verdict}</span>
              {row.durationMs !== null ? <span className="text-xs text-muted-foreground tabular-nums">{row.durationMs} ms</span> : null}
            </div>
          ))}
        </SettingsSection>
      ) : grants.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 px-6 py-12 text-center">
          <div className="text-3xl" aria-hidden>🗝️</div>
          <p className="mt-2 text-sm text-muted-foreground">No grants yet</p>
        </div>
      ) : (
        <GrantList grants={grants} agent={agent} sort={sort} dir={dir} onAgent={setAgent} onSort={pickSort} onRevoke={(id) => void window.leash.revokeGrant(id).then(load)} />
      )}
      <div className="flex gap-2 px-3">
        <ConfirmAction
          trigger={<Button variant="destructive" disabled={grants.length === 0}><ShieldOff />{grants.length === 0 ? "Nothing to revoke" : "Revoke all and lock down"}</Button>}
          title={`Revoke all ${grants.length} grants?`}
          description="Every agent loses the folder access it has now."
          effects={REVOKE_ALL_EFFECTS}
          confirmLabel="Revoke all"
          onConfirm={() => void window.leash.revokeAll().then(load)}
        />
        <Button variant="outline" onClick={() => void window.leash.unlock()}><LockOpen />End lockdown</Button>
      </div>
    </PageContainer>
  );
}

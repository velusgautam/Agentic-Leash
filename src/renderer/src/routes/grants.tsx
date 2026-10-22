import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, FolderLock, Lock, LockOpen, ShieldOff, SquareTerminal, Timer, Users } from "lucide-react";
import { decisionTarget } from "../../../shared/decisionView";
import { viewGrants, type GrantSortKey, type SortDir } from "../../../shared/grantView";
import { denyCountdown, pendingSecondsLeft, POPUP_TIMEOUT_S } from "../../../shared/pending";
import type { DecisionRow, Grant, PendingRequest } from "../../../shared/types";
import { ApprovalChoices, allowLabel, isBroad, PRESETS } from "~/components/ApprovalChoices";
import { ConfirmAction, grantEffects, REVOKE_ALL_EFFECTS } from "~/components/ConfirmAction";
import { AGENT_LABELS, AgentIcon } from "~/components/Icons";
import { PageContainer, SettingsSection } from "~/components/settings";
import { Button } from "~/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "~/components/ui/tabs";
import { toast, toastRevoked } from "~/components/ui/toast";
import { cn } from "~/lib/utils";
import { AllowList, AutomaticAllows } from "./access-parts";

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
const SOURCE_LABELS: Record<string, string> = { leash: "Agentic Leash", config: "Agent config" };

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

function PendingRow({ item, now, onDecide }: { item: PendingRequest; now: number; onDecide: () => void }) {
  const [choice, setChoice] = useState(1);
  const [scope, setScope] = useState<string | null>(null);
  const request = item.request;
  const preset = PRESETS[choice]!;
  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Agent agent={request.agent} />
        <span className={cn(pill, request.access === "write" ? "bg-amber-500/12 text-amber-700 dark:text-amber-300" : "bg-sky-500/10 text-sky-700 dark:text-sky-300")}>{request.access}</span>
        <span className="font-mono text-xs">{request.tool}</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{denyCountdown(pendingSecondsLeft(item.askedAt, now, POPUP_TIMEOUT_S))}</span>
      </div>
      <ApprovalChoices request={request} choice={choice} onChoice={setChoice} scope={scope} onScope={setScope} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => void window.leash.decidePending(item.id, "deny", null).then(() => { toast({ title: "Denied" }); onDecide(); })}>Deny</Button>
          <Button size="sm" variant={isBroad(scope, choice) ? "destructive" : "default"} onClick={() => void window.leash.decidePending(item.id, "allow", preset.seconds, scope ?? undefined).then(() => { toast({ title: "Allowed", description: preset.label }); onDecide(); })}>{allowLabel(scope, choice)}</Button>
        </span>
      </div>
    </div>
  );
}

function GrantRow({ grant, mono, Icon, onRevoke }: { grant: Grant; mono: string; Icon: typeof FolderLock; onRevoke: (grant: Grant) => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="overflow-x-auto font-mono text-xs font-medium whitespace-nowrap">{mono}</div>
        <div className="flex flex-wrap items-center gap-2">
          <Agent agent={grant.agent} />
          <span className={cn(pill, grant.access === "write" ? "bg-amber-500/12 text-amber-700 dark:text-amber-300" : "bg-sky-500/10 text-sky-700 dark:text-sky-300")}>{grant.access}</span>
          <span className="text-xs text-muted-foreground tabular-nums" title={when(grant.createdAt)}>Approved {when(grant.createdAt)}</span>
          <span className={cn(pill, "bg-muted text-foreground/80")} title={grant.expiresAt === null ? "Forever" : when(grant.expiresAt)}><Timer className="size-3" aria-hidden />{remaining(grant.expiresAt)}</span>
          <span className="text-xs text-muted-foreground">{SOURCE_LABELS[grant.source] ?? grant.source}</span>
        </div>
      </div>
      <ConfirmAction
        trigger={<Button size="sm" variant="destructive-outline">Revoke</Button>}
        title="Revoke this grant?"
        description={mono}
        effects={grantEffects(grant)}
        confirmLabel="Revoke"
        onConfirm={() => onRevoke(grant)}
      />
    </div>
  );
}

function GrantList({ grants, agent, sort, dir, onAgent, onSort, onRevoke }: { grants: Grant[]; agent: string; sort: GrantSortKey; dir: SortDir; onAgent: (agent: string) => void; onSort: (sort: GrantSortKey) => void; onRevoke: (grant: Grant) => void }) {
  const agents = [...new Set(grants.map((grant) => grant.agent))].sort((a, b) => agentName(a).localeCompare(agentName(b)));
  const folders = viewGrants(grants.filter((grant) => grant.command == null), { agent, sort, dir });
  const commands = viewGrants(grants.filter((grant) => grant.command != null), { agent, sort, dir });
  const sorts = [
    { key: "approved" as const, label: "Approved", asc: "oldest first", desc: "newest first" },
    { key: "expires" as const, label: "Expires", asc: "soon first", desc: "last first" },
  ];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-3">
        <div className="inline-flex flex-wrap rounded-lg border border-border p-0.5">
          {["all", ...agents].map((id) => (
            <button key={id} type="button" aria-pressed={agent === id} onClick={() => onAgent(id)} className={cn("rounded-md px-2.5 py-1 text-xs", agent === id ? "bg-accent font-medium" : "text-muted-foreground")}>
              {id === "all" ? "All" : id === "*" ? "Shared" : agentName(id)}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {sorts.map((item) => {
            const active = sort === item.key;
            const Icon = dir === "desc" ? ArrowDown : ArrowUp;
            return (
              <button key={item.key} type="button" aria-pressed={active} aria-label={active ? `${item.label}, ${dir === "desc" ? item.desc : item.asc}` : item.label} onClick={() => onSort(item.key)} className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs", active ? "bg-accent font-medium" : "text-muted-foreground")}>
                {item.label}
                {active ? <Icon className="size-3" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </div>
      {folders.length === 0 && commands.length === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground">No grants for {agentName(agent)}.</p> : null}
      {folders.length > 0 ? (
        <SettingsSection title="Live grants">
          {folders.map((grant) => <GrantRow key={grant.id} grant={grant} mono={grant.path} Icon={FolderLock} onRevoke={onRevoke} />)}
        </SettingsSection>
      ) : null}
      {commands.length > 0 ? (
        <SettingsSection title="Commands">
          {commands.map((grant) => <GrantRow key={grant.id} grant={grant} mono={grant.command!} Icon={SquareTerminal} onRevoke={onRevoke} />)}
        </SettingsSection>
      ) : null}
    </>
  );
}

export function GrantsPage() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [tab, setTab] = useState("active");
  const [agent, setAgent] = useState("all");
  const [sort, setSort] = useState<GrantSortKey>("approved");
  const [dir, setDir] = useState<SortDir>("desc");
  const [lockdown, setLockdown] = useState(false);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [now, setNow] = useState(() => Date.now());
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
    void window.leash.grantStatus().then((status) => setLockdown(status.lockdown));
    void window.leash.listPending().then(setPending);
    setNow(Date.now());
  };
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const onRevoke = (grant: Grant) => void window.leash.revokeGrant(grant.id).then(() => { toast({ title: "Grant revoked", description: grant.command ?? grant.path }); load(); });
  return (
    <PageContainer>
      <h1 className="px-3 text-lg font-semibold tracking-tight">Access</h1>
      {pending.length ? (
        <SettingsSection title="Pending">
          {pending.map((item) => <PendingRow key={item.id} item={item} now={now} onDecide={load} />)}
        </SettingsSection>
      ) : null}
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList className="mx-3">
          <TabsTab value="active">Active</TabsTab>
          <TabsTab value="always">Always</TabsTab>
          <TabsTab value="automatic">Automatic</TabsTab>
          <TabsTab value="log">Log</TabsTab>
        </TabsList>
        <TabsPanel value="active">
          {grants.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 px-6 py-12 text-center">
              <div className="text-3xl" aria-hidden>🗝️</div>
              <p className="mt-2 text-sm text-muted-foreground">No grants yet</p>
            </div>
          ) : (
            <GrantList grants={grants} agent={agent} sort={sort} dir={dir} onAgent={setAgent} onSort={pickSort} onRevoke={onRevoke} />
          )}
          <div className="flex flex-wrap items-center gap-2 px-3">
            <ConfirmAction
              trigger={<Button variant="destructive" disabled={grants.length === 0}><ShieldOff />{grants.length === 0 ? "Nothing to revoke" : "Revoke all and lock down"}</Button>}
              title={`Revoke all ${grants.length} grants?`}
              description="Every agent loses the folder access it has now."
              effects={REVOKE_ALL_EFFECTS}
              confirmLabel="Revoke all"
              onConfirm={() => void window.leash.revokeAll().then((result) => { toastRevoked(result.revoked); load(); })}
            />
            <Button
              variant={lockdown ? "destructive" : "outline"}
              disabled={!lockdown}
              aria-pressed={lockdown}
              className={lockdown ? undefined : "text-muted-foreground disabled:opacity-100"}
              onClick={() => void window.leash.unlock().then(() => { toast({ title: "Lockdown ended" }); load(); })}
            >
              {lockdown ? <Lock /> : <LockOpen />}
              {lockdown ? "End lockdown" : "Lockdown off"}
            </Button>
          </div>
        </TabsPanel>
        <TabsPanel value="always"><AllowList /></TabsPanel>
        <TabsPanel value="automatic"><AutomaticAllows /></TabsPanel>
        <TabsPanel value="log">
          <SettingsSection title="Decisions, last 30 days">
            {decisions.length === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground"><span aria-hidden className="mr-2">🗒️</span>No decisions yet</p> : null}
            {decisions.map((row) => (
              <div key={row.id} className="flex items-center gap-3 px-4 py-2.5 text-sm whitespace-nowrap">
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{new Date(row.ts).toLocaleString()}</span>
                <span className="shrink-0"><Agent agent={row.agent} /></span>
                <span className="shrink-0 font-mono text-xs">{row.tool}</span>
                <span className={cn(pill, "shrink-0", VERDICT[row.verdict] ?? "bg-muted text-muted-foreground")}>{row.verdict}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={decisionTarget(row)}>{decisionTarget(row)}</span>
                {row.reason ? <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground" title={row.reason}>{row.reason}</span> : null}
                {row.durationMs !== null ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{row.durationMs} ms</span> : null}
              </div>
            ))}
          </SettingsSection>
        </TabsPanel>
      </Tabs>
    </PageContainer>
  );
}

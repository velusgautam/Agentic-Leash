import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { FolderOpen, Globe, Lock, Plug, ShieldCheck, ShieldX } from "lucide-react";
import type { AgentSnapshot, Enforcement } from "../../../shared/types";
import { AGENT_LABELS, AgentIcon } from "~/components/Icons";
import { PageContainer, SettingsSection } from "~/components/settings";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

const ENFORCEMENT: Record<Enforcement, { label: string; tone: string }> = {
  hook: { label: "Hooks enforce", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  rules: { label: "Rules mode", tone: "bg-amber-500/12 text-amber-700 dark:text-amber-300" },
  "monitor-only": { label: "Monitor only", tone: "bg-muted text-muted-foreground" },
};

function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", tone)}>{children}</span>;
}

const accessTone = (access: string) => (access === "write" ? "bg-amber-500/12 text-amber-700 dark:text-amber-300" : "bg-sky-500/10 text-sky-700 dark:text-sky-300");

function Row({ icon, locked, children, action }: { icon: ReactNode; locked: boolean; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {locked ? <Lock className="size-3.5 text-muted-foreground" aria-label="Locked by company policy" /> : action}
    </div>
  );
}

function Empty({ emoji, children }: { emoji: string; children: ReactNode }) {
  return <p className="px-4 py-4 text-sm text-muted-foreground"><span aria-hidden className="mr-2">{emoji}</span>{children}</p>;
}

export function AgentPage() {
  const { agentId } = useParams({ from: "/agents/$agentId" });
  const [agent, setAgent] = useState<AgentSnapshot | null>(null);
  useEffect(() => {
    const load = () => void window.leash.listAgents().then((agents) => setAgent(agents.find((item) => item.id === agentId) ?? null));
    load();
    const timer = window.setInterval(load, 1000);
    return () => window.clearInterval(timer);
  }, [agentId]);
  const name = agent?.name ?? AGENT_LABELS[agentId] ?? agentId;
  const enforcement = agent ? ENFORCEMENT[agent.enforcement] : null;
  return (
    <PageContainer>
      <header className="flex items-start gap-4 px-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-card shadow-xs/5">
          <AgentIcon agent={agentId} className="size-6" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-lg font-semibold tracking-tight">{name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {agent?.installed ? <Pill tone="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">● Installed</Pill> : <Pill tone="bg-muted text-muted-foreground">Not installed</Pill>}
            {agent?.installed && enforcement ? <Pill tone={enforcement.tone}>{enforcement.label}</Pill> : null}
            {agent?.children.map((id) => (
              <Pill key={id} tone="bg-muted text-foreground/80"><AgentIcon agent={id} className="size-3" />{AGENT_LABELS[id] ?? id}</Pill>
            ))}
          </div>
          {agent?.installed && agent.note ? <p className="text-sm text-muted-foreground">{agent.note}</p> : null}
          {agent && !agent.installed ? <p className="text-sm text-muted-foreground">Not installed on this Mac.</p> : null}
        </div>
      </header>
      <SettingsSection title="Folders">
        {agent?.folders.length ? agent.folders.map((folder) => (
          <Row key={`${folder.source}:${folder.path}`} icon={<FolderOpen className="size-4" />} locked={folder.locked}>
            <span className="font-mono text-xs">{folder.path}</span>
            <Pill tone={accessTone(folder.access)}>{folder.access}</Pill>
            <span className="text-xs text-muted-foreground">{folder.source}</span>
          </Row>
        )) : <Empty emoji="📂">No folders</Empty>}
      </SettingsSection>
      <SettingsSection title="MCP servers">
        {agent?.mcpServers.length ? agent.mcpServers.map((server) => (
          <Row
            key={`${server.source}:${server.name}`}
            icon={<Plug className="size-4" />}
            locked={server.locked}
            action={<Button size="sm" variant="outline" onClick={() => void window.leash.removeMcp(server.source === "mcp.json" ? "~/.cursor/mcp.json" : "~/.claude.json", server.name)}>Remove</Button>}
          >
            <span className="font-medium">{server.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{server.command || server.url || "stdio"}</span>
            <span className="text-xs text-muted-foreground">{server.source}</span>
          </Row>
        )) : <Empty emoji="🔌">No MCP servers</Empty>}
      </SettingsSection>
      <SettingsSection title="Network">
        {agent?.network.length ? agent.network.map((rule) => (
          <Row key={`${rule.source}:${rule.rule}`} icon={<Globe className="size-4" />} locked={rule.locked}>
            <Pill tone={rule.effect === "allow" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 text-red-700 dark:text-red-300"}>{rule.effect}</Pill>
            <span className="font-mono text-xs">{rule.rule}</span>
            <span className="text-xs text-muted-foreground">{rule.source}</span>
          </Row>
        )) : <Empty emoji="🌐">No network rules</Empty>}
      </SettingsSection>
      <SettingsSection title="macOS Privacy">
        {agent?.privacy.length ? agent.privacy.map((row) => (
          <Row
            key={`${row.bundleId}:${row.service}`}
            icon={row.authValue ? <ShieldCheck className="size-4 text-emerald-500" /> : <ShieldX className="size-4 text-red-500" />}
            locked={false}
            action={<Button size="sm" variant="outline" onClick={() => void window.leash.resetTcc(row.service, row.bundleId)}>Reset</Button>}
          >
            <span>{row.service.replace(/^kTCCService/, "")}</span>
            <Pill tone={row.authValue ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 text-red-700 dark:text-red-300"}>{row.authValue ? "granted" : "denied"}</Pill>
          </Row>
        )) : <Empty emoji="🔐">Privacy grants show up here once Full Disk Access is on.</Empty>}
      </SettingsSection>
    </PageContainer>
  );
}

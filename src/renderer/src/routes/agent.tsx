import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import type { AgentSnapshot } from "../../../shared/types";
import { PageContainer, SettingsSection } from "~/components/settings";
import { Button } from "~/components/ui/button";
import { AGENT_NAV } from "~/nav";

export function AgentPage() {
  const { agentId } = useParams({ from: "/agents/$agentId" });
  const [agent, setAgent] = useState<AgentSnapshot | null>(null);
  useEffect(() => {
    const load = () => void window.leash.listAgents().then((agents) => setAgent(agents.find((item) => item.id === agentId) ?? null));
    load();
    const timer = window.setInterval(load, 1000);
    return () => window.clearInterval(timer);
  }, [agentId]);
  const name = agent?.name ?? AGENT_NAV.find((item) => item.id === agentId)?.label ?? agentId;
  return (
    <PageContainer>
      <h1 className="px-3 text-lg font-medium">{name}</h1>
      <p className="px-3 text-sm text-muted-foreground">{agent?.installed ? agent.note : "Not installed on this Mac."}</p>
      {agent?.children.length ? <p className="px-3 text-sm">Runs {agent.children.map((id) => AGENT_NAV.find((item) => item.id === id)?.label ?? id).join(", ")}</p> : null}
      <SettingsSection title="Folders">
        {agent?.folders.length ? agent.folders.map((folder) => (
          <div key={`${folder.source}:${folder.path}`} className="px-4 py-2 text-sm">{folder.locked ? "🔒 " : ""}{folder.path} · {folder.access} · {folder.source}</div>
        )) : <p className="px-4 py-3 text-sm text-muted-foreground">No folders</p>}
      </SettingsSection>
      <SettingsSection title="MCP servers">
        {agent?.mcpServers.length ? agent.mcpServers.map((server) => (
          <div key={`${server.source}:${server.name}`} className="flex items-center justify-between px-4 py-2 text-sm">
            <span>{server.locked ? "🔒 " : ""}{server.name} · {server.command || server.url || "stdio"} · {server.source}</span>
            {server.locked ? null : <Button size="sm" variant="outline" onClick={() => void window.leash.removeMcp(server.source === "mcp.json" ? "~/.cursor/mcp.json" : "~/.claude.json", server.name)}>Remove</Button>}
          </div>
        )) : <p className="px-4 py-3 text-sm text-muted-foreground">No MCP servers</p>}
      </SettingsSection>
      <SettingsSection title="Network">
        {agent?.network.length ? agent.network.map((rule) => (
          <div key={`${rule.source}:${rule.rule}`} className="px-4 py-2 text-sm">{rule.locked ? "🔒 " : ""}{rule.effect} · {rule.rule} · {rule.source}</div>
        )) : <p className="px-4 py-3 text-sm text-muted-foreground">No network rules</p>}
      </SettingsSection>
      <SettingsSection title="macOS Privacy">
        {agent?.privacy.length ? agent.privacy.map((row) => (
          <div key={`${row.bundleId}:${row.service}`} className="flex items-center justify-between px-4 py-2 text-sm">
            <span>{row.service} · {row.authValue ? "granted" : "denied"}</span>
            <Button size="sm" variant="outline" onClick={() => void window.leash.resetTcc(row.service, row.bundleId)}>Reset</Button>
          </div>
        )) : <p className="px-4 py-3 text-sm text-muted-foreground">Privacy grants show up here once Full Disk Access is on.</p>}
      </SettingsSection>
    </PageContainer>
  );
}

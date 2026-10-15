import { useParams } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { Placeholder } from "~/components/Placeholder";
import { AGENT_NAV } from "~/nav";

export function AgentPage() {
  const { agentId } = useParams({ from: "/agents/$agentId" });
  const name = AGENT_NAV.find((a) => a.id === agentId)?.label ?? agentId;
  return (
    <Placeholder icon={Bot} title={name} description={`Folders, MCP servers and network rules for ${name} show up here.`} />
  );
}

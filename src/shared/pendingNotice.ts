import type { PendingRequest } from "./types";

const AGENT_LABELS: Record<string, string> = { "claude-code": "Claude Code", cursor: "Cursor", codex: "Codex", gemini: "Gemini", hermes: "Hermes" };

export function pendingNotice(item: PendingRequest): { title: string; body: string } {
  const { agent, access, command, paths } = item.request;
  const target = command?.trim() || paths[0] || "";
  const extra = !command?.trim() && paths.length > 1 ? ` and ${paths.length - 1} more` : "";
  return { title: `${AGENT_LABELS[agent] ?? agent} wants ${access} access`, body: `${target}${extra}` };
}

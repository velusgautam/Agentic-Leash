import type { Verdict } from "../shared/types";

export function respond(entry: "claude" | "cursor" | "codex", verdict: Verdict | "timeout"): { stdout: string; exitCode: number } {
  if (verdict === "timeout") {
    if (entry === "codex") return { stdout: "", exitCode: 0 };
    if (entry === "claude") {
      return {
        stdout: JSON.stringify({
          hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: "Agentic Leash is not answering" },
        }),
        exitCode: 0,
      };
    }
    return { stdout: JSON.stringify({ permission: "allow" }), exitCode: 0 };
  }
  if (verdict.kind === "pass") {
    return entry === "cursor" ? { stdout: JSON.stringify({ permission: "allow" }), exitCode: 0 } : { stdout: "", exitCode: 0 };
  }
  if (verdict.kind === "deny") {
    if (entry === "claude" || entry === "codex") {
      return {
        stdout: JSON.stringify({
          hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: verdict.reason },
        }),
        exitCode: 0,
      };
    }
    return { stdout: JSON.stringify({ permission: "deny", user_message: verdict.reason, agent_message: verdict.reason }), exitCode: 0 };
  }
  return respond(entry, "timeout");
}

import { extractShellPaths, normalise } from "../shared/paths";
import type { Access, HookRequest } from "../shared/types";

export type Normalised = { kind: "ignore" } | { kind: "request"; request: HookRequest };

const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function resolveOne(path: string, cwd: string, home?: string): string {
  const cwdNorm = normalise(cwd, cwd, home);
  return extractShellPaths(path, cwd, home).find((item) => item !== cwdNorm) ?? normalise(path, cwd, home);
}

function request(partial: HookRequest): Normalised {
  return { kind: "request", request: partial };
}

export function normaliseHook(raw: unknown, entry: "claude" | "cursor", home?: string): Normalised {
  const payload = asRecord(raw);
  if (entry === "claude" && typeof payload.cursor_version === "string") return { kind: "ignore" };

  const input = asRecord(payload.tool_input);
  const cwd = str(payload.cwd) || str(input.cwd) || "/";
  const event = str(payload.hook_event_name);
  const sessionId = str(payload.session_id) || undefined;
  const agent = entry === "cursor" ? "cursor" : "claude-code";

  if (entry === "cursor" && event === "beforeReadFile") {
    const file = str(payload.file_path);
    return request({ agent, event, tool: "Read", access: "read", paths: file ? [resolveOne(file, cwd, home)] : [], cwd, sessionId });
  }
  if (entry === "cursor" && event === "beforeShellExecution") {
    const command = str(payload.command);
    return request({ agent, event, tool: "Shell", access: "write", paths: extractShellPaths(command, cwd, home), cwd, command, sessionId });
  }
  if (entry === "cursor" && event === "beforeMCPExecution") {
    return request({ agent, event, tool: str(payload.tool_name) || "MCP", access: "read", paths: [], cwd, sessionId });
  }

  const tool = str(payload.tool_name) || "unknown";
  if (tool === "Bash" || tool === "Shell") {
    const command = str(input.command) || str(payload.command);
    const shellCwd = str(input.cwd) || cwd;
    return request({ agent, event, tool, access: "write", paths: extractShellPaths(command, shellCwd, home), cwd: shellCwd, command, sessionId });
  }
  if (tool === "WebFetch") {
    return request({ agent, event, tool, access: "read", paths: [], cwd, url: str(input.url) || undefined, sessionId });
  }
  if (tool === "WebSearch" || tool.startsWith("mcp")) {
    return request({ agent, event, tool, access: "read", paths: [], cwd, sessionId });
  }

  const rawPaths = [input.file_path, input.notebook_path, input.path].filter((value): value is string => typeof value === "string" && value.length > 0);
  const access: Access = WRITE_TOOLS.has(tool) ? "write" : "read";
  return request({ agent, event, tool, access, paths: rawPaths.map((path) => resolveOne(path, cwd, home)), cwd, sessionId });
}

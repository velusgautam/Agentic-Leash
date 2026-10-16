import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AgentSnapshot } from "../../shared/types";
import { readJson } from "./fs";

type CliConfig = {
  permissions?: { allow?: string[]; deny?: string[] };
  sandbox?: { mode?: string; networkAccess?: string };
  approvalMode?: string;
};
type SandboxFile = { networkPolicy?: { default?: string; allow?: string[]; deny?: string[] }; additionalReadwritePaths?: string[]; additionalReadonlyPaths?: string[] };
type McpFile = { mcpServers?: Record<string, { url?: string; command?: string }> };

function ruleEffect(rule: string, denied: Set<string>): "allow" | "deny" {
  return denied.has(rule) ? "deny" : "allow";
}

export function snapshotFromCursor(input: { cli: CliConfig; sandboxes: { source: string; file: SandboxFile }[]; mcp: McpFile; admin: Record<string, unknown> | null; installed: boolean; workers: string[] }): AgentSnapshot {
  const snapshot: AgentSnapshot = {
    id: "cursor",
    name: "Cursor",
    installed: input.installed,
    enforcement: "hook",
    note: input.workers.length ? `${input.workers.length} cursor-agent worker process${input.workers.length === 1 ? "" : "es"} (monitor-only)` : "Hook mode",
    folders: [],
    mcpServers: [],
    network: [],
    children: [],
    workers: input.workers,
    privacy: [],
  };
  const allow = input.cli.permissions?.allow ?? [];
  const deny = new Set(input.cli.permissions?.deny ?? []);
  for (const rule of [...allow, ...deny]) {
    const match = /^(Read|Write|Shell|WebFetch|Mcp)\((.*)\)$/.exec(rule);
    if (!match) continue;
    const [, tool, arg] = match;
    if (tool === "Read" || tool === "Write") snapshot.folders.push({ path: arg!, access: tool === "Write" ? "write" : "read", source: "cli-config.json", locked: false });
    else snapshot.network.push({ rule, effect: ruleEffect(rule, deny), source: "cli-config.json", locked: false });
  }
  if (input.cli.sandbox?.mode) snapshot.network.push({ rule: `sandbox.mode=${input.cli.sandbox.mode}`, effect: input.cli.sandbox.mode === "disabled" ? "allow" : "deny", source: "cli-config.json", locked: false });
  if (input.cli.sandbox?.networkAccess) snapshot.network.push({ rule: `networkAccess=${input.cli.sandbox.networkAccess}`, effect: "allow", source: "cli-config.json", locked: false });
  for (const sandbox of input.sandboxes) {
    for (const path of sandbox.file.additionalReadwritePaths ?? []) snapshot.folders.push({ path, access: "write", source: sandbox.source, locked: false });
    for (const path of sandbox.file.additionalReadonlyPaths ?? []) snapshot.folders.push({ path, access: "read", source: sandbox.source, locked: false });
    for (const domain of sandbox.file.networkPolicy?.allow ?? []) snapshot.network.push({ rule: domain, effect: "allow", source: sandbox.source, locked: false });
    for (const domain of sandbox.file.networkPolicy?.deny ?? []) snapshot.network.push({ rule: domain, effect: "deny", source: sandbox.source, locked: false });
  }
  for (const [name, server] of Object.entries(input.mcp.mcpServers ?? {})) snapshot.mcpServers.push({ name, url: server.url, command: server.command, source: "mcp.json", locked: false });
  if (input.admin) {
    for (const [key, value] of Object.entries(input.admin)) {
      if (typeof value === "boolean" || typeof value === "string" || typeof value === "number") {
        snapshot.network.push({ rule: `${key}=${String(value)}`, effect: "deny", source: "state.vscdb", locked: true });
      }
    }
  }
  return snapshot;
}

export function readCursorAdmin(dbPath: string): Record<string, unknown> | null {
  if (!existsSync(dbPath)) return null;
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("autorun.cachedAdminSettings") as { value: string } | undefined;
    db.close();
    if (!row) return null;
    const parsed = JSON.parse(row.value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function cursorWorkers(psLines: string[]): string[] {
  return psLines.filter((line) => line.includes("cursor-agent") && line.includes("worker"));
}

export function loadCursor(root: string, adminDb: string, workers: string[] = []): AgentSnapshot {
  return snapshotFromCursor({
    cli: readJson(join(root, "cli-config.json")) as CliConfig,
    sandboxes: [join(root, "sandbox.json")]
      .filter((path) => existsSync(path))
      .map((path) => ({ source: "sandbox.json", file: readJson(path) as SandboxFile })),
    mcp: readJson(join(root, "mcp.json")) as McpFile,
    admin: readCursorAdmin(adminDb),
    installed: existsSync(root),
    workers,
  });
}

export function cursorWatchPaths(root: string, adminDb: string): string[] {
  return [join(root, "cli-config.json"), join(root, "sandbox.json"), join(root, "mcp.json"), join(root, "hooks.json"), adminDb];
}

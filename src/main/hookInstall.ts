import { CLAUDE_MATCHER, HOOK_TIMEOUT_S } from "../shared/constants";

type CursorHooks = { version?: number; hooks?: Record<string, { command?: string; timeout?: number; failClosed?: boolean }[]> };
type ClaudeHook = { type?: string; command?: string; timeout?: number };
type ClaudeSettings = { hooks?: { PreToolUse?: { matcher?: string; hooks?: ClaudeHook[] }[] } };

const CURSOR_EVENTS = ["preToolUse", "beforeReadFile", "beforeShellExecution", "beforeMCPExecution"];

function isOurs(command: string | undefined, marker: string): boolean {
  return Boolean(command?.includes(marker));
}

export function mergeCursorHooks(existing: unknown, command: string): CursorHooks {
  const file = (existing && typeof existing === "object" ? existing : {}) as CursorHooks;
  const hooks = { ...(file.hooks ?? {}) };
  for (const event of CURSOR_EVENTS) {
    const kept = (hooks[event] ?? []).filter((entry) => !isOurs(entry.command, "leash-hook"));
    hooks[event] = [...kept, { command, timeout: HOOK_TIMEOUT_S, failClosed: true }];
  }
  return { ...file, version: file.version ?? 1, hooks };
}

export function removeCursorHooks(existing: unknown): CursorHooks {
  const file = (existing && typeof existing === "object" ? existing : {}) as CursorHooks;
  const hooks: CursorHooks["hooks"] = {};
  for (const [event, entries] of Object.entries(file.hooks ?? {})) hooks[event] = entries.filter((entry) => !isOurs(entry.command, "leash-hook"));
  return { ...file, hooks };
}

export function mergeClaudeHooks(existing: unknown, command: string): ClaudeSettings {
  const file = (existing && typeof existing === "object" ? existing : {}) as ClaudeSettings;
  const groups = (file.hooks?.PreToolUse ?? []).map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((hook) => !isOurs(hook.command, "leash-hook")) }));
  const ours = { matcher: CLAUDE_MATCHER, hooks: [{ type: "command", command, timeout: HOOK_TIMEOUT_S }] };
  return { ...file, hooks: { ...file.hooks, PreToolUse: [...groups.filter((group) => (group.hooks ?? []).length > 0), ours] } };
}

export function removeClaudeHooks(existing: unknown): ClaudeSettings {
  const file = (existing && typeof existing === "object" ? existing : {}) as ClaudeSettings;
  const groups = (file.hooks?.PreToolUse ?? [])
    .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((hook) => !isOurs(hook.command, "leash-hook")) }))
    .filter((group) => (group.hooks ?? []).length > 0);
  return { ...file, hooks: { ...file.hooks, PreToolUse: groups } };
}

export function cursorHooksInstalled(file: unknown, command: string): boolean {
  const hooks = ((file ?? {}) as CursorHooks).hooks ?? {};
  return CURSOR_EVENTS.every((event) => (hooks[event] ?? []).some((entry) => entry.command === command && entry.failClosed === true));
}

export function claudeHooksInstalled(file: unknown, command: string): boolean {
  const groups = ((file ?? {}) as ClaudeSettings).hooks?.PreToolUse ?? [];
  return groups.some((group) => (group.hooks ?? []).some((hook) => hook.command === command));
}

# Codex, Gemini, and Hermes Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Codex, Gemini CLI, and Hermes the same per-agent Install / Installed / Uninstall control Claude and Cursor already have, and make those hooks ask Agentic Leash before a tool runs.

**Architecture:** Each agent keeps its own config file. Install merges one command into that file and uninstall removes only that command. The existing `leash-hook.js` process gains an argv entry (`codex`, `gemini`, `hermes`). `normaliseHook` turns that agent's stdin into the current `HookRequest`. `respond` prints the deny shape that agent accepts. The setup screen, Settings row, and agent-page banner already appear when `hooks` is a boolean, so the work is to stop returning `null` for these three.

**Tech Stack:** Electron 44, TypeScript, Vitest. No new dependency. Hermes config stays plain text because the app has no YAML parser.

## Global Constraints

- One sidebar link per agent. Codex, Gemini, and Hermes are separate agents. Claude Desktop stays on the Claude link.
- A hook button reads **Checking…**, **Install**, **Installing…**, **Installed**, or **Retry**. **Uninstall** shows only when the hook file matches. Completed buttons are disabled. Re-read the file after every click.
- Off in Settings hides the agent and uninstalls its hooks. On brings it back at **Install**.
- The setup screen waits for hooks only when that agent is installed and turned on.
- Codex's row tells the user to run `/hooks` in Codex and trust the hook. Codex will not run it until that trust is saved. Installed means the command is in the file. Trust is copy, not a second check.
- Hermes's command is not a shell string. Hermes runs `shlex.split` with `shell=False`. Install writes an executable script and points `config.yaml` at that script.
- Do not set Hermes `hooks_auto_accept`. Hermes asks the user once per command.
- If `~/.hermes/config.yaml` already has a top-level `hooks:` key and no Agentic Leash marker, install throws. The button becomes **Retry**. Do not add a YAML library to merge that case.
- OpenRouter gets no row. T3 Code stays off the sidebar.
- Hook timeout stays 150 seconds for Codex and Hermes. Gemini's timeout field is milliseconds, so write `150000`.
- Marker string inside every command remains `leash-hook`, which `isOurs` already matches.

---

### Task 1: Codex hooks

**Files:**
- Modify: `src/shared/types.ts` (`AgentId`, `HookRequest.agent`)
- Modify: `src/shared/setup.ts` (`HOOK_IDS`, `HISTORY_AGENT`, `BANNER_IDS`)
- Modify: `src/main/hookInstall.ts`
- Modify: `src/hook/normalise.ts`
- Modify: `src/hook/respond.ts`
- Modify: `src/hook/handle.ts`
- Modify: `src/hook/leash-hook.ts`
- Modify: `src/main/runtime.ts` (`HookAgent`, `hookPath`, `hookCommand`, `agentInstalled`, `hookRows`, install/uninstall guards)
- Modify: `src/shared/bridge.ts` and `src/renderer/src/routes/settings.tsx` (the `hookId` union)
- Modify: `src/renderer/src/routes/agent.tsx` (banner install union)
- Modify: `src/renderer/src/nav.ts`
- Modify: `src/renderer/src/components/Icons.tsx` (`AGENT_LABELS` already has Codex)
- Modify: `src/shared/diagnostics.ts`
- Test: `tests/unit/hook.test.ts`, `tests/unit/setup.test.ts`, `tests/unit/diagnostics.test.ts`

**Interfaces:**
- Consumes: `mergeClaudeHooks`, `claudeHooksInstalled`, `hookCommand`, `setupReady`
- Produces: `mergeCodexHooks(existing: unknown, command: string)`, `removeCodexHooks(existing: unknown)`, `codexHooksInstalled(file: unknown, command: string): boolean`. `normaliseHook` and `respond` and `handlePayload` accept entry `"codex"`. `installHooks("codex")` writes `~/.codex/hooks.json`.

- [ ] **Step 1: Write the failing test**

Add these imports to `tests/unit/hook.test.ts`: `mergeCodexHooks`, `codexHooksInstalled`, and `removeCodexHooks` from `../../src/main/hookInstall`. Then add:

```ts
it("merges a Codex PreToolUse command and detects it", () => {
  const command = 'ELECTRON_RUN_AS_NODE=1 "/App" "/leash-hook.js" codex';
  const merged = mergeCodexHooks({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ command: "other" }] }] } }, command);
  expect(codexHooksInstalled(merged, command)).toBe(true);
  expect(codexHooksInstalled(removeCodexHooks(merged), command)).toBe(false);
  const request = normaliseHook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls /tmp" }, cwd: "/tmp", turn_id: "t1" }, "codex");
  expect(request.kind === "request" && request.request.agent).toBe("codex");
  expect(JSON.parse(respond("codex", { kind: "deny", reason: "no" }).stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  expect(respond("codex", "timeout")).toEqual({ stdout: "", exitCode: 0 });
});
```

Add this test to `tests/unit/setup.test.ts`:

```ts
it("waits for Codex hooks when Codex is installed and turned on", () => {
  expect(setupReady({
    helper: "running",
    fda: true,
    agents: [agent("codex", true, true, false)],
  })).toBe(false);
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm exec vitest run tests/unit/hook.test.ts tests/unit/setup.test.ts`

Expected: FAIL because `mergeCodexHooks` is not exported and `"codex"` is not a valid entry.

- [ ] **Step 3: Implement**

In `src/main/hookInstall.ts`, copy the Claude PreToolUse merge and point it at a top-level `hooks` object. The file shape is `{ hooks?: { PreToolUse?: { matcher?: string; hooks?: { command?: string }[] }[] } }`. Keep foreign commands. Append one group:

```ts
{ matcher: ".*", hooks: [{ type: "command", command, timeout: HOOK_TIMEOUT_S }] }
```

`codexHooksInstalled` is true when some PreToolUse hook's `command` equals the installed command.

`removeCodexHooks` drops only commands where `command` includes `leash-hook`.

In `src/hook/normalise.ts`, widen the entry argument to `"claude" | "cursor" | "codex"`. For `"codex"`, set `agent` to `"codex"` and then use the existing tool branch (`Bash` / `Shell`, `WebFetch`, path fields). Codex sends `turn_id`; read `sessionId` from `session_id` or `turn_id`.

In `src/hook/respond.ts`, treat `"codex"` like `"claude"` for a deny (`hookSpecificOutput.permissionDecision: "deny"`). Pass and timeout return `{ stdout: "", exitCode: 0 }`. Codex has no `ask` decision, so a timeout must not print `ask`.

Widen `handlePayload` and `leash-hook.ts`. `process.argv[2]` of `codex` selects that entry. Anything else stays claude except the existing cursor check.

In `src/shared/types.ts`, add `"codex"` to `HookRequest.agent`. `AgentId` already includes `codex`.

In `src/shared/setup.ts`, add `"codex"` to `HOOK_IDS`. `HISTORY_AGENT.codex` and `BANNER_IDS` already include it.

In `src/main/runtime.ts`:

```ts
type HookAgent = "claude-code" | "cursor" | "codex";

function hookPath(agent: HookAgent, home: string): string {
  if (agent === "cursor") return join(home, ".cursor/hooks.json");
  if (agent === "codex") return join(home, ".codex/hooks.json");
  return join(claudeRoot(), "settings.json");
}

function hookCommand(kind: "claude" | "cursor" | "codex"): string {
  return `ELECTRON_RUN_AS_NODE=1 "${process.execPath}" "${hookScript()}" ${kind}`;
}
```

`agentInstalled("codex")` stays `existsSync(join(home, ".codex/config.toml"))`.

`hookRows` sets `codex` to `codexHooksInstalled(...)` instead of `null`. `installAgent` / `uninstallAgent` call the Codex merge functions when `agent === "codex"`, and `hookCommand("codex")`. Accept `"codex"` in the install and uninstall IPC guards. `pendingRestart.add("codex")`.

In `src/renderer/src/routes/settings.tsx`, extend `hookId` so `"codex"` is included. Description when `agent.id === "codex"`: `Off hides this agent and removes its hooks. After install, run /hooks in Codex and trust Agentic Leash.`

In `src/renderer/src/routes/agent.tsx`, allow `agentId === "codex"` on the banner's `installHooks` call.

In `src/shared/diagnostics.ts`, stop hardcoding Codex as `status: "none"`. Pass `codex: boolean` into `diagnosticsReport` and use `"installed"` or `"missing"`, label `"Codex"`. Update `tests/unit/diagnostics.test.ts` and the `diagnostics:get` call in `runtime.ts`.

`src/renderer/src/nav.ts` already lists Codex. No new nav row.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/unit/hook.test.ts tests/unit/setup.test.ts tests/unit/diagnostics.test.ts && pnpm typecheck`

Expected: PASS, typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/main/hookInstall.ts src/main/runtime.ts src/hook/normalise.ts src/hook/respond.ts src/hook/handle.ts src/hook/leash-hook.ts src/shared/types.ts src/shared/setup.ts src/shared/diagnostics.ts src/shared/bridge.ts src/renderer/src/routes/settings.tsx src/renderer/src/routes/agent.tsx tests/unit/hook.test.ts tests/unit/setup.test.ts tests/unit/diagnostics.test.ts
git commit -m "feat: add Codex hooks"
```

---

### Task 2: Gemini CLI hooks

**Files:**
- Modify: `src/main/hookInstall.ts`
- Modify: `src/hook/normalise.ts`
- Modify: `src/hook/respond.ts`
- Modify: `src/hook/handle.ts`
- Modify: `src/hook/leash-hook.ts`
- Modify: `src/main/runtime.ts`
- Modify: `src/shared/types.ts` (`HookRequest.agent`)
- Modify: `src/shared/setup.ts` (`HOOK_IDS`)
- Modify: `src/shared/diagnostics.ts`
- Modify: `src/renderer/src/routes/settings.tsx`
- Modify: `src/renderer/src/routes/agent.tsx`
- Test: `tests/unit/hook.test.ts`, `tests/unit/diagnostics.test.ts`

**Interfaces:**
- Consumes: Task 1's entry union and `hookCommand` pattern
- Produces: `mergeGeminiHooks(existing: unknown, command: string)`, `removeGeminiHooks(existing: unknown)`, `geminiHooksInstalled(file: unknown, command: string): boolean`. Entry `"gemini"`. `installHooks("gemini")` writes `~/.gemini/settings.json` key `hooks.BeforeTool`.

- [ ] **Step 1: Write the failing test**

```ts
it("merges a Gemini BeforeTool command and denies with decision", () => {
  const command = 'ELECTRON_RUN_AS_NODE=1 "/App" "/leash-hook.js" gemini';
  const merged = mergeGeminiHooks({ mcpServers: { local: {} } }, command);
  expect(merged.mcpServers).toEqual({ local: {} });
  expect(geminiHooksInstalled(merged, command)).toBe(true);
  expect(geminiHooksInstalled(removeGeminiHooks(merged), command)).toBe(false);
  const request = normaliseHook({
    hook_event_name: "BeforeTool",
    tool_name: "run_shell_command",
    tool_input: { command: "ls /tmp" },
    cwd: "/tmp",
  }, "gemini");
  expect(request.kind === "request" && request.request.agent).toBe("gemini");
  expect(request.kind === "request" && request.request.access).toBe("write");
  const read = normaliseHook({ tool_name: "read_file", tool_input: { file_path: "/tmp/a.txt" }, cwd: "/tmp" }, "gemini");
  expect(read.kind === "request" && read.request.access).toBe("read");
  expect(JSON.parse(respond("gemini", { kind: "deny", reason: "no" }).stdout)).toEqual({ decision: "deny", reason: "no" });
  expect(respond("gemini", "timeout")).toEqual({ stdout: "", exitCode: 0 });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm exec vitest run tests/unit/hook.test.ts`

Expected: FAIL because `mergeGeminiHooks` is not exported.

- [ ] **Step 3: Implement**

`mergeGeminiHooks` preserves every existing key. Under `hooks.BeforeTool`, drop groups whose commands include `leash-hook`, then append:

```ts
{ matcher: ".*", hooks: [{ type: "command", name: "agentic-leash", command, timeout: 150000 }] }
```

Gemini's `timeout` is milliseconds. `150000` matches the 150 second hook budget.

`geminiHooksInstalled` is true when a BeforeTool hook `command` equals the installed command.

Tool map inside `normaliseHook` when entry is `"gemini"`:

- `run_shell_command` and `Shell`: access `write`, paths from `tool_input.command`
- `write_file` and `replace`: access `write`, path from `file_path` or `path`
- anything else, including `read_file`: access `read`, path from `file_path` or `path` when present

`agent` is `"gemini"`. Add `"gemini"` to `HookRequest.agent` and to `HOOK_IDS`.

`respond("gemini", deny)` returns `{ decision: "deny", reason }`. Pass and timeout return empty stdout and exit 0.

`hookPath("gemini")` is `join(home, ".gemini/settings.json")`. `hookCommand` kind `"gemini"`. `agentInstalled` stays the existing settings.json or trustedFolders.json check. `pendingRestart.add("gemini")`.

Diagnostics: `gemini: boolean`, label `"Gemini CLI"`, status `"installed"` or `"missing"`. Remove the hardcoded `status: "none"` row.

Settings `hookId` includes `"gemini"`. Agent banner allows `agentId === "gemini"`.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/unit/hook.test.ts tests/unit/diagnostics.test.ts tests/unit/setup.test.ts && pnpm typecheck`

Expected: PASS, typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/main/hookInstall.ts src/main/runtime.ts src/hook src/shared src/renderer/src/routes/settings.tsx src/renderer/src/routes/agent.tsx tests/unit/hook.test.ts tests/unit/diagnostics.test.ts tests/unit/setup.test.ts
git commit -m "feat: add Gemini CLI hooks"
```

---

### Task 3: Hermes hooks

**Files:**
- Create: `src/main/hermesHooks.ts`
- Modify: `src/main/runtime.ts`
- Modify: `src/hook/normalise.ts`
- Modify: `src/hook/respond.ts`
- Modify: `src/hook/handle.ts`
- Modify: `src/hook/leash-hook.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/setup.ts`
- Modify: `src/shared/diagnostics.ts`
- Modify: `src/helper/proctree.ts` (`ROOTS` add `"hermes"`)
- Modify: `src/renderer/src/nav.ts`
- Modify: `src/renderer/src/components/Icons.tsx`
- Modify: `src/renderer/src/routes/settings.tsx`
- Modify: `src/renderer/src/routes/agent.tsx`
- Modify: `src/renderer/src/components/SetupScreen.tsx` (the no-agent sentence lists Hermes)
- Test: `tests/unit/hermesHooks.test.ts`, `tests/unit/hook.test.ts`

**Interfaces:**
- Consumes: Task 1 and Task 2 entry unions
- Produces:
  - `hermesScript(execPath: string, scriptPath: string): string`
  - `mergeHermesConfig(text: string, scriptPath: string): string`
  - `removeHermesConfig(text: string): string`
  - `hermesHooksInstalled(text: string, scriptPath: string): boolean`
  - Entry `"hermes"`. `installHooks("hermes")` writes `~/.hermes/agent-hooks/agentic-leash.sh` and a marked block in `~/.hermes/config.yaml`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/hermesHooks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hermesHooksInstalled, hermesScript, mergeHermesConfig, removeHermesConfig } from "../../src/main/hermesHooks";

const script = "/Users/me/.hermes/agent-hooks/agentic-leash.sh";

describe("hermes hooks", () => {
  it("appends a marked block when the file has no hooks key", () => {
    const next = mergeHermesConfig("model:\n  provider: openrouter\n", script);
    expect(hermesHooksInstalled(next, script)).toBe(true);
    expect(next).toContain("model:");
    expect(removeHermesConfig(next)).not.toContain("agentic-leash");
  });

  it("replaces an existing marked block", () => {
    const once = mergeHermesConfig("", script);
    const twice = mergeHermesConfig(once.replace(script, "/old"), script);
    expect(twice.match(/agentic-leash:start/g)).toHaveLength(1);
    expect(twice).toContain(script);
  });

  it("refuses a file that already has a hooks key and no marker", () => {
    expect(() => mergeHermesConfig("hooks:\n  pre_tool_call: []\n", script)).toThrow(/hooks/);
  });

  it("writes a script Hermes can exec without a shell", () => {
    const body = hermesScript("/Applications/Agentic Leash.app/Contents/MacOS/Agentic Leash", "/hook.js");
    expect(body.startsWith("#!/bin/sh\n")).toBe(true);
    expect(body).toContain("ELECTRON_RUN_AS_NODE=1");
    expect(body).toContain('exec "/Applications/Agentic Leash.app/Contents/MacOS/Agentic Leash" "/hook.js" hermes');
  });
});
```

Add a normalise/respond case to `tests/unit/hook.test.ts`:

```ts
const request = normaliseHook({
  hook_event_name: "pre_tool_call",
  tool_name: "terminal",
  tool_input: { command: "ls /tmp" },
  cwd: "/tmp",
  session_id: "s1",
}, "hermes");
expect(request.kind === "request" && request.request.agent).toBe("hermes");
expect(JSON.parse(respond("hermes", { kind: "deny", reason: "no" }).stdout)).toEqual({ decision: "block", reason: "no" });
expect(JSON.parse(respond("hermes", "timeout").stdout)).toEqual({ action: "approve", message: "Agentic Leash is not answering" });
```

- [ ] **Step 2: Run the test**

Run: `pnpm exec vitest run tests/unit/hermesHooks.test.ts tests/unit/hook.test.ts`

Expected: FAIL because `src/main/hermesHooks.ts` does not exist.

- [ ] **Step 3: Implement**

`src/main/hermesHooks.ts`:

```ts
const START = "# agentic-leash:start";
const END = "# agentic-leash:end";

export function hermesScript(execPath: string, scriptPath: string): string {
  return `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec ${JSON.stringify(execPath)} ${JSON.stringify(scriptPath)} hermes\n`;
}

function block(scriptPath: string): string {
  return [
    START,
    "hooks:",
    "  pre_tool_call:",
    "    - matcher: \".*\"",
    `      command: ${JSON.stringify(scriptPath)}`,
    "      timeout: 150",
    "      fail_closed: true",
    END,
  ].join("\n");
}

export function mergeHermesConfig(text: string, scriptPath: string): string {
  const next = block(scriptPath);
  if (text.includes(START)) return text.replace(/# agentic-leash:start[\s\S]*?# agentic-leash:end/, next);
  if (/^hooks:/m.test(text)) throw new Error("Hermes config already has a hooks block. Remove it, or add the Agentic Leash command under hooks.pre_tool_call, then install again.");
  return `${text.trimEnd()}\n\n${next}\n`;
}

export function removeHermesConfig(text: string): string {
  return text.replace(/\n*# agentic-leash:start[\s\S]*?# agentic-leash:end\n?/, "\n").trimEnd() + "\n";
}

export function hermesHooksInstalled(text: string, scriptPath: string): boolean {
  return text.includes(START) && text.includes(scriptPath);
}
```

Runtime install for `"hermes"`:

- Script path: `join(home, ".hermes/agent-hooks/agentic-leash.sh")`
- `mkdirSync` the directory, `writeFileSync` the script from `hermesScript(process.execPath, hookScript())`, `chmodSync(path, 0o755)`
- Read `join(home, ".hermes/config.yaml")` as text, or `""` when missing
- `writeWithBackup` the result of `mergeHermesConfig`
- Uninstall: rewrite the yaml with `removeHermesConfig` when the file exists, and `rmSync` the script if it exists
- `agentInstalled("hermes")` is `existsSync(join(home, ".hermes"))`
- `hookRows` includes `hermes` with `hooks: hermesHooksInstalled(text, scriptPath)`
- Add `"hermes"` to `AgentId`, `HookRequest.agent`, `HOOK_IDS`, `BANNER_IDS`, and `HISTORY_AGENT` (`hermes: "hermes"`)
- `pendingRestart.add("hermes")`
- `leash-hook.ts` argv `hermes`

`normaliseHook` for `"hermes"`:

- `terminal`: access `write`, command from `tool_input.command`
- `write_file` and `patch`: access `write`, path from `tool_input.path`
- `read_file`: access `read`, path from `tool_input.path`
- other tools: access `read`, no path

`respond("hermes", deny)` is `{ decision: "block", reason }`. Pass is `{ stdout: "{}\n", exitCode: 0 }`. Timeout is `{ action: "approve", message: "Agentic Leash is not answering" }`, which sends the call to Hermes's own approval gate.

`proctree.ts`: add `"hermes"` to `ROOTS` so file history attributes the `hermes` process.

Nav: `{ id: "hermes", label: "Hermes" }`. `AGENT_LABELS.hermes = "Hermes"`. Reuse the existing fallback bot icon. Do not draw a new logo.

Settings description for Hermes: `Off hides this agent and removes its hooks. Hermes asks once to allow this hook.`

Setup screen empty-hooks copy and the no-agent banner list Hermes next to Claude, Cursor, Codex, and Gemini.

Diagnostics: label `"Hermes"`, status from the boolean, same as Codex and Gemini.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/unit/hermesHooks.test.ts tests/unit/hook.test.ts tests/unit/setup.test.ts tests/unit/diagnostics.test.ts && pnpm typecheck`

Expected: PASS, typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/main/hermesHooks.ts src/main/runtime.ts src/hook src/shared src/helper/proctree.ts src/renderer tests/unit/hermesHooks.test.ts tests/unit/hook.test.ts tests/unit/setup.test.ts tests/unit/diagnostics.test.ts
git commit -m "feat: add Hermes hooks"
```

Manual check after Task 3, on a Mac where that agent is installed:

1. Settings → Agents shows **Install** for that agent only.
2. Click **Install**. The button becomes **Installed** and stays disabled. **Uninstall** appears.
3. Codex: run `/hooks`, trust the new command, then a tool call opens the Agentic Leash prompt.
4. Gemini: start a new `gemini` session and run a tool. The prompt opens.
5. Hermes: accept the one-time hook prompt, then a `terminal` call opens the Agentic Leash prompt. Quitting the prompt escalates to Hermes's own approval.
6. Switch the agent off. It leaves the sidebar and the hook command is gone from its config. Switch it on. The button is **Install** again.

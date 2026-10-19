import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { handlePayload } from "../../src/hook/handle";
import { normaliseHook } from "../../src/hook/normalise";
import { respond } from "../../src/hook/respond";
import { codexHooksInstalled, geminiHooksInstalled, mergeCodexHooks, mergeGeminiHooks, removeCodexHooks, removeGeminiHooks } from "../../src/main/hookInstall";
import { openGrantsDb } from "../../src/shared/db";

const fixture = (name: string) => JSON.parse(readFileSync(join("tests/fixtures/hooks", name), "utf8"));

describe("normalise", () => {
  it("reads claude and cursor fixtures", () => {
    expect(normaliseHook(fixture("claude-preToolUse-read.json"), "claude").kind).toBe("request");
    const edit = normaliseHook(fixture("claude-preToolUse-edit.json"), "claude");
    expect(edit.kind === "request" && edit.request.access).toBe("write");
    const bash = normaliseHook(fixture("claude-preToolUse-bash.json"), "claude");
    expect(bash.kind === "request" && bash.request.paths.some((path) => path.endsWith("/Users/velu.gautam"))).toBe(true);
    const read = normaliseHook(fixture("cursor-preToolUse-read.json"), "cursor");
    expect(read.kind === "request" && read.request.paths[0]).toContain("spike-results.md");
    expect(normaliseHook(fixture("cursor-ide-via-claude-settings-preToolUse-read.json"), "claude")).toEqual({ kind: "ignore" });
    const shell = normaliseHook(fixture("cursor-beforeShellExecution.json"), "cursor");
    expect(shell.kind === "request" && shell.request.command).toBe("ls spikes");
  });
});

describe("codex hooks", () => {
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
});

describe("gemini hooks", () => {
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
});

describe("respond", () => {
  it("gives no opinion on pass and denies with a reason", () => {
    expect(respond("claude", { kind: "pass" })).toEqual({ stdout: "", exitCode: 0 });
    expect(JSON.parse(respond("claude", { kind: "deny", reason: "no" }).stdout).hookSpecificOutput.permissionDecision).toBe("deny");
    expect(JSON.parse(respond("cursor", { kind: "pass" }).stdout).permission).toBe("allow");
    expect(JSON.parse(respond("cursor", "timeout").stdout).permission).toBe("allow");
    expect(JSON.parse(respond("claude", "timeout").stdout).hookSpecificOutput.permissionDecision).toBe("ask");
  });
});

describe("handlePayload", () => {
  it("does not ask when lockdown already denies", async () => {
    const db = openGrantsDb(join("/tmp", `al-handle-${Date.now()}.db`));
    db.prepare("INSERT INTO settings (key, value) VALUES ('lockdown', '1')").run();
    let asked = false;
    const result = await handlePayload({
      entry: "cursor",
      raw: fixture("cursor-preToolUse-read.json"),
      db,
      now: Date.now(),
      home: "/tmp",
      ask: async () => {
        asked = true;
        return "allow";
      },
    });
    expect(asked).toBe(false);
    expect(JSON.parse(result.stdout).permission).toBe("deny");
    db.close();
  });
});

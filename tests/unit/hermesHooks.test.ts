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

import { describe, expect, it } from "vitest";
import { actionLabel, actionState, claudeSurface, macAppPresent, needsAgentBanner, setupReady, visibleAgent } from "../../src/shared/setup";

const agent = (id: string, installed: boolean, enabled: boolean, hooks: boolean | null) => ({ id, installed, enabled, hooks });

describe("setup gate", () => {
  it("opens the app when the helper is running, Full Disk Access is granted, and every turned-on agent has hooks", () => {
    expect(setupReady({
      helper: "running",
      fda: true,
      agents: [agent("claude-code", true, true, true), agent("cursor", true, true, true)],
    })).toBe(true);
  });

  it("stays on setup when a turned-on agent is missing hooks", () => {
    expect(setupReady({
      helper: "running",
      fda: true,
      agents: [agent("claude-code", true, true, false)],
    })).toBe(false);
  });

  it("lets setup finish when no hook agent is installed, and when an installed agent is turned off", () => {
    expect(setupReady({ helper: "running", fda: true, agents: [] })).toBe(true);
    expect(setupReady({ helper: "running", fda: true, agents: [agent("gemini", true, true, null)] })).toBe(true);
    expect(setupReady({
      helper: "skipped",
      fda: true,
      agents: [agent("claude-code", true, false, false)],
    })).toBe(true);
  });

  it("waits for Codex hooks when Codex is installed and turned on", () => {
    expect(setupReady({
      helper: "running",
      fda: true,
      agents: [agent("codex", true, true, false)],
    })).toBe(false);
  });

  it("blocks when the helper is stopped or Full Disk Access is missing", () => {
    expect(setupReady({ helper: "stopped", fda: true, agents: [] })).toBe(false);
    expect(setupReady({ helper: "running", fda: false, agents: [] })).toBe(false);
  });
});

describe("agent visibility", () => {
  it("shows an agent only when it is installed and turned on", () => {
    expect(visibleAgent({ installed: true, enabled: true })).toBe(true);
    expect(visibleAgent({ installed: true, enabled: false })).toBe(false);
    expect(visibleAgent({ installed: false, enabled: true })).toBe(false);
  });

  it("asks for an agent only when Claude, Cursor, Codex, and Gemini are all absent", () => {
    expect(needsAgentBanner([agent("claude-code", false, true, null), agent("codex", false, true, null)])).toBe(true);
    expect(needsAgentBanner([agent("gemini", true, false, null)])).toBe(false);
  });
});

describe("setup buttons", () => {
  it("labels a hook row from the live check", () => {
    expect(actionState({ known: false, busy: false, failed: false, done: false })).toBe("checking");
    expect(actionLabel("hook", "checking")).toBe("Checking…");
    expect(actionLabel("hook", "ready")).toBe("Install");
    expect(actionLabel("hook", "working")).toBe("Installing…");
    expect(actionLabel("hook", "done")).toBe("Installed");
    expect(actionLabel("hook", "failed")).toBe("Retry");
    expect(actionLabel("helper", "done")).toBe("Running");
    expect(actionLabel("fda", "ready")).toBe("Open Full Disk Access");
    expect(actionLabel("fda", "done")).toBe("Granted");
    expect(actionState({ known: true, busy: false, failed: false, done: true })).toBe("done");
    expect(actionState({ known: true, busy: true, failed: false, done: false })).toBe("working");
    expect(actionState({ known: true, busy: false, failed: true, done: false })).toBe("failed");
  });
});

describe("claude surface", () => {
  it("reads Desktop and CLI from the executable path", () => {
    expect(claudeSurface("/Applications/Claude.app/Contents/MacOS/Claude")).toBe("Desktop");
    expect(claudeSurface("/usr/local/bin/claude")).toBe("CLI");
    expect(claudeSurface("/bin/cursor-agent")).toBe(null);
  });

  it("finds an app in /Applications or the home Applications folder", () => {
    const exists = (path: string) => path === "/Users/me/Applications/Claude.app";
    expect(macAppPresent("Claude", "/Users/me", exists)).toBe(true);
    expect(macAppPresent("Cursor", "/Users/me", exists)).toBe(false);
  });
});

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classify } from "../../src/helper/classify";
import { insertEvents, listHistory, openHistoryDb } from "../../src/helper/historyDb";
import { ProcTree } from "../../src/helper/proctree";
import { applyRules, publishClaudeRules, rulesForGrants } from "../../src/main/rulesMode";
import { mergeClaudeHooks, mergeCursorHooks, removeCursorHooks } from "../../src/main/hookInstall";
import { expireLeashGrants } from "../../src/hook/sweep";
import { insertGrant, openGrantsDb } from "../../src/shared/db";
import { parseLsof, parsePs, percentiles, restartTargets } from "../../src/main/system";

describe("rules and hooks", () => {
  it("writes rules for live grants and removes them again", () => {
    const next = rulesForGrants([{ id: 1, agent: "claude-code", path: "/Users/me/Desktop", access: "write", source: "leash", createdAt: 0, expiresAt: null }], false, "/Users/me");
    const withRules = applyRules({ permissions: { deny: ["Read(./.env)"] } }, next, { additionalDirectories: [], deny: [] });
    expect(withRules.permissions?.additionalDirectories).toContain("/Users/me/Desktop");
    const cleared = applyRules(withRules, { additionalDirectories: [], deny: [] }, next);
    expect(cleared.permissions?.additionalDirectories).toEqual([]);
    expect(cleared.permissions?.deny).toEqual(["Read(./.env)"]);
  });

  it("publishes rules into a settings file and sweeps expiry", () => {
    const dir = mkdtempSync(join(tmpdir(), "al-rules-"));
    const db = openGrantsDb(join(dir, "grants.db"));
    const settings = join(dir, "settings.json");
    insertGrant(db, { agent: "claude-code", path: "/Users/me/Desktop", access: "write", source: "leash", createdAt: 1, expiresAt: 50 });
    publishClaudeRules(db, settings, "/Users/me", true, 10);
    expect(JSON.parse(readFileSync(settings, "utf8")).permissions.additionalDirectories).toContain("/Users/me/Desktop");
    expireLeashGrants(db, 60);
    publishClaudeRules(db, settings, "/Users/me", true, 60);
    expect(JSON.parse(readFileSync(settings, "utf8")).permissions.additionalDirectories).toEqual([]);
    db.close();
  });

  it("merges hook entries without dropping other hooks", () => {
    const cursor = mergeCursorHooks({ version: 1, hooks: { preToolUse: [{ command: "other" }] } }, "leash-hook claude");
    expect(cursor.hooks?.preToolUse).toHaveLength(2);
    expect(cursor.hooks?.preToolUse?.[1]?.failClosed).toBe(true);
    expect(removeCursorHooks(cursor).hooks?.preToolUse).toEqual([{ command: "other" }]);
    const claude = mergeClaudeHooks({ permissions: { allow: ["Bash(ls)"] } }, "leash-hook claude");
    expect(claude.hooks?.PreToolUse?.[0]?.matcher).toContain("Read");
  });
});

describe("history", () => {
  it("collapses reads in the same minute and classifies a tracked exec", () => {
    const tree = new ProcTree();
    tree.apply({ process: { audit_token: { pid: 5 }, executable: { path: "/usr/local/bin/claude" } }, event: { exec: { target: { executable: { path: "/usr/local/bin/claude" }, audit_token: { pid: 5 } } } } });
    const read = classify({ time: "2026-10-15T20:53:11.000Z", process: { audit_token: { pid: 5 }, executable: { path: "/usr/local/bin/claude" } }, event: { open: { file: { path: "/Users/me/.ssh/config" }, fflag: 1 } } }, tree, "/Users/me");
    expect(read?.sensitive).toBe(true);
    expect(read?.kind).toBe("read");
    const late = new ProcTree();
    const opened = { time: "2026-10-15T20:53:11.000Z", process: { audit_token: { pid: 9 }, executable: { path: "/tmp/bin/claude" } }, event: { open: { file: { path: "/Users/me/.ssh/config" }, fflag: 1 } } };
    late.apply(opened);
    expect(late.has(9)).toBe(true);
    expect(classify(opened, late, "/Users/me")?.kind).toBe("read");
    late.apply({ process: { audit_token: { pid: 12 }, executable: { path: "/Users/me/.local/share/cursor-agent/versions/2026.10.01/node" } }, event: { open: { file: { path: "/tmp/x" }, fflag: 1 } } });
    expect(late.agent(12)).toBe("cursor-agent");
    const desktop = new ProcTree();
    desktop.apply({ process: { audit_token: { pid: 20 }, executable: { path: "/Applications/Claude.app/Contents/MacOS/Claude" } } });
    expect(desktop.agent(20)).toBe("claude");
    const db = openHistoryDb(join(mkdtempSync(join(tmpdir(), "al-hist-")), "history.db"));
    insertEvents(db, [read!, { ...read!, ts: read!.ts + 1000 }]);
    expect(listHistory(db)).toHaveLength(1);
    db.close();
    const line = readFileSync("tests/fixtures/eslogger/open.jsonl", "utf8").split("\n")[0]!;
    expect(() => classify(JSON.parse(line), new ProcTree(), "/Users/me")).not.toThrow();
  });
});

describe("system", () => {
  it("parses process lists, lsof and percentiles", () => {
    const rows = parsePs(
      "PID PPID ARGS\n 10 1 /Applications/Cursor.app/Contents/MacOS/Cursor\n 12 10 /Applications/Cursor.app/Contents/Frameworks/Cursor Helper.app/Contents/MacOS/Cursor Helper --type=renderer\n 11 10 claude --continue\n 15 1 /Applications/Claude.app/Contents/MacOS/Claude\n 13 1 node /opt/homebrew/bin/gemini\n 14 1 /usr/bin/grep claude\n",
    );
    expect(restartTargets(rows).map((target) => `${target.agent}:${target.kind}`)).toEqual(["cursor:gui", "claude-code:cli", "claude-code:gui", "gemini:cli"]);
    expect(parseLsof("COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nnode 12 u 1u IPv4 0t0 TCP 10.0.0.1:1->1.2.3.4:443 (ESTABLISHED)\n")).toEqual([{ pid: 12, remote: "1.2.3.4:443" }]);
    expect(percentiles([10, 20, 30]).p50).toBe(20);
  });
});

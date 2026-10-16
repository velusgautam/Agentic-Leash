import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyDueClaudeTrust, clearClaudeTrust, revokeClaudeTrust } from "../../src/main/claudeTrust";
import { removeCursorPath } from "../../src/main/revokeConfig";
import { insertEvents, openHistoryDb, queryHistory } from "../../src/helper/historyDb";
import { tccRows } from "../../src/main/tcc";
import { unifiedPatch } from "../../src/shared/patch";
import { revokeDue } from "../../src/shared/revokeWhen";
import { listScheduled, openGrantsDb, scheduleRevoke } from "../../src/shared/db";

describe("claude trust", () => {
  it("clears only the accepted flag", () => {
    const json = { projects: { "/work": { hasTrustDialogAccepted: true, mcpServers: { a: {} } } } };
    expect(clearClaudeTrust(json, "/work")).toBe(true);
    expect(json.projects["/work"]?.hasTrustDialogAccepted).toBe(false);
    expect(json.projects["/work"]?.mcpServers).toEqual({ a: {} });
    expect(clearClaudeTrust(json, "/missing")).toBe(false);
  });

  it("revokes a due folder and keeps a future one", () => {
    const dir = mkdtempSync(join(tmpdir(), "al-trust-"));
    const file = join(dir, ".claude.json");
    writeFileSync(file, JSON.stringify({ projects: { "/now": { hasTrustDialogAccepted: true }, "/later": { hasTrustDialogAccepted: true } } }));
    const db = openGrantsDb(join(dir, "grants.db"));
    const now = Date.parse("2026-10-16T12:00:00Z");
    scheduleRevoke(db, "/now", now - 1000);
    scheduleRevoke(db, "/later", now + 60_000);
    expect(applyDueClaudeTrust(db, file, now)).toEqual(["/now"]);
    const saved = JSON.parse(readFileSync(file, "utf8")) as { projects: Record<string, { hasTrustDialogAccepted: boolean }> };
    expect(saved.projects["/now"]?.hasTrustDialogAccepted).toBe(false);
    expect(saved.projects["/later"]?.hasTrustDialogAccepted).toBe(true);
    expect(listScheduled(db).map((row) => row.path)).toEqual(["/later"]);
    expect(revokeClaudeTrust(file, "/later")).toBe(true);
    expect(readFileSync(`${file}.bak`, "utf8")).toContain("/later");
    db.close();
  });
});

describe("revoke times", () => {
  it("uses one hour, 23:59, and 9:00 tomorrow", () => {
    const evening = new Date(2026, 9, 16, 18, 0, 0);
    expect(revokeDue("hour", evening)).toBe(evening.getTime() + 60 * 60 * 1000);
    const tonight = new Date(revokeDue("tonight", evening));
    expect(tonight.getHours()).toBe(23);
    expect(tonight.getMinutes()).toBe(59);
    expect(tonight.getDate()).toBe(16);
    const late = new Date(2026, 9, 16, 23, 59, 30);
    expect(new Date(revokeDue("tonight", late)).getDate()).toBe(17);
    const tomorrow = new Date(revokeDue("tomorrow", evening));
    expect(tomorrow.getDate()).toBe(17);
    expect(tomorrow.getHours()).toBe(9);
  });
});

describe("tcc rows", () => {
  it("attributes terminal and claude binary entries, skips others", () => {
    const rows = tccRows([
      { service: "kTCCServiceSystemPolicyDownloadsFolder", client: "com.apple.Terminal", auth_value: 2 },
      { service: "kTCCServiceSystemPolicyDocumentsFolder", client: "/opt/homebrew/Caskroom/claude-code@latest/2.1.301/claude", auth_value: 0 },
      { service: "kTCCServiceCamera", client: "com.zoom.us", auth_value: 2 },
    ]);
    expect(rows.map((row) => row.via)).toEqual(["via Terminal", "claude binary"]);
  });
});

describe("history query", () => {
  it("filters by agent and path without returning file text", () => {
    const dir = mkdtempSync(join(tmpdir(), "al-histq-"));
    const db = openHistoryDb(join(dir, "history.db"));
    insertEvents(db, [
      { ts: 10, agent: "codex", pid: 1, exe: "codex", kind: "write", path: "/work/a.ts", sensitive: false, source: "eslogger", beforeBlob: "old", afterBlob: "new" },
      { ts: 20, agent: "gemini", pid: 2, exe: "gemini", kind: "read", path: "/work/b.ts", sensitive: true, source: "eslogger" },
    ]);
    const found = queryHistory(db, { from: null, to: null, agents: ["codex"], path: "a.ts", kind: "all", sensitive: false, offset: 0, limit: 50 });
    expect(found.total).toBe(1);
    expect(found.rows[0]?.beforeText).toBeNull();
    db.close();
  });
});

describe("cursor rule removal", () => {
  it("drops the matching Write rule and keeps the rest", () => {
    const dir = mkdtempSync(join(tmpdir(), "al-cursor-"));
    const file = join(dir, "cli-config.json");
    writeFileSync(file, JSON.stringify({ permissions: { allow: ["Write(/Users/me/.zshrc)", "Read(/Users/me/Work)"] } }));
    expect(removeCursorPath(file, "/Users/me/.zshrc", "/Users/me")).toBe(true);
    const saved = JSON.parse(readFileSync(file, "utf8")) as { permissions: { allow: string[] } };
    expect(saved.permissions.allow).toEqual(["Read(/Users/me/Work)"]);
  });
});

describe("write patch", () => {
  it("includes the removed and added lines", () => {
    const patch = unifiedPatch("/tmp/a.ts", "one\ntwo\n", "one\nthree\n");
    expect(patch).toContain("-two");
    expect(patch).toContain("+three");
  });
});

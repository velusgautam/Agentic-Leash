import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { insertEvents, openHistoryDb, queryHistory } from "../../src/helper/historyDb";
import { isNoise } from "../../src/shared/noise";

const empty = { from: null, to: null, agents: [], path: "", kind: "all", sensitive: false, offset: 0, limit: 50 };

describe("isNoise", () => {
  it("hides devices, temp files and agent machinery", () => {
    expect(isNoise("/dev/null")).toBe(true);
    expect(isNoise("/private/tmp/claude-42.tmp")).toBe(true);
    expect(isNoise("/Users/me/.claude/plugins/synced/pkg/.last-complete-round")).toBe(true);
    expect(isNoise("/Users/me/.claude/projects/abc/session.jsonl")).toBe(true);
    expect(isNoise("/Users/me/project/node_modules/left-pad/index.js")).toBe(true);
  });

  it("keeps personal files, including a .env sitting in a temp directory", () => {
    expect(isNoise("/Users/me/project/src/index.ts")).toBe(false);
    expect(isNoise("/Users/me/.ssh/id_ed25519")).toBe(false);
    expect(isNoise("/tmp/app/.env")).toBe(false);
    expect(isNoise("/Users/me/.claude.json")).toBe(false);
  });
});

describe("queryHistory hideNoise", () => {
  it("drops scratch paths and keeps the project file and the .env", () => {
    const db = openHistoryDb(join(mkdtempSync(join(tmpdir(), "al-noise-")), "history.db"));
    const row = { ts: 1, agent: "codex" as const, pid: 1, exe: "codex", kind: "read" as const, sensitive: false, source: "eslogger" as const };
    insertEvents(db, [
      { ...row, path: "/dev/null" },
      { ...row, ts: 2, path: "/Users/me/project/src/index.ts" },
      { ...row, ts: 3, path: "/tmp/app/.env", sensitive: true },
      { ...row, ts: 4, path: "/Users/me/.claude/plugins/x/.last-complete-round" },
    ]);
    const hidden = queryHistory(db, { ...empty, hideNoise: true });
    expect(hidden.rows.map((item) => item.path).sort()).toEqual(["/Users/me/project/src/index.ts", "/tmp/app/.env"]);
    expect(queryHistory(db, empty).total).toBe(4);
    db.close();
  });
});

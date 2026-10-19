import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { historyText, insertEvents, openHistoryDb, pruneHistory, queryHistory, splitHistory } from "../../src/helper/historyDb";
import { eventBucket, isNoise } from "../../src/shared/noise";
import { parseRetentionDays } from "../../src/shared/retention";

const empty = { from: null, to: null, agents: [], path: "", kind: "all", sensitive: false, offset: 0, limit: 50 };

function db() {
  return openHistoryDb(join(mkdtempSync(join(tmpdir(), "al-noise-")), "history.db"));
}

const row = { ts: 1, agent: "codex" as const, pid: 1, exe: "codex", kind: "read" as const, sensitive: false, source: "eslogger" as const };

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

describe("eventBucket", () => {
  it("keeps project files, network, and personal paths on main", () => {
    expect(eventBucket({ kind: "read", path: "/Users/me/project/src/index.ts" })).toBe("main");
    expect(eventBucket({ kind: "net", path: "10.0.0.1:443" })).toBe("main");
    expect(eventBucket({ kind: "read", path: "/tmp/app/.env" })).toBe("main");
    expect(eventBucket({ kind: "rename", path: "/tmp/x", destPath: "/Users/me/.ssh/id_ed25519" })).toBe("main");
  });

  it("keeps scratch actions and /tmp reads for the noise table", () => {
    expect(eventBucket({ kind: "write", path: "/tmp/payload" })).toBe("noise");
    expect(eventBucket({ kind: "exec", path: "/tmp/payload" })).toBe("noise");
    expect(eventBucket({ kind: "read", path: "/private/tmp/stage" })).toBe("noise");
    expect(eventBucket({ kind: "write", path: "/Users/me/project/node_modules/left-pad/index.js" })).toBe("noise");
  });

  it("drops junk and other noise reads", () => {
    expect(eventBucket({ kind: "write", path: "/dev/null" })).toBe("drop");
    expect(eventBucket({ kind: "write", path: "/Users/me/project/.DS_Store" })).toBe("drop");
    expect(eventBucket({ kind: "read", path: "/Users/me/.claude/projects/abc/session.jsonl" })).toBe("drop");
    expect(eventBucket({ kind: "read", path: "/tmp/claude-42.tmp" })).toBe("drop");
  });
});

describe("history tables", () => {
  it("stores main and noise separately and can read them together", () => {
    const history = db();
    insertEvents(history, [
      { ...row, path: "/dev/null" },
      { ...row, ts: 2, path: "/Users/me/project/src/index.ts" },
      { ...row, ts: 3, path: "/tmp/app/.env", sensitive: true },
      { ...row, ts: 4, kind: "read", path: "/Users/me/.claude/projects/abc/session.jsonl" },
      { ...row, ts: 5, kind: "write", path: "/tmp/payload", beforeBlob: "a", afterBlob: "b" },
      { ...row, ts: 6, kind: "net", path: "10.0.0.1:443", source: "net" },
    ]);
    expect(queryHistory(history, empty).rows.map((item) => item.path).sort()).toEqual(["/Users/me/project/src/index.ts", "/tmp/app/.env", "10.0.0.1:443"]);
    const both = queryHistory(history, { ...empty, includeNoise: true });
    expect(both.rows.map((item) => item.path).sort()).toEqual(["/Users/me/project/src/index.ts", "/tmp/app/.env", "/tmp/payload", "10.0.0.1:443"]);
    expect(both.total).toBe(4);
    const noise = both.rows.find((item) => item.path === "/tmp/payload");
    expect(historyText(history, noise!.id)).toEqual({ before: "a", after: "b" });
    expect(new Set(both.rows.map((item) => item.id)).size).toBe(4);
    history.close();
  });

  it("moves existing noise rows once and deletes junk", () => {
    const history = db();
    const insert = history.prepare(
      `INSERT INTO events (ts, agent, pid, exe, kind, path, dest_path, sha256, before_blob, after_blob, sensitive, source, minute_key)
       VALUES (?, 'codex', 1, 'codex', ?, ?, NULL, NULL, NULL, NULL, 0, 'eslogger', NULL)`,
    );
    insert.run(1, "read", "/dev/null");
    insert.run(2, "read", "/Users/me/project/src/index.ts");
    insert.run(3, "read", "/Users/me/.claude/projects/abc/session.jsonl");
    insert.run(4, "write", "/tmp/payload");
    insert.run(5, "read", "/tmp/app/.env");
    splitHistory(history);
    splitHistory(history);
    expect(queryHistory(history, empty).rows.map((item) => item.path).sort()).toEqual(["/Users/me/project/src/index.ts", "/tmp/app/.env"]);
    expect(queryHistory(history, { ...empty, includeNoise: true }).rows.map((item) => item.path).sort()).toEqual(["/Users/me/project/src/index.ts", "/tmp/app/.env", "/tmp/payload"]);
    history.close();
  });

  it("prunes each table with its own day count", () => {
    const history = db();
    const now = 100 * 24 * 60 * 60 * 1000;
    const day = 24 * 60 * 60 * 1000;
    insertEvents(history, [
      { ...row, ts: now - 100 * day, path: "/Users/me/project/old.ts" },
      { ...row, ts: now - 10 * day, path: "/Users/me/project/new.ts" },
      { ...row, ts: now - 40 * day, kind: "write", path: "/tmp/old-payload" },
      { ...row, ts: now - 10 * day, kind: "write", path: "/tmp/new-payload" },
    ]);
    pruneHistory(history, now, 90, 30);
    expect(queryHistory(history, { ...empty, includeNoise: true }).rows.map((item) => item.path).sort()).toEqual(["/Users/me/project/new.ts", "/tmp/new-payload"]);
    history.close();
  });

  it("opens the database in WAL mode with a ts index", () => {
    const history = db();
    expect(history.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
    const indexes = history.prepare("PRAGMA index_list(events)").all() as { name: string }[];
    expect(indexes.some((index) => index.name === "events_ts")).toBe(true);
    history.close();
  });
});

describe("parseRetentionDays", () => {
  it("accepts whole days from 5 to 365", () => {
    expect(parseRetentionDays("5")).toBe(5);
    expect(parseRetentionDays("365")).toBe(365);
    expect(parseRetentionDays("90")).toBe(90);
  });

  it("refuses blank and out of range values", () => {
    expect(parseRetentionDays("")).toBeNull();
    expect(parseRetentionDays("4")).toBeNull();
    expect(parseRetentionDays("366")).toBeNull();
    expect(parseRetentionDays("30.5")).toBeNull();
  });
});

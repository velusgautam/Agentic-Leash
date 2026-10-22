import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { checkpointHistory, historyText, insertEvents, openHistoryDb, optimizeHistory, pruneHistory, queryHistory } from "../../src/helper/historyDb";
import { capBytes, formatBytes, parseCapGb, rearmDismissed, storageWarning, type HistoryStats } from "../../src/shared/storage";

const empty = { from: null, to: null, agents: [], path: "", kind: "all", sensitive: false, offset: 0, limit: 50, includeNoise: true };
const row = { ts: 1, agent: "codex" as const, pid: 1, exe: "codex", kind: "write" as const, sensitive: false, source: "eslogger" as const };
const day = 24 * 60 * 60 * 1000;

function historyPath() {
  return join(mkdtempSync(join(tmpdir(), "al-storage-")), "history.db");
}

function count(db: DatabaseSync, sql: string): number {
  return Number((db.prepare(sql).get() as { n: number }).n);
}

describe("history snapshots", () => {
  it("stores identical snapshots once, compressed, and reads them back", () => {
    const history = openHistoryDb(historyPath());
    const text = "export const a = 1;\n".repeat(200);
    insertEvents(history, [
      { ...row, path: "/Users/me/project/a.ts", beforeBlob: "old", afterBlob: text },
      { ...row, ts: 2, path: "/Users/me/project/b.ts", beforeBlob: "old", afterBlob: text },
    ]);
    expect(count(history, "SELECT count(*) AS n FROM blobs")).toBe(2);
    const blob = history.prepare("SELECT size, length(data) AS stored FROM blobs WHERE size = ?").get(text.length) as { size: number; stored: number };
    expect(blob.stored).toBeLessThan(blob.size);
    expect(count(history, "SELECT count(*) AS n FROM events WHERE before_blob IS NOT NULL OR after_blob IS NOT NULL")).toBe(0);
    const stored = history.prepare("SELECT sha256, after_hash FROM events WHERE id = 1").get() as { sha256: string; after_hash: string };
    expect(stored.sha256).toBe(stored.after_hash);
    expect(historyText(history, 1)).toEqual({ before: "old", after: text });
    expect(historyText(history, 2)).toEqual({ before: "old", after: text });
    history.close();
  });

  it("writes no snapshots for rows in the noise table", () => {
    const history = openHistoryDb(historyPath());
    insertEvents(history, [{ ...row, path: "/tmp/payload", beforeBlob: "a", afterBlob: "b" }]);
    const id = queryHistory(history, empty).rows[0]!.id;
    expect(historyText(history, id)).toEqual({ before: null, after: null });
    expect(count(history, "SELECT count(*) AS n FROM blobs")).toBe(0);
    history.close();
  });

  it("opens a legacy database and still reads its text columns", () => {
    const path = historyPath();
    const legacy = new DatabaseSync(path);
    legacy.exec(`CREATE TABLE events (id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, agent TEXT NOT NULL, pid INTEGER NOT NULL, exe TEXT NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL, dest_path TEXT, sha256 TEXT, before_blob TEXT, after_blob TEXT, sensitive INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL, minute_key TEXT)`);
    legacy.exec("CREATE TABLE blobs (sha256 TEXT PRIMARY KEY, content BLOB NOT NULL)");
    legacy.exec("INSERT INTO events (id, ts, agent, pid, exe, kind, path, before_blob, after_blob, source) VALUES (7, 1, 'codex', 1, 'codex', 'write', '/Users/me/project/a.ts', 'legacy before', 'legacy after', 'eslogger')");
    legacy.close();
    const readOnly = openHistoryDb(path, true);
    expect(historyText(readOnly, 7)).toEqual({ before: "legacy before", after: "legacy after" });
    readOnly.close();
    const history = openHistoryDb(path);
    expect(historyText(history, 7)).toEqual({ before: "legacy before", after: "legacy after" });
    insertEvents(history, [{ ...row, ts: 2, path: "/Users/me/project/b.ts", beforeBlob: "x", afterBlob: "y" }]);
    expect(historyText(history, 8)).toEqual({ before: "x", after: "y" });
    history.close();
  });

  it("keeps referenced blobs through an optimize rebuild and drops orphans", () => {
    const path = historyPath();
    const history = openHistoryDb(path);
    insertEvents(history, [{ ...row, path: "/Users/me/project/a.ts", beforeBlob: "a", afterBlob: "b" }]);
    history.prepare("INSERT INTO blobs (hash, size, data) VALUES ('orphan', 0, zeroblob(10))").run();
    history.close();
    optimizeHistory(path);
    const compact = openHistoryDb(path, true);
    expect(historyText(compact, 1)).toEqual({ before: "a", after: "b" });
    expect(count(compact, "SELECT count(*) AS n FROM blobs")).toBe(2);
    compact.close();
  });

  it("removes a blob once pruning deletes the only row that uses it", () => {
    const history = openHistoryDb(historyPath());
    const now = 100 * day;
    insertEvents(history, [
      { ...row, ts: now - 100 * day, path: "/Users/me/project/old.ts", beforeBlob: "gone", afterBlob: "shared" },
      { ...row, ts: now - day, path: "/Users/me/project/new.ts", beforeBlob: "shared", afterBlob: "kept" },
    ]);
    expect(count(history, "SELECT count(*) AS n FROM blobs")).toBe(3);
    pruneHistory(history, now, 90, 30);
    expect(count(history, "SELECT count(*) AS n FROM blobs")).toBe(2);
    expect(historyText(history, 2)).toEqual({ before: "shared", after: "kept" });
    history.close();
  });
});

describe("history WAL", () => {
  it("limits the journal and truncates the WAL on checkpoint", () => {
    const path = historyPath();
    const history = openHistoryDb(path);
    expect(history.prepare("PRAGMA journal_size_limit").get()).toEqual({ journal_size_limit: 67108864 });
    const big = Array.from({ length: 400 }, (_, index) => ({ ...row, ts: index, path: `/Users/me/project/${index}.ts`, afterBlob: `${index} ${"x".repeat(20_000)}` }));
    insertEvents(history, big);
    expect(existsSync(`${path}-wal`)).toBe(true);
    checkpointHistory(history);
    expect(statSync(`${path}-wal`).size).toBe(0);
    history.close();
  });
});

const stats = (percent: number, hardCap = false): HistoryStats => ({ usedBytes: percent, fileBytes: percent, capBytes: 100, counts: [], prunedAt: null, prunedRows: 0, hardCap });

describe("history cap", () => {
  it("accepts whole gigabytes from 1 to 1024", () => {
    expect(parseCapGb("10")).toBe(10);
    expect(parseCapGb("1")).toBe(1);
    expect(parseCapGb("1024")).toBe(1024);
    for (const value of ["0", "1.5", "abc", "1025", ""]) expect(parseCapGb(value)).toBeNull();
  });

  it("falls back to 10 GB", () => {
    expect(capBytes("")).toBe(10 * 1024 ** 3);
    expect(capBytes("2")).toBe(2 * 1024 ** 3);
  });

  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1.5 * 1024 ** 3)).toBe("1.5 GB");
  });
});

describe("storageWarning", () => {
  it("steps every 10 points from 50%", () => {
    expect(storageWarning(null, 0)).toBeNull();
    expect(storageWarning(stats(49), 0)).toBeNull();
    expect(storageWarning(stats(50), 0)).toEqual({ step: 50, percent: 50, closable: true });
    expect(storageWarning(stats(67), 0)).toEqual({ step: 60, percent: 67, closable: true });
  });

  it("hides dismissed steps until the next one", () => {
    expect(storageWarning(stats(67), 60)).toBeNull();
    expect(storageWarning(stats(72), 60)).toEqual({ step: 70, percent: 72, closable: true });
  });

  it("cannot dismiss the hard cap", () => {
    expect(storageWarning(stats(85, true), 0)).toEqual({ step: 100, percent: 85, closable: false });
    expect(storageWarning(stats(100), 100)).toEqual({ step: 100, percent: 100, closable: false });
  });
});

describe("rearmDismissed", () => {
  it("lowers the dismissed step once usage falls 10 points below it", () => {
    expect(rearmDismissed(stats(65), 80)).toBe(70);
    expect(rearmDismissed(stats(45), 50)).toBe(50);
    expect(rearmDismissed(stats(39), 50)).toBe(40);
    expect(rearmDismissed(null, 50)).toBe(50);
  });
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ContentCache, gitBaseline, readText } from "../../src/helper/snapshots";
import { pollNet } from "../../src/helper/net";
import type { HistoryEvent } from "../../src/shared/types";

const event = (over: Partial<HistoryEvent>): HistoryEvent => ({
  ts: 1,
  agent: "claude-code",
  pid: 4,
  exe: "/usr/local/bin/claude",
  kind: "read",
  path: "/proj/a.txt",
  sensitive: false,
  source: "eslogger",
  ...over,
});

describe("content cache", () => {
  it("keeps the first read and uses it as the before side of a later write", () => {
    const files = new Map<string, string>([["/proj/a.txt", "hello"]]);
    const cache = new ContentCache({
      readText: (path) => files.get(path) ?? null,
      gitShow: () => "from-git",
      granted: (path) => path.startsWith("/proj"),
    });
    cache.observe(event({ kind: "read" }));
    files.set("/proj/a.txt", "hello!");
    const write = cache.observe(event({ kind: "write" }));
    expect(write.beforeBlob).toBe("hello");
    expect(write.afterBlob).toBe("hello!");
  });

  it("falls back to git when the file was never read, and skips files outside a grant", () => {
    const cache = new ContentCache({
      readText: () => "now",
      gitShow: () => "from-git",
      granted: () => false,
    });
    cache.observe(event({ kind: "read" }));
    const write = cache.observe(event({ kind: "write" }));
    expect(write.beforeBlob).toBe("from-git");
    expect(write.afterBlob).toBe("now");
  });

  it("skips snapshots for scratch paths and keeps them for project writes", () => {
    const reads: string[] = [];
    const cache = new ContentCache({
      readText: (path) => (reads.push(path), "text"),
      gitShow: () => "from-git",
      granted: () => true,
    });
    for (const path of ["/private/var/folders/ab/T/x.json", "/tmp/payload"]) {
      expect(cache.observe(event({ kind: "read", path }))).toEqual(event({ kind: "read", path }));
      const write = cache.observe(event({ kind: "write", path }));
      expect(write.beforeBlob).toBeUndefined();
      expect(write.afterBlob).toBeUndefined();
    }
    expect(reads).toEqual([]);
    const write = cache.observe(event({ kind: "write" }));
    expect(write.beforeBlob).toBe("from-git");
    expect(write.afterBlob).toBe("text");
  });

  it("keeps at most 2 000 paths and evicts the oldest", () => {
    const cache = new ContentCache({
      readText: (path) => `cached ${path}`,
      gitShow: () => "from-git",
      granted: () => true,
    });
    for (let index = 1; index <= 2001; index += 1) cache.observe(event({ kind: "read", path: `/proj/${index}` }));
    expect(cache.observe(event({ kind: "write", path: "/proj/1" })).beforeBlob).toBe("from-git");
    expect(cache.observe(event({ kind: "write", path: "/proj/2001" })).beforeBlob).toBe("cached /proj/2001");
  });

  it("reads text under 1 MB and a git HEAD baseline", () => {
    const dir = mkdtempSync(join(tmpdir(), "al-snap-"));
    const file = join(dir, "note.txt");
    writeFileSync(file, "local\n");
    expect(readText(file)).toBe("local\n");
    writeFileSync(file, Buffer.alloc(1_000_001));
    expect(readText(file)).toBeNull();
    expect(readText("/dev/tty")).toBeNull();
    writeFileSync(file, "local\n");
    execFileSync("git", ["init", "-b", "main"], { cwd: dir });
    execFileSync("git", ["add", "note.txt"], { cwd: dir });
    execFileSync("git", ["-c", "user.email=a@b.c", "-c", "user.name=t", "-c", "commit.gpgsign=false", "commit", "-m", "init"], { cwd: dir });
    writeFileSync(file, "changed");
    expect(gitBaseline(file)).toBe("local\n");
  });
});

describe("net poll", () => {
  const sample = "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nnode 4 u 1u IPv4 0t0 TCP 10.0.0.1:1->9.9.9.9:443 (ESTABLISHED)\n";

  it("records a remote once per pid", () => {
    const seen = new Set<string>();
    const first = pollNet({ pids: [4], seen, now: 10, agentFor: () => "claude-code", lsof: () => sample });
    expect(first.map((row) => [row.kind, row.path, row.source])).toEqual([["net", "9.9.9.9:443", "net"]]);
    expect(pollNet({ pids: [4], seen, now: 11, agentFor: () => "claude-code", lsof: () => sample })).toEqual([]);
    expect(pollNet({ pids: [], seen, now: 12, agentFor: () => "claude-code", lsof: () => sample })).toEqual([]);
  });
});

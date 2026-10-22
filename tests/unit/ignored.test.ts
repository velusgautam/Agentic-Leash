import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { insertEvents, openHistoryDb, queryHistory } from "../../src/helper/historyDb";
import { dropIgnored } from "../../src/helper/historyDb";
import { openGrantsDb } from "../../src/shared/db";
import { addIgnored, deleteIgnored, enabledIgnoredPrefixes, ignoredCategory, listIgnored, matchesIgnored, setIgnoredEnabled } from "../../src/shared/ignored";
import { eventBucket } from "../../src/shared/noise";

const home = "/Users/me";
const ignored = [
  `${home}/.cursor/acp-sessions/a/store.db-wal`,
  `${home}/.cursor/chats/a/store.db-shm`,
  `${home}/.cursor/plugins/cache/cursor-public/superpowers/hooks/session-start`,
  `${home}/.cursor/skills-cursor/a/SKILL.md`,
  `${home}/.cursor/extensions/ms-python/package.json`,
  `${home}/.agentic-leash/grants.db-wal`,
  "/Applications/Agentic Leash.app/Contents/MacOS/Agentic Leash",
  "/Volumes/Agentic Leash 3/Agentic Leash.app/Contents/Info.plist",
  "/usr/bin/grep",
  "/bin/cat",
  `${home}/Library/Application Support/Claude/GPUCache/data_0`,
  `${home}/Library/Application Support/Claude/Cache/data_0`,
  `${home}/Library/Application Support/Claude/Code Cache/js`,
  `${home}/Library/Application Support/Claude/DIPS-wal`,
  `${home}/Library/Application Support/Claude/Cookies-journal`,
  `${home}/Library/Application Scripts/com.apple.Safari/x`,
  `${home}/Library/Containers/com.apple.Safari/Data`,
  "/Applications/Claude.app/Contents/MacOS/Claude",
  "/opt/homebrew/var/homebrew/tmp/x",
  "/opt/homebrew/share/man/man1/git.1",
];

const kept = [
  `${home}/Work/studio/src/index.ts`,
  `${home}/Library/Application Support/Claude/local-agent-mode-sessions/a`,
  `${home}/Library/Application Support/Claude/claude-code/sessions`,
  "/opt/homebrew/Cellar/git/bin/git",
  "/Volumes/Other/file",
  "/usr/local/bin/node",
];

function db() {
  return openGrantsDb(join(mkdtempSync(join(tmpdir(), "al-ignored-")), "grants.db"));
}

describe("matchesIgnored", () => {
  it("matches the scanned prefixes and leaves project files", () => {
    const grants = db();
    const prefixes = enabledIgnoredPrefixes(grants);
    for (const path of ignored) expect(prefixes.some((prefix) => matchesIgnored(path, prefix)), path).toBe(true);
    for (const path of kept) expect(prefixes.some((prefix) => matchesIgnored(path, prefix)), path).toBe(false);
    expect(matchesIgnored("/usr/bin/grep", "/bin")).toBe(false);
    expect(matchesIgnored(`${home}/Library/Application Support/Claude/Code Cache/js`, "/Library/Application Support/Claude/Cache")).toBe(false);
    grants.close();
  });
});

describe("eventBucket", () => {
  it("drops an ignored write instead of filing it as noise", () => {
    const grants = db();
    const prefixes = enabledIgnoredPrefixes(grants);
    expect(eventBucket({ kind: "write", path: `${home}/.cursor/chats/a/store.db-wal` }, prefixes)).toBe("drop");
    expect(eventBucket({ kind: "write", path: `${home}/Work/studio/src/index.ts` }, prefixes)).toBe("main");
    expect(eventBucket({ kind: "net", path: "10.0.0.1:443" }, prefixes)).toBe("main");
    grants.close();
  });
});

describe("ignored rows", () => {
  it("classifies built-in paths and user additions", () => {
    expect(ignoredCategory("/.cursor/chats", true)).toBe("Cursor");
    expect(ignoredCategory("/Library/Application Support/Claude/Cache", true)).toBe("Claude");
    expect(ignoredCategory("/Applications/Agentic Leash.app", true)).toBe("Agentic Leash");
    expect(ignoredCategory("/usr/bin", true)).toBe("System");
    expect(ignoredCategory("/opt/homebrew/var", true)).toBe("Homebrew");
    expect(ignoredCategory("/.cursor/custom", false)).toBe("User added");
  });

  it("seeds builtins, lets them be unchecked, and deletes only added rows", () => {
    const grants = db();
    const seeded = listIgnored(grants);
    expect(seeded.length).toBeGreaterThan(10);
    expect(seeded.every((row) => row.builtin && row.enabled)).toBe(true);
    const bin = seeded.find((row) => row.prefix === "/bin");
    expect(bin).toBeTruthy();
    setIgnoredEnabled(grants, bin!.id, false);
    expect(enabledIgnoredPrefixes(grants)).not.toContain("/bin");
    expect(enabledIgnoredPrefixes(grants)).toContain("/usr/bin");
    expect(deleteIgnored(grants, bin!.id)).toBe(false);
    expect(listIgnored(grants).some((row) => row.id === bin!.id)).toBe(true);
    expect(addIgnored(grants, "relative")).toBeNull();
    expect(addIgnored(grants, "/")).toBeNull();
    const added = addIgnored(grants, "/tmp/scratch");
    expect(added?.builtin).toBe(false);
    expect(added?.category).toBe("User added");
    expect(enabledIgnoredPrefixes(grants)).toContain("/tmp/scratch");
    expect(deleteIgnored(grants, added!.id)).toBe(true);
    expect(listIgnored(grants).some((row) => row.prefix === "/tmp/scratch")).toBe(false);
    listIgnored(grants);
    expect(listIgnored(grants).filter((row) => row.prefix === "/usr/bin")).toHaveLength(1);
    grants.close();
  });
});

describe("dropIgnored", () => {
  it("removes matching rows from main history and noise", () => {
    const history = openHistoryDb(join(mkdtempSync(join(tmpdir(), "al-ignored-hist-")), "history.db"));
    const row = { ts: 1, agent: "cursor" as const, pid: 1, exe: "cursor", sensitive: false, source: "eslogger" as const };
    insertEvents(history, [
      { ...row, kind: "write", path: `${home}/.cursor/chats/a/store.db` },
      { ...row, ts: 2, kind: "read", path: `${home}/Work/studio/src/index.ts` },
      { ...row, ts: 3, kind: "write", path: "/tmp/payload" },
    ]);
    dropIgnored(history, ["/.cursor/chats", "/tmp/payload"]);
    expect(queryHistory(history, { from: null, to: null, agents: [], path: "", kind: "all", sensitive: false, includeNoise: true, offset: 0, limit: 20 }).rows.map((item) => item.path)).toEqual([
      `${home}/Work/studio/src/index.ts`,
    ]);
    history.close();
  });
});

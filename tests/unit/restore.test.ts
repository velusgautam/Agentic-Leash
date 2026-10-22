import { describe, expect, it } from "vitest";
import { checkRestore } from "../../src/shared/restore";

const base = { kind: "write", path: "/Users/me/p/a.ts", before: "old", after: "new", current: "new", home: "/Users/me", protectedRoots: ["/Users/me/.leash"] };
const reason = (over: object) => {
  const r = checkRestore({ ...base, ...over });
  return r.ok ? null : r.reason;
};

describe("checkRestore", () => {
  it("allows a clean restore", () => expect(checkRestore(base)).toEqual({ ok: true }));
  it("rejects non-writes", () => expect(reason({ kind: "create" })).toMatch(/Only edits/));
  it("needs an earlier version", () => expect(reason({ before: null })).toBe("There is no earlier version to restore."));
  it("rejects relative, sensitive and protected paths", () => {
    expect(reason({ path: "a.ts" })).toMatch(/absolute/);
    expect(reason({ path: "/Users/me/.ssh/id_rsa" })).toMatch(/protected/);
    expect(reason({ path: "/Users/me/.leash/grants.db" })).toMatch(/protected/);
  });
  it("rejects missing or changed files", () => {
    expect(reason({ current: null })).toMatch(/no longer exists/);
    expect(reason({ current: "newer" })).toBe("The file has changed since this write, so restoring could lose newer work.");
    expect(reason({ after: null })).toMatch(/changed/);
  });
});

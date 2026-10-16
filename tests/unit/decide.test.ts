import { describe, expect, it } from "vitest";
import { decide } from "../../src/hook/decide";
import { extractShellPaths, isUnder } from "../../src/shared/paths";
import type { Grant, HookRequest } from "../../src/shared/types";

const req = (over: Partial<HookRequest>): HookRequest => ({ agent: "cursor", event: "preToolUse", tool: "Read", access: "read", paths: ["/a/b/c"], cwd: "/a/b", ...over });
const grant = (over: Partial<Grant>): Grant => ({ id: 1, agent: "cursor", path: "/a/b", access: "read", source: "leash", createdAt: 0, expiresAt: null, ...over });
const opts = { now: 1_000, lockdown: false, protectedRoots: ["/secret"] };

describe("decide", () => {
  it("denies during lockdown", () => {
    expect(decide(req({}), [], { ...opts, lockdown: true })).toEqual({ kind: "deny", reason: "Agentic Leash lockdown is on" });
  });
  it("denies a protected root", () => {
    expect(decide(req({ paths: ["/secret/grants.db"] }), [], opts).kind).toBe("deny");
  });
  it("prompts when the grant is expired", () => {
    expect(decide(req({}), [grant({ expiresAt: 500 })], opts).kind).toBe("prompt");
  });
  it("prompts when a read grant meets a write", () => {
    expect(decide(req({ access: "write" }), [grant({ access: "read" })], opts).kind).toBe("prompt");
  });
  it("lets a star grant cover every agent", () => {
    expect(decide(req({ agent: "claude-code" }), [grant({ agent: "*" })], opts).kind).toBe("pass");
  });
  it("does not treat /a/bc as inside /a/b", () => {
    expect(isUnder("/a/bc", "/a/b")).toBe(false);
    expect(decide(req({ paths: ["/a/bc"] }), [grant({ path: "/a/b" })], opts).kind).toBe("prompt");
  });
});

describe("extractShellPaths", () => {
  it("expands home and keeps the working directory", () => {
    expect(extractShellPaths("cat ~/.ssh/id_rsa", "/tmp", "/Users/v")).toEqual(["/tmp", "/Users/v/.ssh/id_rsa"]);
  });
  it("resolves relative tokens and quoted paths", () => {
    expect(extractShellPaths("cd ../x && ls", "/a/b", "/Users/v")).toEqual(["/a/b", "/a/x"]);
    expect(extractShellPaths('cat "/tmp/my file.txt"', "/a", "/Users/v")).toContain("/tmp/my file.txt");
  });
});

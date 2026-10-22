import { describe, expect, it } from "vitest";
import { pendingNotice } from "../../src/shared/pendingNotice";

const item = (request: object) => ({ id: "1", askedAt: 0, request: { agent: "cursor", event: "e", tool: "t", access: "write", paths: ["/a/b.ts"], cwd: "/a", ...request } }) as never;

describe("pendingNotice", () => {
  it("names the agent, access and path", () => {
    expect(pendingNotice(item({}))).toEqual({ title: "Cursor wants write access", body: "/a/b.ts" });
  });
  it("prefers the command and counts extra paths", () => {
    expect(pendingNotice(item({ command: " ls -la ", agent: "claude-code" }))).toEqual({ title: "Claude Code wants write access", body: "ls -la" });
    expect(pendingNotice(item({ paths: ["/a", "/b", "/c"], access: "read" })).body).toBe("/a and 2 more");
  });
  it("falls back to the agent id", () => {
    expect(pendingNotice(item({ agent: "zed" })).title).toBe("zed wants write access");
  });
});

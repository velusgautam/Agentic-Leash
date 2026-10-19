import { describe, expect, it } from "vitest";
import { coveredPending, decide } from "../../src/hook/decide";
import { normaliseHook } from "../../src/hook/normalise";
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
  it("lets an active write grant cover a later shell command in that folder", () => {
    const shell = (command: string) => {
      const normalised = normaliseHook({ command, cwd: "/Volumes/Agentic Leash 1", hook_event_name: "beforeShellExecution" }, "cursor");
      if (normalised.kind !== "request") throw new Error("expected a shell request");
      return normalised.request;
    };
    const active = grant({ path: "/Volumes/Agentic Leash 1", access: "write" });
    const first = shell("ls spikes");
    const again = shell("npm test");
    expect(decide(first, [active], opts).kind).toBe("pass");
    expect(decide(again, [active], opts).kind).toBe("pass");
    expect(decide(shell("cat /etc/hosts"), [active], opts).kind).toBe("prompt");
    expect(coveredPending([{ id: "exec", request: again }], [active], opts)).toEqual(["exec"]);
  });
  it("names queued requests a new grant already covers", () => {
    const pending = [
      { id: "1", request: req({ paths: ["/a/b/c.txt"], access: "write" }) },
      { id: "2", request: req({ paths: ["/other"], access: "write" }) },
    ];
    expect(coveredPending(pending, [grant({ path: "/a/b", access: "write" })], opts)).toEqual(["1"]);
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

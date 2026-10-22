import { describe, expect, it } from "vitest";
import { coveredPending, decide } from "../../src/hook/decide";
import { normaliseHook } from "../../src/hook/normalise";
import { extractShellPaths, isUnder } from "../../src/shared/paths";
import type { AllowRule, Grant, HookRequest } from "../../src/shared/types";

const req = (over: Partial<HookRequest>): HookRequest => ({ agent: "cursor", event: "preToolUse", tool: "Read", access: "read", paths: ["/a/b/c"], cwd: "/a/b", ...over });
const grant = (over: Partial<Grant>): Grant => ({ id: 1, agent: "cursor", path: "/a/b", access: "read", source: "leash", command: null, createdAt: 0, expiresAt: null, ...over });
const opts = { now: 1_000, lockdown: false, protectedRoots: ["/secret"] };
const rule = (over: Partial<AllowRule>): AllowRule => ({ id: 1, kind: "folder", agent: "*", value: "/proj", createdAt: 0, ...over });

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
    expect(coveredPending([{ id: "exec", request: again, askedAt: 0 }], [active], opts)).toEqual(["exec"]);
  });
  it("names queued requests a new grant already covers", () => {
    const pending = [
      { id: "1", request: req({ paths: ["/a/b/c.txt"], access: "write" }), askedAt: 0 },
      { id: "2", request: req({ paths: ["/other"], access: "write" }), askedAt: 0 },
    ];
    expect(coveredPending(pending, [grant({ path: "/a/b", access: "write" })], opts)).toEqual(["1"]);
  });
  it("covers a child of a folder grant", () => {
    expect(decide(req({ paths: ["/a/b/c/d"], access: "write" }), [grant({ path: "/a/b", access: "write" })], opts).kind).toBe("pass");
  });
  it("passes an exact command grant from another directory and ignores expiry that has passed", () => {
    const command = "cat /etc/hosts";
    const shell = req({ command, paths: ["/elsewhere", "/etc/hosts"], access: "write", cwd: "/elsewhere" });
    expect(decide(shell, [grant({ command, access: "write", path: "" })], opts).kind).toBe("pass");
    expect(decide(shell, [grant({ command, access: "write", path: "", expiresAt: 500 })], opts).kind).toBe("prompt");
    expect(decide(req({ command: "npm test --watch", paths: ["/a/b"], access: "write" }), [grant({ command: "npm test", access: "write", path: "" })], opts).kind).toBe("prompt");
  });
  it("lets a command rule pass and lets lockdown deny it", () => {
    const shell = req({ command: "npm test", paths: ["/etc/hosts"], access: "write" });
    const rules = [rule({ kind: "command", value: "npm test", agent: "cursor" })];
    expect(decide(shell, [], { ...opts, rules }).kind).toBe("pass");
    expect(decide(shell, [], { ...opts, rules, lockdown: true }).kind).toBe("deny");
  });
  it("lets a folder rule cover a child read and ignores a command grant path", () => {
    expect(decide(req({ paths: ["/proj/sub/a"], access: "read" }), [], { ...opts, rules: [rule({ value: "/proj" })] }).kind).toBe("pass");
    expect(decide(req({ agent: "claude-code", paths: ["/proj/a"], access: "write" }), [], { ...opts, rules: [rule({ agent: "cursor", value: "/proj" })] }).kind).toBe("prompt");
    expect(decide(req({ agent: "claude-code", paths: ["/proj/a"], access: "write" }), [], { ...opts, rules: [rule({ agent: "*", value: "/proj" })] }).kind).toBe("pass");
    expect(decide(req({ paths: ["/secret-file"], access: "read" }), [grant({ command: "npm test", path: "", access: "write" })], opts).kind).toBe("prompt");
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

import { isUnder } from "../shared/paths";
import type { DecideOptions, Grant, HookRequest, Verdict } from "../shared/types";

export function decide(req: HookRequest, grants: Grant[], opts: DecideOptions): Verdict {
  if (opts.lockdown) return { kind: "deny", reason: "Agentic Leash lockdown is on" };
  if (req.paths.some((path) => opts.protectedRoots.some((root) => isUnder(path, root)))) {
    return { kind: "deny", reason: "Agentic Leash protects its own files" };
  }
  if (req.paths.length === 0) return { kind: "pass" };
  const live = grants.filter((grant) => (grant.agent === "*" || grant.agent === req.agent) && (grant.expiresAt === null || grant.expiresAt > opts.now));
  const covered = req.paths.every((path) => live.some((grant) => isUnder(path, grant.path) && (grant.access === "write" || req.access === "read")));
  return covered ? { kind: "pass" } : { kind: "prompt" };
}

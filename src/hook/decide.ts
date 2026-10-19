import { autoAllowCovers } from "../shared/autoAllow";
import { isSensitive, isUnder } from "../shared/paths";
import type { DecideOptions, Grant, HookRequest, PendingRequest, Verdict } from "../shared/types";

export function decide(req: HookRequest, grants: Grant[], opts: DecideOptions): Verdict {
  if (opts.lockdown) return { kind: "deny", reason: "Agentic Leash lockdown is on" };
  if (req.paths.some((path) => opts.protectedRoots.some((root) => isUnder(path, root)))) {
    return { kind: "deny", reason: "Agentic Leash protects its own files" };
  }
  if (req.paths.length === 0) return { kind: "pass" };
  const live = grants.filter((grant) => (grant.agent === "*" || grant.agent === req.agent) && (grant.expiresAt === null || grant.expiresAt > opts.now));
  const covered = req.paths.every((path) => {
    if (live.some((grant) => isUnder(path, grant.path) && (grant.access === "write" || req.access === "read"))) return true;
    return req.access === "read" && !isSensitive(path, opts.home) && autoAllowCovers(req.agent, path, opts.autoAllowOff ?? []);
  });
  return covered ? { kind: "pass" } : { kind: "prompt" };
}

export function coveredPending(pending: PendingRequest[], grants: Grant[], opts: DecideOptions): string[] {
  return pending.filter((item) => decide(item.request, grants, opts).kind === "pass").map((item) => item.id);
}

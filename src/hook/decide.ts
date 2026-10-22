import { autoAllowCovers } from "../shared/autoAllow";
import { isSensitive, isUnder } from "../shared/paths";
import type { DecideOptions, Grant, HookRequest, PendingRequest, Verdict } from "../shared/types";

export function decide(req: HookRequest, grants: Grant[], opts: DecideOptions): Verdict {
  if (opts.lockdown) return { kind: "deny", reason: "Agentic Leash lockdown is on" };
  if (req.paths.some((path) => opts.protectedRoots.some((root) => isUnder(path, root)))) {
    return { kind: "deny", reason: "Agentic Leash protects its own files" };
  }
  const rules = opts.rules ?? [];
  const live = grants.filter((grant) => (grant.agent === "*" || grant.agent === req.agent) && (grant.expiresAt === null || grant.expiresAt > opts.now));
  const command = req.command?.trim() ?? "";
  const sameAgent = (agent: string) => agent === "*" || agent === req.agent;
  if (command && (live.some((grant) => grant.command != null && grant.command.trim() === command && sameAgent(grant.agent)) || rules.some((rule) => rule.kind === "command" && sameAgent(rule.agent) && rule.value.trim() === command))) {
    return { kind: "pass" };
  }
  if (req.paths.length === 0) return { kind: "pass" };
  const covered = req.paths.every((path) => {
    if (live.some((grant) => grant.command == null && isUnder(path, grant.path) && (grant.access === "write" || req.access === "read"))) return true;
    if (rules.some((rule) => rule.kind === "folder" && sameAgent(rule.agent) && isUnder(path, rule.value))) return true;
    return req.access === "read" && !isSensitive(path, opts.home) && autoAllowCovers(req.agent, path, opts.autoAllowOff ?? []);
  });
  return covered ? { kind: "pass" } : { kind: "prompt" };
}

export function coveredPending(pending: PendingRequest[], grants: Grant[], opts: DecideOptions): string[] {
  return pending.filter((item) => decide(item.request, grants, opts).kind === "pass").map((item) => item.id);
}

import { decide } from "./decide";
import { normaliseHook } from "./normalise";
import { respond } from "./respond";
import { parseAutoAllowOff } from "../shared/autoAllow";
import { getSetting, listGrants, recordDecision } from "../shared/db";
import { protectedRoots } from "../shared/constants";
import type { DatabaseSync } from "node:sqlite";
import type { HookRequest, Verdict } from "../shared/types";

export type HookAnswer = "allow" | "deny" | "timeout";

export async function handlePayload(options: {
  entry: "claude" | "cursor" | "codex" | "gemini";
  raw: unknown;
  db: DatabaseSync;
  now: number;
  home: string;
  ask: (request: HookRequest) => Promise<HookAnswer>;
}): Promise<{ stdout: string; exitCode: number }> {
  const started = Date.now();
  const normalised = normaliseHook(options.raw, options.entry, options.home);
  if (normalised.kind === "ignore") return { stdout: "", exitCode: 0 };
  const request = normalised.request;
  const lockdown = getSetting(options.db, "lockdown", "0") === "1";
  let verdict: Verdict = decide(request, listGrants(options.db), {
    now: options.now,
    lockdown,
    protectedRoots: protectedRoots(options.home),
    home: options.home,
    autoAllowOff: parseAutoAllowOff(getSetting(options.db, "auto_allow_off", "[]")),
  });
  let answer: HookAnswer | null = null;
  if (verdict.kind === "prompt") {
    answer = await options.ask(request);
    verdict = answer === "allow" ? { kind: "pass" } : answer === "deny" ? { kind: "deny", reason: "Denied in Agentic Leash" } : verdict;
  }
  const output = answer === "timeout" ? respond(options.entry, "timeout") : respond(options.entry, verdict.kind === "prompt" ? "timeout" : verdict);
  try {
    recordDecision(options.db, {
      ts: options.now,
      agent: request.agent,
      tool: request.tool,
      paths: request.paths,
      verdict: answer === "timeout" ? "timeout" : verdict.kind,
      reason: verdict.kind === "deny" ? verdict.reason : undefined,
      durationMs: Math.max(0, options.now - started),
    });
  } catch {
    /* a locked decision log must not fail the tool call */
  }
  return output;
}

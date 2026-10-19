import { describe, expect, it } from "vitest";
import { Broker } from "../../src/main/broker";
import type { HookRequest } from "../../src/shared/types";

const request = (over: Partial<HookRequest> = {}): HookRequest => ({
  agent: "cursor",
  event: "preToolUse",
  tool: "Write",
  access: "write",
  paths: ["/Volumes/Agentic Leash 1"],
  cwd: "/Volumes/Agentic Leash 1",
  ...over,
});

describe("Broker", () => {
  it("joins a second request for the same path onto the open prompt", async () => {
    const seen: number[] = [];
    const broker = new Broker((pending) => seen.push(pending.length));
    const first = broker.offer("a", request());
    const second = broker.offer("b", request());
    expect(broker.list()).toHaveLength(1);
    expect(seen).toEqual([1]);
    broker.decide("a", { decision: "allow", ttlSeconds: 60 });
    await expect(first).resolves.toMatchObject({ id: "a", decision: "allow" });
    await expect(second).resolves.toMatchObject({ id: "b", decision: "allow" });
    expect(broker.list()).toHaveLength(0);
  });

  it("keeps a different command as its own prompt", () => {
    const broker = new Broker(() => {});
    void broker.offer("a", request({ command: "ls" }));
    void broker.offer("b", request({ command: "rm notes.txt" }));
    expect(broker.list()).toHaveLength(2);
  });
});

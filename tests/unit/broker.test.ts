import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Broker, ONCE_MEMORY_MS } from "../../src/main/broker";
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

  it("records when the prompt was asked and keeps it when a second request joins", () => {
    const broker = new Broker(() => {});
    const before = Date.now();
    void broker.offer("a", request());
    const askedAt = broker.list()[0]?.askedAt ?? 0;
    expect(askedAt).toBeGreaterThanOrEqual(before);
    expect(askedAt).toBeLessThanOrEqual(Date.now());
    void broker.offer("b", request());
    expect(broker.list()).toHaveLength(1);
    expect(broker.list()[0]?.askedAt).toBe(askedAt);
  });
});

describe("Broker cancel, sessions and once memory", () => {
  it("drops the prompt when its last waiter aborts, keeps it while another waits", () => {
    const seen: number[] = [];
    const broker = new Broker((pending) => seen.push(pending.length));
    const a = new AbortController();
    const b = new AbortController();
    void broker.offer("a", request(), a.signal);
    void broker.offer("b", request(), b.signal);
    a.abort();
    expect(broker.list()).toHaveLength(1);
    b.abort();
    expect(broker.list()).toHaveLength(0);
    expect(seen).toEqual([1, 0]);
  });

  it("keeps the first requester's prompt for a later waiter when the first aborts", async () => {
    const broker = new Broker(() => {});
    const a = new AbortController();
    void broker.offer("a", request(), a.signal);
    const second = broker.offer("b", request());
    a.abort();
    broker.decide("a", { decision: "allow" });
    await expect(second).resolves.toMatchObject({ id: "b", decision: "allow" });
  });

  it("removes the pending item when the hook socket closes", async () => {
    const path = join(tmpdir(), `al-broker-${process.pid}-${Date.now()}.sock`);
    const broker = new Broker(() => {});
    broker.listen(path);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const client = connect(path);
    await new Promise((resolve) => client.once("connect", resolve));
    client.write(`${JSON.stringify({ id: "s", request: request() })}\n`);
    await vi.waitFor(() => expect(broker.list()).toHaveLength(1));
    client.destroy();
    await vi.waitFor(() => expect(broker.list()).toHaveLength(0));
    broker.close();
  });

  it("does not share a prompt across sessions", () => {
    const broker = new Broker(() => {});
    void broker.offer("a", request({ sessionId: "s1" }));
    void broker.offer("b", request({ sessionId: "s2" }));
    void broker.offer("c", request({ sessionId: "s1" }));
    void broker.offer("d", request());
    void broker.offer("e", request({ sessionId: undefined }));
    expect(broker.list().map((item) => item.id)).toEqual(["a", "b", "d"]);
  });

  it("allows the same request again for 15 seconds after Allow once", async () => {
    let clock = 1_000;
    const broker = new Broker(() => {}, () => clock);
    const first = broker.offer("a", request({ sessionId: "s1" }));
    broker.decide("a", { decision: "allow", once: true });
    await first;
    await expect(broker.offer("b", request({ sessionId: "s1" }))).resolves.toMatchObject({ decision: "allow" });
    expect(broker.list()).toHaveLength(0);
    void broker.offer("c", request({ sessionId: "s2" }));
    expect(broker.list()).toHaveLength(1);
    clock += ONCE_MEMORY_MS + 1;
    void broker.offer("d", request({ sessionId: "s1" }));
    expect(broker.list().map((item) => item.id)).toEqual(["c", "d"]);
  });

  it("does not remember an allow that is not once", () => {
    const broker = new Broker(() => {});
    void broker.offer("a", request());
    broker.decide("a", { decision: "allow", ttlSeconds: 60 });
    void broker.offer("b", request());
    expect(broker.list()).toHaveLength(1);
  });
});

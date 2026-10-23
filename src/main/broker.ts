import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { dirname } from "node:path";
import type { HookRequest, PendingRequest, RememberedDenial } from "../shared/types";

export type BrokerDecision = { decision: "allow" | "deny" | "timeout"; ttlSeconds?: number };

function samePrompt(a: HookRequest, b: HookRequest): boolean {
  if (a.agent !== b.agent || a.access !== b.access || (a.command ?? "") !== (b.command ?? "") || (a.url ?? "") !== (b.url ?? "")) return false;
  const left = [...a.paths].sort();
  const right = [...b.paths].sort();
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

export const DENY_MEMORY_MS = 10 * 60 * 1000;

function denialKey(request: HookRequest): string {
  return JSON.stringify([request.agent, request.sessionId ?? "", request.access, request.command ?? "", request.url ?? "", [...request.paths].sort()]);
}

export class Broker {
  private readonly pending = new Map<string, { request: HookRequest; askedAt: number; waiters: ((decision: BrokerDecision) => void)[] }>();
  // A denied request from the same session is denied again without a popup for a while.
  private readonly denied = new Map<string, { request: HookRequest; until: number }>();
  // Pending id to denial key, so Undo can find a denial after the request is gone.
  private readonly deniedIds = new Map<string, string>();
  private server: Server | null = null;
  private seq = 0;

  constructor(
    private readonly onChange: (pending: PendingRequest[]) => void,
    private readonly now: () => number = Date.now,
  ) {}

  forgetDenials(): void {
    this.denied.clear();
    this.deniedIds.clear();
  }

  forgetDenial(key: string): boolean {
    return this.denied.delete(key);
  }

  /** Forgets the denial made when answering pending request `id`. */
  undoDenial(id: string): boolean {
    const key = this.deniedIds.get(id);
    this.deniedIds.delete(id);
    return key !== undefined && this.denied.delete(key);
  }

  listDenials(): RememberedDenial[] {
    const now = this.now();
    return [...this.denied.entries()]
      .filter(([, item]) => item.until > now)
      .map(([key, { request, until }]) => ({ key, agent: request.agent, sessionId: request.sessionId ?? null, label: request.command?.trim() || request.url || request.paths.join(", "), until }))
      .sort((a, b) => b.until - a.until);
  }

  /** Forgets every denial for this agent that names the command or one of the paths. */
  forgetMatching(agent: string, command: string | null, paths: string[]): number {
    let count = 0;
    for (const [key, { request }] of this.denied) {
      if (request.agent !== agent) continue;
      const hit = command ? request.command?.trim() === command.trim() : paths.some((path) => request.paths.includes(path));
      if (hit && this.denied.delete(key)) count += 1;
    }
    return count;
  }

  list(): PendingRequest[] {
    return [...this.pending.entries()].map(([id, item]) => ({ id, request: item.request, askedAt: item.askedAt }));
  }

  offer(id: string, request: HookRequest): Promise<{ id: string; decision: string; ttlSeconds?: number }> {
    return new Promise((resolve) => {
      const deliver = (decision: BrokerDecision) => resolve({ id, decision: decision.decision, ttlSeconds: decision.ttlSeconds });
      const until = this.denied.get(denialKey(request))?.until;
      if (until !== undefined && until > this.now()) {
        deliver({ decision: "deny" });
        return;
      }
      for (const item of this.pending.values()) {
        if (!samePrompt(item.request, request)) continue;
        item.waiters.push(deliver);
        return;
      }
      this.pending.set(id, { request, askedAt: Date.now(), waiters: [deliver] });
      this.onChange(this.list());
    });
  }

  decide(id: string, decision: BrokerDecision): void {
    const item = this.pending.get(id);
    if (!item) return;
    this.pending.delete(id);
    if (decision.decision === "deny") {
      const now = this.now();
      for (const [key, { until }] of this.denied) if (until <= now) this.denied.delete(key);
      const key = denialKey(item.request);
      this.denied.set(key, { request: item.request, until: now + DENY_MEMORY_MS });
      this.deniedIds.set(id, key);
      if (this.deniedIds.size > 50) this.deniedIds.delete(this.deniedIds.keys().next().value!);
    }
    for (const waiter of item.waiters) waiter(decision);
    this.onChange(this.list());
  }

  listen(socketPath: string): Server {
    const pipe = process.platform === "win32";
    if (!pipe) {
      mkdirSync(dirname(socketPath), { recursive: true });
      rmSync(socketPath, { force: true });
    }
    const server = createServer((socket) => {
      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += chunk.toString();
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          this.take(line).then((response) => socket.write(`${JSON.stringify(response)}\n`));
          newline = buffer.indexOf("\n");
        }
      });
    });
    server.listen(socketPath, () => pipe || chmodSync(socketPath, 0o600));
    this.server = server;
    return server;
  }

  close(): void {
    this.server?.close();
  }

  private take(line: string): Promise<{ id: string; decision: string; ttlSeconds?: number }> {
    const message = JSON.parse(line) as { id: string; request: HookRequest };
    return this.offer(message.id || String(++this.seq), message.request);
  }
}

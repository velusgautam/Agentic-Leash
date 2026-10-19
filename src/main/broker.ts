import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { dirname } from "node:path";
import type { HookRequest, PendingRequest } from "../shared/types";

export type BrokerDecision = { decision: "allow" | "deny" | "timeout"; ttlSeconds?: number };

function samePrompt(a: HookRequest, b: HookRequest): boolean {
  if (a.agent !== b.agent || a.access !== b.access || (a.command ?? "") !== (b.command ?? "") || (a.url ?? "") !== (b.url ?? "")) return false;
  const left = [...a.paths].sort();
  const right = [...b.paths].sort();
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

export class Broker {
  private readonly pending = new Map<string, { request: HookRequest; waiters: ((decision: BrokerDecision) => void)[] }>();
  private server: Server | null = null;
  private seq = 0;

  constructor(private readonly onChange: (pending: PendingRequest[]) => void) {}

  list(): PendingRequest[] {
    return [...this.pending.entries()].map(([id, item]) => ({ id, request: item.request }));
  }

  offer(id: string, request: HookRequest): Promise<{ id: string; decision: string; ttlSeconds?: number }> {
    return new Promise((resolve) => {
      const deliver = (decision: BrokerDecision) => resolve({ id, decision: decision.decision, ttlSeconds: decision.ttlSeconds });
      for (const item of this.pending.values()) {
        if (!samePrompt(item.request, request)) continue;
        item.waiters.push(deliver);
        return;
      }
      this.pending.set(id, { request, waiters: [deliver] });
      this.onChange(this.list());
    });
  }

  decide(id: string, decision: BrokerDecision): void {
    const item = this.pending.get(id);
    if (!item) return;
    this.pending.delete(id);
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

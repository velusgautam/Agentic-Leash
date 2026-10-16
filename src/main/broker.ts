import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { dirname } from "node:path";
import type { HookRequest, PendingRequest } from "../shared/types";

export type BrokerDecision = { decision: "allow" | "deny" | "timeout"; ttlSeconds?: number };

export class Broker {
  private readonly pending = new Map<string, { request: HookRequest; resolve: (decision: BrokerDecision) => void }>();
  private server: Server | null = null;
  private seq = 0;

  constructor(private readonly onChange: (pending: PendingRequest[]) => void) {}

  list(): PendingRequest[] {
    return [...this.pending.entries()].map(([id, item]) => ({ id, request: item.request }));
  }

  decide(id: string, decision: BrokerDecision): void {
    const item = this.pending.get(id);
    if (!item) return;
    this.pending.delete(id);
    item.resolve(decision);
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
    const id = message.id || String(++this.seq);
    return new Promise((resolve) => {
      this.pending.set(id, {
        request: message.request,
        resolve: (decision) => resolve({ id, decision: decision.decision, ttlSeconds: decision.ttlSeconds }),
      });
      this.onChange(this.list());
    });
  }
}

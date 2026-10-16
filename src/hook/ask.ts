import { connect } from "node:net";
import type { HookRequest } from "../shared/types";
import type { HookAnswer } from "./handle";

export function askApp(socketPath: string, request: HookRequest, timeoutMs: number): Promise<HookAnswer> {
  return new Promise((resolve) => {
    const socket = connect(socketPath);
    const timer = setTimeout(() => {
      socket.destroy();
      resolve("timeout");
    }, timeoutMs);
    let buffer = "";
    socket.on("error", () => {
      clearTimeout(timer);
      resolve("timeout");
    });
    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ id: `${process.pid}-${Date.now()}`, request })}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      clearTimeout(timer);
      const response = JSON.parse(buffer.slice(0, newline)) as { decision?: string };
      socket.end();
      resolve(response.decision === "allow" || response.decision === "deny" ? response.decision : "timeout");
    });
  });
}

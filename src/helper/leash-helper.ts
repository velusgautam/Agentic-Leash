import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { classify } from "./classify";
import { insertEvents, openHistoryDb, pruneHistory } from "./historyDb";
import { ProcTree, type EsEvent } from "./proctree";
import type { HistoryEvent } from "../shared/types";

const EVENTS = ["open", "close", "create", "unlink", "rename", "exec", "fork", "exit"];

export function startHelper(historyPath: string, eslogger = "/usr/bin/eslogger"): void {
  const db = openHistoryDb(historyPath);
  const tree = new ProcTree();
  const queue: HistoryEvent[] = [];
  const timer = setInterval(() => {
    if (!queue.length) return;
    insertEvents(db, queue.splice(0));
  }, 250);
  const daily = setInterval(() => pruneHistory(db, Date.now()), 24 * 60 * 60 * 1000);
  const child = spawn(eslogger, EVENTS, { stdio: ["ignore", "pipe", "inherit"] });
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    try {
      const event = JSON.parse(line) as EsEvent;
      tree.apply(event);
      const classified = classify(event, tree, process.env.HOME || "/");
      if (classified) queue.push(classified);
    } catch {
      /* eslogger sometimes emits a partial line */
    }
  });
  const stop = () => {
    clearInterval(timer);
    clearInterval(daily);
    child.kill("SIGKILL");
    if (queue.length) insertEvents(db, queue.splice(0));
    db.close();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

if (process.argv[1]?.includes("leash-helper")) {
  const path = process.argv[2] || "/Library/Application Support/AgenticLeash/history.db";
  startHelper(path);
}

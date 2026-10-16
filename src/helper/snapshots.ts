import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, relative } from "node:path";
import type { HistoryEvent } from "../shared/types";

const MAX_BYTES = 1_000_000;

export function readText(file: string): string | null {
  try {
    // Reading a tty or FIFO blocks the helper and steals the user's keystrokes.
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > MAX_BYTES) return null;
    const bytes = readFileSync(file);
    if (bytes.length > MAX_BYTES || bytes.includes(0)) return null;
    return bytes.toString("utf8");
  } catch {
    return null;
  }
}

export function gitBaseline(file: string): string | null {
  try {
    const top = realpathSync(execFileSync("git", ["-C", dirname(file), "-c", "safe.directory=*", "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim());
    const spec = `HEAD:${relative(top, realpathSync(file))}`;
    const text = execFileSync("git", ["-C", top, "-c", "safe.directory=*", "show", spec], { encoding: "utf8", maxBuffer: MAX_BYTES });
    return text.length > MAX_BYTES ? null : text;
  } catch {
    return null;
  }
}

export class ContentCache {
  private readonly cached = new Map<string, string>();

  constructor(private readonly io: { readText: (file: string) => string | null; gitShow: (file: string) => string | null; granted: (file: string) => boolean }) {}

  observe(event: HistoryEvent): HistoryEvent {
    if (event.kind === "read" && this.io.granted(event.path) && !this.cached.has(event.path)) {
      const text = this.io.readText(event.path);
      if (text != null) this.cached.set(event.path, text);
    }
    if (event.kind !== "write") return event;
    const before = this.cached.get(event.path) ?? this.io.gitShow(event.path) ?? undefined;
    const after = this.io.readText(event.path) ?? undefined;
    if (after != null) this.cached.set(event.path, after);
    return { ...event, beforeBlob: before, afterBlob: after };
  }
}

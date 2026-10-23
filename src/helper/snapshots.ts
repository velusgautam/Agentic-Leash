import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, relative } from "node:path";
import { isNoise } from "../shared/noise";
import { redactSecretText } from "../shared/redact";
import type { HistoryEvent } from "../shared/types";

const MAX_BYTES = 1_000_000;
const MAX_PATHS = 2_000;

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

  constructor(
    private readonly io: { readText: (file: string) => string | null; gitShow: (file: string) => string | null; granted: (file: string) => boolean; secret?: (file: string) => boolean },
  ) {}

  private remember(path: string, text: string): void {
    this.cached.delete(path);
    this.cached.set(path, text);
    if (this.cached.size > MAX_PATHS) this.cached.delete(this.cached.keys().next().value!);
  }

  // History must not become a second copy of a secret, so secret files are stored redacted.
  private read(path: string, source: (file: string) => string | null): string | null {
    const text = source(path);
    return text != null && this.io.secret?.(path) ? redactSecretText(text) : text;
  }

  observe(event: HistoryEvent): HistoryEvent {
    if (isNoise(event.path)) return event;
    if (event.kind === "read" && this.io.granted(event.path) && !this.cached.has(event.path)) {
      const text = this.read(event.path, this.io.readText);
      if (text != null) this.remember(event.path, text);
    }
    if (event.kind !== "write") return event;
    const before = this.cached.get(event.path) ?? this.read(event.path, this.io.gitShow) ?? undefined;
    const after = this.read(event.path, this.io.readText) ?? undefined;
    if (after != null) this.remember(event.path, after);
    return { ...event, beforeBlob: before, afterBlob: after };
  }
}

import { isSensitive, isUnder } from "./paths";

export function checkRestore(input: { kind: string; path: string; before: string | null; after: string | null; current: string | null; home: string; protectedRoots: string[] }): { ok: true } | { ok: false; reason: string } {
  const { kind, path, before, after, current, home } = input;
  if (kind !== "write") return { ok: false, reason: "Only edits to existing files can be restored." };
  if (before === null) return { ok: false, reason: "There is no earlier version to restore." };
  if (!path.startsWith("/")) return { ok: false, reason: "That file path is not absolute, so it can't be restored." };
  if (isSensitive(path, home) || input.protectedRoots.some((root) => isUnder(path, root))) return { ok: false, reason: "This file is protected and can't be restored from here." };
  if (current === null) return { ok: false, reason: "The file no longer exists, so it can't be restored." };
  if (after === null || current !== after) return { ok: false, reason: "The file has changed since this write, so restoring could lose newer work." };
  return { ok: true };
}

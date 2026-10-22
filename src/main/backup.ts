import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { leashDir } from "../shared/constants";
import { readJson } from "./agents/fs";

function backupLog(home?: string): string {
  return join(leashDir(home), "backups.json");
}

export function writtenBackups(home?: string): string[] {
  const list = readJson(backupLog(home));
  return Array.isArray(list) ? list.filter((path): path is string => typeof path === "string") : [];
}

export function writeWithBackup(path: string, text: string): void {
  if (existsSync(path)) {
    const backup = `${path}.bak`;
    copyFileSync(path, backup);
    const written = writtenBackups();
    if (!written.includes(backup)) {
      mkdirSync(leashDir(), { recursive: true });
      writeFileSync(backupLog(), JSON.stringify([...written, backup]));
    }
  }
  writeFileSync(path, text);
}

export function backupTargets(home: string, claudeRoot: string): string[] {
  return [join(claudeRoot, "settings.json"), ...[".claude.json", ".cursor/hooks.json", ".cursor/cli-config.json", ".cursor/mcp.json", ".codex/hooks.json", ".gemini/settings.json", ".hermes/config.yaml"].map((path) => join(home, path))];
}

export function readTextJson(path: string): unknown {
  return readJson(path);
}

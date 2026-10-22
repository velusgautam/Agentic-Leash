import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readJson } from "./agents/fs";

export function writeWithBackup(path: string, text: string): void {
  if (existsSync(path)) copyFileSync(path, `${path}.bak`);
  writeFileSync(path, text);
}

export function backupTargets(home: string, claudeRoot: string): string[] {
  return [join(claudeRoot, "settings.json"), ...[".claude.json", ".cursor/hooks.json", ".cursor/cli-config.json", ".cursor/mcp.json", ".codex/hooks.json", ".gemini/settings.json", ".hermes/config.yaml"].map((path) => join(home, path))];
}

export function readTextJson(path: string): unknown {
  return readJson(path);
}

import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { readJson } from "./agents/fs";

export function writeWithBackup(path: string, text: string): void {
  if (existsSync(path)) copyFileSync(path, `${path}.bak`);
  writeFileSync(path, text);
}

export function readTextJson(path: string): unknown {
  return readJson(path);
}

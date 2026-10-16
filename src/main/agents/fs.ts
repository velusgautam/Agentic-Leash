import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

export function readJsonFiles(dir: string): { name: string; value: unknown }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({ name, value: readJson(join(dir, name)) }));
}

import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, type ElectronApplication } from "@playwright/test";

export function launch(args: string[] = [], env: Record<string, string> = {}): Promise<ElectronApplication> {
  const home = env.AGENTIC_LEASH_HOME || mkdtempSync(join(tmpdir(), "al-home-"));
  mkdirSync(join(home, ".claude"), { recursive: true });
  mkdirSync(join(home, ".cursor"), { recursive: true });
  return electron.launch({
    args: [".", ...args],
    env: { ...process.env, AGENTIC_LEASH_USER_DATA: mkdtempSync(join(tmpdir(), "al-e2e-")), AGENTIC_LEASH_HOME: home, AGENTIC_LEASH_HISTORY_DIR: mkdtempSync(join(tmpdir(), "al-history-")), AGENTIC_LEASH_SKIP_SETUP: "1", ...env },
  });
}

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, type ElectronApplication } from "@playwright/test";

export function launch(args: string[] = []): Promise<ElectronApplication> {
  return electron.launch({
    args: [".", ...args],
    env: { ...process.env, AGENTIC_LEASH_USER_DATA: mkdtempSync(join(tmpdir(), "al-e2e-")), AGENTIC_LEASH_HOME: mkdtempSync(join(tmpdir(), "al-home-")), AGENTIC_LEASH_HISTORY_DIR: mkdtempSync(join(tmpdir(), "al-history-")) },
  });
}

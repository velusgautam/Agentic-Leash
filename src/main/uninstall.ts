import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { APP_NAME, leashDir } from "../shared/constants";
import { backupTargets } from "./backup";
import { sweepAgentPath } from "./helperInstall";
import { LOGIN_AGENT_LABEL, loginAgentPath } from "./loginItem";

export type LeftoverOptions = { home: string; claudeRoot: string; userData: string; historyDir: string; systemHistory: string };

export function uninstallLeftovers({ home, claudeRoot, userData, historyDir, systemHistory }: LeftoverOptions): string[] {
  const hermesHooks = join(home, ".hermes/agent-hooks");
  const hermesShared = existsSync(hermesHooks) && readdirSync(hermesHooks).some((name) => name !== "agentic-leash.sh");
  const library = (path: string) => join(home, "Library", path);
  return [
    ...backupTargets(home, claudeRoot).map((path) => `${path}.bak`),
    join(hermesHooks, "agentic-leash.sh"),
    ...(hermesShared ? [] : [hermesHooks]),
    sweepAgentPath(home),
    loginAgentPath(home),
    leashDir(home),
    userData,
    library(`Logs/${APP_NAME}`),
    library(`Caches/${LOGIN_AGENT_LABEL}`),
    library(`Caches/${APP_NAME}`),
    library(`Preferences/${LOGIN_AGENT_LABEL}.plist`),
    library(`Saved Application State/${LOGIN_AGENT_LABEL}.savedState`),
    library(`HTTPStorages/${LOGIN_AGENT_LABEL}`),
    ...(historyDir === systemHistory ? [] : [historyDir]),
  ];
}

export function removeLeftovers(paths: string[]): void {
  for (const path of paths) rmSync(path, { recursive: true, force: true });
}

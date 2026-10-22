import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { backupTargets, writeWithBackup } from "../../src/main/backup";
import { mergeHermesConfig, removeHermesConfig } from "../../src/main/hermesHooks";
import { mergeClaudeHooks, mergeCodexHooks, mergeCursorHooks, mergeGeminiHooks, removeClaudeHooks, removeCodexHooks, removeCursorHooks, removeGeminiHooks } from "../../src/main/hookInstall";
import { removeLeftovers, uninstallLeftovers } from "../../src/main/uninstall";

const COMMAND = "ELECTRON_RUN_AS_NODE=1 /app/leash leash-hook.js";

function seed(path: string, text = "x"): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "al-uninstall-"));
  const home = join(root, "home");
  const claudeRoot = join(home, ".claude");
  const userData = join(home, "Library/Application Support/Agentic Leash");
  const systemHistory = join(root, "system-history");
  return { root, home, claudeRoot, userData, systemHistory };
}

describe("backupTargets", () => {
  it("lists every file the app writes with a backup", () => {
    expect(backupTargets("/h", "/c")).toEqual([
      "/c/settings.json",
      "/h/.claude.json",
      "/h/.cursor/hooks.json",
      "/h/.cursor/cli-config.json",
      "/h/.cursor/mcp.json",
      "/h/.codex/hooks.json",
      "/h/.gemini/settings.json",
      "/h/.hermes/config.yaml",
    ]);
  });

  it("is reviewed whenever a writeWithBackup caller is added", () => {
    const out = execFileSync("grep", ["-rn", "writeWithBackup(", join(__dirname, "../../src/main")], { encoding: "utf8" });
    const callers = out.trim().split("\n").filter((line) => !line.includes("export function writeWithBackup"));
    expect(callers).toHaveLength(8);
  });
});

describe("uninstallLeftovers", () => {
  it("lists backups, hook scripts, launch agents, app data, and macOS app files", () => {
    const { home, claudeRoot, userData, systemHistory } = setup();
    const historyDir = join(home, "dev-history");
    const paths = uninstallLeftovers({ home, claudeRoot, userData, historyDir, systemHistory });
    for (const target of backupTargets(home, claudeRoot)) expect(paths).toContain(`${target}.bak`);
    expect(paths).toEqual(expect.arrayContaining([
      join(home, ".hermes/agent-hooks/agentic-leash.sh"),
      join(home, ".hermes/agent-hooks"),
      join(home, "Library/LaunchAgents/com.agenticleash.sweep.plist"),
      join(home, "Library/LaunchAgents/com.agenticleash.app.plist"),
      join(home, ".agentic-leash"),
      userData,
      join(home, "Library/Logs/Agentic Leash"),
      join(home, "Library/Caches/com.agenticleash.app"),
      join(home, "Library/Caches/Agentic Leash"),
      join(home, "Library/Preferences/com.agenticleash.app.plist"),
      join(home, "Library/Saved Application State/com.agenticleash.app.savedState"),
      join(home, "Library/HTTPStorages/com.agenticleash.app"),
      historyDir,
    ]));
    for (const target of backupTargets(home, claudeRoot)) expect(paths).not.toContain(target);
  });

  it("leaves the root-owned system history to the helper uninstall", () => {
    const { home, claudeRoot, userData, systemHistory } = setup();
    expect(uninstallLeftovers({ home, claudeRoot, userData, historyDir: systemHistory, systemHistory })).not.toContain(systemHistory);
  });

  it("keeps the Hermes agent-hooks dir when other hooks live there", () => {
    const { home, claudeRoot, userData, systemHistory } = setup();
    seed(join(home, ".hermes/agent-hooks/agentic-leash.sh"));
    seed(join(home, ".hermes/agent-hooks/other.sh"));
    const paths = uninstallLeftovers({ home, claudeRoot, userData, historyDir: systemHistory, systemHistory });
    expect(paths).toContain(join(home, ".hermes/agent-hooks/agentic-leash.sh"));
    expect(paths).not.toContain(join(home, ".hermes/agent-hooks"));
  });
});

describe("removeLeftovers", () => {
  it("removes every leftover and keeps agent configs with only our hooks stripped", () => {
    const { home, claudeRoot, userData, systemHistory } = setup();
    const historyDir = join(home, "dev-history");
    const hooks = { claude: join(claudeRoot, "settings.json"), cursor: join(home, ".cursor/hooks.json"), codex: join(home, ".codex/hooks.json"), gemini: join(home, ".gemini/settings.json") };
    const hermes = join(home, ".hermes/config.yaml");
    seed(hooks.claude, JSON.stringify(mergeClaudeHooks({ model: "opus" }, COMMAND)));
    seed(hooks.cursor, JSON.stringify(mergeCursorHooks({ version: 1 }, COMMAND)));
    seed(hooks.codex, JSON.stringify(mergeCodexHooks({ keep: true }, COMMAND)));
    seed(hooks.gemini, JSON.stringify(mergeGeminiHooks({ theme: "dark" }, COMMAND)));
    seed(hermes, mergeHermesConfig("model: x\n", join(home, ".hermes/agent-hooks/agentic-leash.sh")));
    for (const target of backupTargets(home, claudeRoot)) seed(`${target}.bak`, "old");
    for (const path of ["Library/LaunchAgents/com.agenticleash.sweep.plist", "Library/LaunchAgents/com.agenticleash.app.plist", ".agentic-leash/grants.db", ".hermes/agent-hooks/agentic-leash.sh", "Library/Logs/Agentic Leash/main.log", "Library/Caches/com.agenticleash.app/Cache.db", "Library/Caches/Agentic Leash/data", "Library/Preferences/com.agenticleash.app.plist", "Library/Saved Application State/com.agenticleash.app.savedState/data.data", "Library/HTTPStorages/com.agenticleash.app/httpstorages.sqlite", "dev-history/history.db"]) seed(join(home, path));
    seed(join(userData, "ui-state.json"));

    writeWithBackup(hooks.claude, JSON.stringify(removeClaudeHooks(JSON.parse(readFileSync(hooks.claude, "utf8")))));
    writeWithBackup(hooks.cursor, JSON.stringify(removeCursorHooks(JSON.parse(readFileSync(hooks.cursor, "utf8")))));
    writeWithBackup(hooks.codex, JSON.stringify(removeCodexHooks(JSON.parse(readFileSync(hooks.codex, "utf8")))));
    writeWithBackup(hooks.gemini, JSON.stringify(removeGeminiHooks(JSON.parse(readFileSync(hooks.gemini, "utf8")))));
    writeWithBackup(hermes, removeHermesConfig(readFileSync(hermes, "utf8")));
    const paths = uninstallLeftovers({ home, claudeRoot, userData, historyDir, systemHistory });
    removeLeftovers(paths);

    for (const path of paths) expect(existsSync(path), path).toBe(false);
    expect(JSON.parse(readFileSync(hooks.claude, "utf8")).model).toBe("opus");
    expect(readFileSync(hooks.claude, "utf8")).not.toContain(COMMAND);
    expect(JSON.parse(readFileSync(hooks.cursor, "utf8")).version).toBe(1);
    expect(readFileSync(hooks.cursor, "utf8")).not.toContain(COMMAND);
    expect(JSON.parse(readFileSync(hooks.codex, "utf8")).keep).toBe(true);
    expect(readFileSync(hooks.codex, "utf8")).not.toContain(COMMAND);
    expect(JSON.parse(readFileSync(hooks.gemini, "utf8")).theme).toBe("dark");
    expect(readFileSync(hooks.gemini, "utf8")).not.toContain(COMMAND);
    expect(readFileSync(hermes, "utf8")).toBe("model: x\n");
    expect(existsSync(join(home, ".hermes"))).toBe(true);
  });

  it("keeps other files in a shared Hermes agent-hooks dir", () => {
    const { home, claudeRoot, userData, systemHistory } = setup();
    seed(join(home, ".hermes/agent-hooks/agentic-leash.sh"));
    seed(join(home, ".hermes/agent-hooks/other.sh"), "theirs");
    removeLeftovers(uninstallLeftovers({ home, claudeRoot, userData, historyDir: systemHistory, systemHistory }));
    expect(existsSync(join(home, ".hermes/agent-hooks/agentic-leash.sh"))).toBe(false);
    expect(readFileSync(join(home, ".hermes/agent-hooks/other.sh"), "utf8")).toBe("theirs");
  });
});

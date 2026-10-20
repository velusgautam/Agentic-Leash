import { connect } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { insertEvents, openHistoryDb } from "../../src/helper/historyDb";
import { launch } from "./launch";

const OUT = "docs/media";

test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture marketing images");

test("marketing screenshots", async () => {
  test.setTimeout(60_000);
  const dir = mkdtempSync(join(tmpdir(), "al-shots-"));
  const db = openHistoryDb(join(dir, "history.db"));
  const now = Date.now();
  const desktop = "/Applications/Claude.app/Contents/MacOS/Claude";
  const cli = "/Users/ada/.local/bin/claude";
  const before = "export function remaining(expiresAt: number | null): string {\n  if (expiresAt === null) return \"Forever\";\n  return \"1h\";\n}\n";
  const after = "export function remaining(expiresAt: number | null): string {\n  if (expiresAt === null) return \"Forever\";\n  const seconds = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));\n  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`;\n  return `${seconds}s`;\n}\n";
  insertEvents(db, [
    { pid: 1, exe: cli, source: "eslogger", sensitive: false, ts: now - 12000, agent: "claude", kind: "read", path: "/Users/ada/Projects/leash/package.json" },
    { pid: 1, exe: desktop, source: "eslogger", sensitive: false, ts: now - 11000, agent: "claude", kind: "write", path: "/Users/ada/Projects/leash/README.md", beforeBlob: "# Agentic Leash\n\n", afterBlob: "# Agentic Leash\n\nSee and control what AI coding agents can touch.\n" },
    { pid: 1, exe: "/Users/ada/.local/bin/cursor-agent", source: "eslogger", sensitive: false, ts: now - 10000, agent: "cursor-agent", kind: "write", path: "/Users/ada/Projects/leash/src/shared/grantView.ts", beforeBlob: before, afterBlob: after },
    { pid: 1, exe: "/Users/ada/.local/bin/codex", source: "eslogger", sensitive: false, ts: now - 9000, agent: "codex", kind: "exec", path: "/usr/bin/git" },
    { pid: 1, exe: "/Users/ada/.local/bin/gemini", source: "eslogger", sensitive: false, ts: now - 8000, agent: "gemini", kind: "read", path: "/Users/ada/Projects/leash/src/main/index.ts" },
    { pid: 1, exe: "/Users/ada/.local/bin/hermes", source: "eslogger", sensitive: false, ts: now - 7000, agent: "hermes", kind: "create", path: "/Users/ada/Projects/leash/src/helper/net.ts" },
    { pid: 1, exe: desktop, source: "eslogger", sensitive: false, ts: now - 6000, agent: "claude", kind: "net", path: "api.anthropic.com:443" },
    { pid: 1, exe: cli, source: "eslogger", sensitive: true, ts: now - 5000, agent: "claude", kind: "read", path: "/Users/ada/.ssh/config" },
    { pid: 1, exe: desktop, source: "eslogger", sensitive: true, ts: now - 4000, agent: "claude", kind: "read", path: "/Users/ada/.aws/credentials" },
  ]);
  db.close();

  const app = await launch([], { AGENTIC_LEASH_HISTORY_DIR: dir });
  const win = await app.firstWindow();
  await win.evaluate(`(async () => {
    await window.leash.setTheme("dark");
    const grants = [
      { agent: "cursor", path: "/Users/ada/Projects/leash", access: "write", ttlSeconds: 15 * 60 },
      { agent: "claude-code", path: "/Users/ada/Projects/leash/src", access: "write", ttlSeconds: 2 * 60 * 60 },
      { agent: "*", path: "/Users/ada/Projects", access: "read", ttlSeconds: 8 * 60 * 60 },
      { agent: "codex", path: "/Users/ada/Projects/leash/docs", access: "write", ttlSeconds: null },
    ];
    for (const grant of grants) await window.leash.createGrant(grant);
  })()`);
  const shot = async (page: typeof win, name: string) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png`, scale: "device" });
  };

  await win.setViewportSize({ width: 1440, height: 640 });
  await expect(win.getByText("/Users/ada/.ssh/config")).toBeVisible();
  await shot(win, "live-sensitive");

  await win.setViewportSize({ width: 1680, height: 860 });
  await win.getByRole("link", { name: "History", exact: true }).click();
  await win.getByText("/Users/ada/Projects/leash/src/shared/grantView.ts").click();
  await expect(win.getByText("seconds").first()).toBeVisible();
  await shot(win, "history-diff");

  await win.setViewportSize({ width: 1440, height: 620 });
  await win.getByRole("link", { name: "Grants", exact: true }).click();
  await win.getByRole("button", { name: "Expires" }).click();
  await expect(win.getByText("Forever")).toBeVisible();
  await expect(win.getByText(/\d+m/).first()).toBeVisible();
  await shot(win, "grants");

  await win.setViewportSize({ width: 1440, height: 760 });
  await win.getByRole("button", { name: "Revoke all and lock down" }).click();
  await expect(win.getByRole("alertdialog").getByText("Revoke all 4 grants?")).toBeVisible();
  await shot(win, "revoke");
  await win.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();

  const home = await app.evaluate(() => process.env.AGENTIC_LEASH_HOME!);
  const socket = connect(join(home, ".agentic-leash", "agentic-leash.sock"));
  await new Promise((resolve) => socket.once("connect", resolve));
  socket.write(`${JSON.stringify({ id: "shot-1", request: { agent: "cursor", event: "preToolUse", tool: "Write", access: "write", paths: ["/Users/ada/.ssh/config"], cwd: "/Users/ada" } })}\n`);
  const popup = await app.waitForEvent("window", { predicate: (page) => page.url().includes("#/approval") });
  await expect(popup.getByText("Cursor wants write access")).toBeVisible();
  await shot(popup, "approval");
  socket.destroy();
  await app.close();
});

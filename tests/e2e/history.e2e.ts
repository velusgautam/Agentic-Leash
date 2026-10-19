import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { insertEvents, openHistoryDb } from "../../src/helper/historyDb";
import { launch } from "./launch";

test("History shows a selected write with its diff and the covering grant", async () => {
  const dir = mkdtempSync(join(tmpdir(), "al-history-"));
  const db = openHistoryDb(join(dir, "history.db"));
  const now = Date.now();
  const base = { pid: 1, exe: "/bin/x", source: "eslogger" as const, sensitive: false };
  // The helper stores the process name ("claude", "cursor-agent"), not the AgentId.
  insertEvents(db, ([
    { ...base, ts: now - 3000, agent: "claude", kind: "read", path: "/Users/someone/project/README.md" },
    { ...base, ts: now - 2000, agent: "cursor-agent", kind: "create", path: "/Users/someone/project/src/very/long/nested/folder/structure/that/keeps/going/component.tsx" },
    { ...base, ts: now - 1000, agent: "claude", kind: "write", path: "/Users/someone/project/src/index.ts", beforeBlob: "const a = 1;\n", afterBlob: "const a = 2;\nexport { a };\n" },
  ]) as unknown as Parameters<typeof insertEvents>[1]);
  db.close();
  const app = await launch([], { AGENTIC_LEASH_HISTORY_DIR: dir });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1400, height: 820 });
  await win.evaluate(`window.leash.createGrant({ agent: "cursor", path: "/Users/someone/project", access: "write", ttlSeconds: 3600 })`);
  await win.evaluate(`window.leash.createGrant({ agent: "claude-code", path: "/Users/someone/project/src", access: "write", ttlSeconds: 3600 })`);
  await win.getByRole("link", { name: "History", exact: true }).click();
  await expect.poll(() => win.evaluate(() => {
    const scroller = document.querySelector(".table-frame");
    if (!(scroller instanceof HTMLElement)) return false;
    const style = getComputedStyle(scroller);
    return style.clipPath.includes("inset") && style.borderRadius !== "0px";
  })).toBe(true);
  await win.getByText("/Users/someone/project/src/index.ts").click();
  const details = win.getByRole("complementary");
  await expect(details.getByText("Allowed by Claude · Agentic Leash grant")).toBeVisible();
  await expect(details.getByText("/Users/someone/project/src", { exact: true })).toBeVisible();
  if (process.env.SCREENSHOT) {
    await win.waitForTimeout(500);
    await win.screenshot({ path: process.env.SCREENSHOT });
  }
  await win.getByRole("group", { name: "Agents" }).getByRole("button", { name: "Cursor" }).click();
  await expect(win.getByText("1 events")).toBeVisible();
  await app.close();
});

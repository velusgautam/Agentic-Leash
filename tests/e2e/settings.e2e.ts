import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { insertEvents, openHistoryDb } from "../../src/helper/historyDb";
import { launch } from "./launch";

test("General shows Open at login, disabled outside the installed app", async () => {
  const app = await launch();
  const win = await app.firstWindow();
  await win.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(win.getByText("Open at login")).toBeVisible();
  await expect(win.getByText("Available in the installed app.")).toBeVisible();
  await expect(win.getByRole("switch", { name: "Open at login" })).toBeDisabled();
  await expect(win.getByRole("button", { name: "Uninstall" })).toBeVisible();
  await win.getByRole("link", { name: "Monitoring" }).click();
  await expect(win.getByRole("button", { name: "Available in the installed app" })).toHaveCount(2);
  await expect(win.getByRole("button", { name: "Granted" })).toHaveCount(0);
  await win.getByRole("link", { name: "Ignored paths", exact: true }).click();
  await expect(win.getByText("/.cursor/chats", { exact: true })).toBeVisible();
  const chats = win.getByRole("switch", { name: "/.cursor/chats" });
  await expect(chats).toBeChecked();
  await win.getByLabel("Ignored path").fill("scratch");
  await win.getByRole("button", { name: "Add", exact: true }).click();
  await expect(win.getByText("Use a full path, such as /tmp/scratch.")).toBeVisible();
  await win.getByLabel("Ignored path").fill("/tmp/scratch");
  await win.getByRole("button", { name: "Add", exact: true }).click();
  await expect(win.getByText("/tmp/scratch", { exact: true })).toBeVisible();
  await expect(win.getByText("User added", { exact: true })).toBeVisible();
  await win.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(win.getByText("/tmp/scratch", { exact: true })).toHaveCount(0);
  await chats.click();
  await expect(chats).not.toBeChecked();
  await app.close();
});

test("Monitoring optimizes history after confirmation", async () => {
  const historyDir = mkdtempSync(join(tmpdir(), "al-history-optimize-"));
  const history = openHistoryDb(join(historyDir, "history.db"));
  insertEvents(history, [{
    ts: 1,
    agent: "cursor",
    pid: 1,
    exe: "cursor-agent",
    kind: "write",
    path: "/Users/me/project/a.ts",
    beforeBlob: "before",
    afterBlob: "after",
    sensitive: false,
    source: "eslogger",
  }]);
  history.exec("CREATE TABLE blobs (sha256 TEXT PRIMARY KEY, content BLOB NOT NULL)");
  history.prepare("INSERT INTO blobs VALUES ('old', zeroblob(100000))").run();
  history.close();

  const app = await launch([], { AGENTIC_LEASH_HISTORY_DIR: historyDir });
  const win = await app.firstWindow();
  await win.getByRole("link", { name: "Settings", exact: true }).click();
  await win.getByRole("link", { name: "Monitoring" }).click();
  await expect(win.getByText(/History database is/)).toBeVisible();
  await win.getByRole("button", { name: "Optimize history" }).click();
  await expect(win.getByRole("heading", { name: "Optimize history?" })).toBeVisible();
  await win.getByRole("button", { name: "Optimize", exact: true }).click();
  await expect(win.getByText(/Reduced history from/)).toBeVisible();
  await app.close();
});

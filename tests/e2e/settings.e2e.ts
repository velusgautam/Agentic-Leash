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

function seedHistory(): string {
  const historyDir = mkdtempSync(join(tmpdir(), "al-history-optimize-"));
  const history = openHistoryDb(join(historyDir, "history.db"));
  const event = { agent: "cursor", pid: 1, exe: "cursor-agent", path: "/Users/me/project/a.ts", sensitive: false, source: "eslogger" } as const;
  insertEvents(history, [{ ...event, ts: 1, kind: "write", beforeBlob: "before", afterBlob: "after" }, { ...event, ts: 2, kind: "read" }]);
  history.prepare("INSERT INTO blobs (hash, size, data) VALUES ('old', 0, zeroblob(100000))").run();
  history.close();
  return historyDir;
}

async function openMonitoring(env: Record<string, string> = {}) {
  const app = await launch([], env);
  const win = await app.firstWindow();
  await win.getByRole("link", { name: "Settings", exact: true }).click();
  await win.getByRole("link", { name: "Monitoring" }).click();
  return { app, win };
}

test("Monitoring compacts history after confirmation", async () => {
  const { app, win } = await openMonitoring({ AGENTIC_LEASH_HISTORY_DIR: seedHistory() });
  await expect(win.getByText(/History database is/)).toBeVisible();
  await win.getByRole("button", { name: "Clean up", exact: true }).click();
  const dialog = win.getByRole("alertdialog");
  await expect(dialog.getByRole("heading", { name: "Compact only?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Clean up", exact: true }).click();
  await expect(win.getByText(/Reduced history from/)).toBeVisible();
  await app.close();
});

test("Monitoring removes reads after confirmation", async () => {
  const { app, win } = await openMonitoring({ AGENTIC_LEASH_HISTORY_DIR: seedHistory() });
  await win.getByLabel("Cleanup").selectOption("reads");
  await win.getByRole("button", { name: "Clean up", exact: true }).click();
  const dialog = win.getByRole("alertdialog");
  await expect(dialog.getByRole("heading", { name: "Remove reads?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Clean up", exact: true }).click();
  await expect(win.getByText(/Reduced history from .* Removed 1 row\./)).toBeVisible();
  await app.close();
});

test("Monitoring keeps a valid history size limit", async () => {
  const { app, win } = await openMonitoring();
  await expect(win.getByText("Automatic cleanup starts at half this size. Default 10 GB.")).toBeVisible();
  const field = win.getByLabel("History size limit in GB");
  await expect(field).toHaveValue("10");
  await field.fill("0");
  await field.press("Enter");
  await expect(field).toHaveValue("10");
  await field.fill("5");
  await field.press("Enter");
  await expect(win.getByRole("alertdialog")).toHaveCount(0);
  await win.reload();
  await expect(win.getByLabel("History size limit in GB")).toHaveValue("5");
  await app.close();
});

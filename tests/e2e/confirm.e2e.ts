import { connect } from "node:net";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launch } from "./launch";

test("an approval request opens the popup with duration choices", async () => {
  const app = await launch();
  await app.firstWindow();
  const home = await app.evaluate(() => process.env.AGENTIC_LEASH_HOME!);
  const socket = connect(join(home, ".agentic-leash", "agentic-leash.sock"));
  await new Promise((resolve) => socket.once("connect", resolve));
  const request = { agent: "cursor", event: "preToolUse", tool: "Read", access: "read", paths: ["/Users/someone/project/src/index.ts"], cwd: "/Users/someone/project" };
  socket.write(`${JSON.stringify({ id: "e2e-1", request })}\n`);
  const popup = await app.waitForEvent("window", { predicate: (page) => page.url().includes("#/approval") });
  await expect(popup.getByText("Cursor wants read access")).toBeVisible();
  await expect(popup.getByRole("radio", { name: /1 hour/ })).toHaveAttribute("aria-checked", "true");
  await popup.keyboard.press("3");
  await expect(popup.getByRole("button", { name: /Allow for 8 hours/ })).toBeVisible();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((window) => !window.isFullScreenable() && !window.isFullScreen() && window.getSize()[0] === 520))).toBe(true);
  await expect(popup.getByRole("button", { name: "Users", exact: true })).toHaveCount(0);
  if (process.env.SCREENSHOT) await popup.screenshot({ path: process.env.SCREENSHOT.replace(".png", "-approval.png") });
  const win = await app.firstWindow();
  await popup.getByRole("button", { name: "project", exact: true }).click();
  await expect(popup.getByRole("button", { name: "project", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(popup.getByText("Cursor wants read access")).toBeVisible();
  expect(await win.evaluate(`window.leash.listGrants().then((rows) => rows.length)`)).toBe(0);
  await popup.getByRole("button", { name: /Allow project for 8 hours/ }).click();
  await expect.poll(() => win.evaluate(`window.leash.listGrants().then((rows) => rows.map((row) => row.path).join(","))`)).toBe("/Users/someone/project");
  await expect(popup.getByText("No requests waiting.")).toBeVisible();
  socket.destroy();
  await app.close();
});

test("the lockdown button label follows revoke-all", async () => {
  const app = await launch();
  const win = await app.firstWindow();
  await win.evaluate(`window.leash.createGrant({ agent: "*", path: "/tmp/leash-lock", access: "write", ttlSeconds: 3600 })`);
  await win.getByRole("link", { name: "Grants", exact: true }).click();
  await expect(win.getByRole("button", { name: "Lockdown off" })).toBeDisabled();
  await win.getByRole("button", { name: "Revoke all and lock down" }).click();
  await win.getByRole("alertdialog").getByRole("button", { name: "Revoke all" }).click();
  await expect(win.getByRole("status").filter({ hasText: "Lockdown is on" })).toBeVisible();
  const end = win.getByRole("button", { name: "End lockdown", pressed: true });
  await expect(end).toBeEnabled();
  await end.click();
  await expect(win.getByRole("status").filter({ hasText: "Lockdown is on" })).toHaveCount(0);
  await expect(win.getByRole("button", { name: "Lockdown off" })).toBeDisabled();
  await app.close();
});

test("revoking a grant asks first and explains the outcome", async () => {
  const app = await launch();
  const win = await app.firstWindow();
  await win.evaluate(`window.leash.createGrant({ agent: "*", path: "/tmp/leash-e2e", access: "write", ttlSeconds: 3600 })`);
  await win.getByRole("link", { name: "Grants", exact: true }).click();
  await win.getByRole("button", { name: "Revoke", exact: true }).click();
  const dialog = win.getByRole("alertdialog");
  await expect(dialog.getByText("Revoke this grant?")).toBeVisible();
  await expect(dialog.getByText("The next access here opens an approval request again.")).toBeVisible();
  if (process.env.SCREENSHOT) {
    await win.waitForTimeout(400);
    await win.screenshot({ path: process.env.SCREENSHOT });
  }
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(win.getByText("/tmp/leash-e2e")).toBeVisible();
  await win.getByRole("button", { name: "Revoke", exact: true }).click();
  await win.getByRole("alertdialog").getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(win.getByText("No grants yet")).toBeVisible();
  await app.close();
});

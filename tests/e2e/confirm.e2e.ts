import { connect } from "node:net";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launch } from "./launch";

test("an approval request opens the popup with one-click choices", async () => {
  const app = await launch();
  await app.firstWindow();
  const home = await app.evaluate(() => process.env.AGENTIC_LEASH_HOME!);
  const socket = connect(join(home, ".agentic-leash", "agentic-leash.sock"));
  await new Promise((resolve) => socket.once("connect", resolve));
  const request = { agent: "cursor", event: "preToolUse", tool: "Read", access: "read", paths: ["/Users/someone/project/src/index.ts"], cwd: "/Users/someone/project" };
  socket.write(`${JSON.stringify({ id: "e2e-1", request })}\n`);
  const popup = await app.waitForEvent("window", { predicate: (page) => page.url().includes("#/approval") });
  await expect(popup.getByText("Cursor wants to read a file")).toBeVisible();
  await expect(popup.getByText(/Low risk/)).toBeVisible();
  await expect(popup.getByRole("button", { name: /^Once/ })).toBeVisible();
  await expect(popup.getByRole("button", { name: /^This session/ })).toBeVisible();
  await expect(popup.getByRole("button", { name: /^Today/ })).toBeVisible();
  await expect(popup.getByText(/Until the agent is idle for 30 minutes, at most 12 hours./)).toBeVisible();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((window) => !window.isFullScreenable() && !window.isFullScreen() && window.getSize()[0] === 520))).toBe(true);
  await expect(popup.getByRole("button", { name: "Users", exact: true })).toHaveCount(0);
  await expect(popup.getByRole("button", { name: "someone", exact: true })).toHaveCount(0);
  if (process.env.SCREENSHOT) await popup.screenshot({ path: process.env.SCREENSHOT.replace(".png", "-approval.png") });
  const win = await app.firstWindow();
  await popup.getByRole("button", { name: "project", exact: true }).click();
  await expect(popup.getByRole("button", { name: "project", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await win.evaluate(`window.leash.listGrants().then((rows) => rows.length)`)).toBe(0);
  await expect(popup.getByText("Allow project this session")).toBeVisible();
  await popup.getByRole("button", { name: /^This session/ }).click();
  await expect.poll(() => win.evaluate(`window.leash.listGrants().then((rows) => rows.map((row) => row.path + ":" + row.idleSeconds).join(","))`)).toBe("/Users/someone/project:1800");
  await expect(popup.getByText("No requests waiting.")).toBeVisible();
  socket.destroy();
  await app.close();
});

test("the lockdown button label follows revoke-all", async () => {
  const app = await launch();
  const win = await app.firstWindow();
  await win.evaluate(`window.leash.createGrant({ agent: "*", path: "/tmp/leash-lock", access: "write", ttlSeconds: 3600 })`);
  await win.getByRole("link", { name: "Access", exact: true }).click();
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
  await win.getByRole("link", { name: "Access", exact: true }).click();
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

test("allow all approves every waiting request for this session", async () => {
  const app = await launch();
  const win = await app.firstWindow();
  const home = await app.evaluate(() => process.env.AGENTIC_LEASH_HOME!);
  const socket = connect(join(home, ".agentic-leash", "agentic-leash.sock"));
  await new Promise((resolve) => socket.once("connect", resolve));
  for (const name of ["a", "b"]) {
    const request = { agent: "cursor", event: "preToolUse", tool: "Read", access: "read", paths: [`/Users/someone/${name}/src/index.ts`], cwd: `/Users/someone/${name}` };
    socket.write(`${JSON.stringify({ id: `e2e-batch-${name}`, request })}\n`);
  }
  const popup = await app.waitForEvent("window", { predicate: (page) => page.url().includes("#/approval") });
  const allowAll = popup.getByRole("button", { name: "Allow all (2) this session" });
  await expect(allowAll).toBeEnabled();
  await allowAll.click();
  await expect(popup.getByText("No requests waiting.")).toBeVisible();
  await expect.poll(() => win.evaluate(`window.leash.listGrants().then((rows) => rows.map((row) => row.path + ":" + row.idleSeconds).sort().join(","))`)).toBe("/Users/someone/a/src:1800,/Users/someone/b/src:1800");
  socket.destroy();
  await app.close();
});

test("extending a timed grant adds an hour", async () => {
  const app = await launch();
  const win = await app.firstWindow();
  await win.evaluate(`window.leash.createGrant({ agent: "*", path: "/tmp/leash-extend", access: "write", ttlSeconds: 600 })`);
  const expiry = () => win.evaluate(`window.leash.listGrants().then((rows) => rows.find((row) => row.path === "/tmp/leash-extend").expiresAt)`) as Promise<number>;
  const before = await expiry();
  await win.getByRole("link", { name: "Access", exact: true }).click();
  await win.getByRole("button", { name: "Extend by 1 hour" }).click();
  await expect(win.getByRole("dialog", { name: "Extended by 1 hour" })).toBeVisible();
  await expect.poll(expiry).toBeGreaterThan(before);
  await app.close();
});

test("a secret request is high risk, offers only Once, ignores Enter, and Once writes no grant", async () => {
  const app = await launch();
  const win = await app.firstWindow();
  const home = await app.evaluate(() => process.env.AGENTIC_LEASH_HOME!);
  const socket = connect(join(home, ".agentic-leash", "agentic-leash.sock"));
  await new Promise((resolve) => socket.once("connect", resolve));
  const request = { agent: "claude-code", event: "PreToolUse", tool: "Read", access: "read", paths: [join(home, ".ssh", "id_ed25519")], cwd: home };
  socket.write(`${JSON.stringify({ id: "e2e-secret", request })}\n`);
  const popup = await app.waitForEvent("window", { predicate: (page) => page.url().includes("#/approval") });
  await expect(popup.getByText(/High risk/)).toBeVisible();
  await expect(popup.getByText(/ssh keys/i)).toBeVisible();
  await expect(popup.getByRole("button", { name: /^(Once|This session|Today|15 min)/ })).toHaveCount(1);
  await expect(popup.getByText("Or allow this whole folder")).toHaveCount(0);
  if (process.env.SCREENSHOT) await popup.screenshot({ path: process.env.SCREENSHOT.replace(".png", "-secret.png") });
  await popup.waitForTimeout(700);
  await popup.keyboard.press("Enter");
  await expect(popup.getByText(/High risk/)).toBeVisible();
  await popup.getByRole("button", { name: /^Once/ }).click();
  await expect(popup.getByText("No requests waiting.")).toBeVisible();
  expect(await win.evaluate(`window.leash.listGrants().then((rows) => rows.length)`)).toBe(0);
  socket.destroy();
  await app.close();
});

test("a denial can be undone, and Never shows under Blocked until removed", async () => {
  const app = await launch();
  const win = await app.firstWindow();
  const home = await app.evaluate(() => process.env.AGENTIC_LEASH_HOME!);
  const socket = connect(join(home, ".agentic-leash", "agentic-leash.sock"));
  await new Promise((resolve) => socket.once("connect", resolve));
  const ask = (id: string, path: string) => socket.write(`${JSON.stringify({ id, request: { agent: "cursor", event: "preToolUse", tool: "Read", access: "read", paths: [path], cwd: "/Users/someone/x", sessionId: "s1" } })}\n`);
  ask("e2e-deny", "/Users/someone/x/a.txt");
  const popup = await app.waitForEvent("window", { predicate: (page) => page.url().includes("#/approval") });
  await popup.getByRole("button", { name: /^Deny/ }).click();
  await expect(popup.getByRole("status").filter({ hasText: "Denied" })).toBeVisible();
  const blocks = () => win.evaluate(`window.leash.listBlocks().then((b) => b.remembered.length + ":" + b.never.length)`);
  await expect.poll(blocks).toBe("1:0");
  await popup.getByRole("button", { name: "Undo" }).click();
  await expect.poll(blocks).toBe("0:0");

  ask("e2e-never", "/Users/someone/x/b.txt");
  await expect(popup.getByText("Cursor wants to read a file")).toBeVisible();
  await popup.getByRole("button", { name: "Never" }).click();
  await expect.poll(blocks).toBe("1:1");
  await win.getByRole("link", { name: "Access", exact: true }).click();
  await win.getByRole("tab", { name: "Blocked" }).click();
  await expect(win.getByText("/Users/someone/x/b.txt").first()).toBeVisible();
  await win.getByRole("button", { name: "Clear all" }).click();
  await expect.poll(blocks).toBe("0:1");
  await expect(win.getByText("Nothing denied in the last 10 minutes.")).toBeVisible();
  await win.getByRole("button", { name: "Remove", exact: true }).click();
  await win.getByRole("alertdialog").getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(blocks).toBe("0:0");
  await expect(win.getByText("No Never rules.", { exact: false })).toBeVisible();
  socket.destroy();
  await app.close();
});

test("locking the Mac ends personal-folder grants by default, or every timed grant when set to All", async () => {
  const app = await launch();
  const win = await app.firstWindow();
  const home = await app.evaluate(() => process.env.AGENTIC_LEASH_HOME!);
  const paths = () => win.evaluate(`window.leash.listGrants().then((rows) => rows.map((row) => row.path).sort().join(","))`);
  const grant = (path: string, ttlSeconds: number | null) => win.evaluate(`window.leash.createGrant({ agent: "*", path: ${JSON.stringify(path)}, access: "read", ttlSeconds: ${ttlSeconds} })`);
  const lock = () => app.evaluate(({ powerMonitor }) => powerMonitor.emit("lock-screen"));
  await grant(join(home, "Documents", "taxes"), 600);
  await grant("/tmp/leash-lock-a", 600);
  await grant("/tmp/leash-lock-forever", null);
  await lock();
  await expect.poll(paths).toBe("/tmp/leash-lock-a,/tmp/leash-lock-forever");
  await win.getByRole("link", { name: "Settings" }).click();
  await win.getByRole("button", { name: "All temporary access" }).click();
  await expect(win.getByRole("button", { name: "All temporary access" })).toHaveAttribute("aria-pressed", "true");
  await lock();
  await expect.poll(paths).toBe("/tmp/leash-lock-forever");
  await app.close();
});

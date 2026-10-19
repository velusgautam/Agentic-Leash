import { type ElectronApplication, expect, test } from "@playwright/test";
import { launch } from "./launch";

const visible = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible());
const dockVisible = (app: ElectronApplication) => app.evaluate(({ app }) => app.dock?.isVisible() ?? false);

test("the close button hides to the menu bar, and activate brings it back", async () => {
  const app = await launch();
  await app.firstWindow();
  await expect.poll(() => visible(app)).toBe(true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  await expect.poll(() => visible(app)).toBe(false);
  await expect.poll(() => dockVisible(app)).toBe(false);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  await app.evaluate(({ app }) => app.emit("activate"));
  await expect.poll(() => visible(app)).toBe(true);
  await app.close();
});

test("Command+Q hides instead of quitting", async () => {
  const app = await launch();
  await app.firstWindow();
  await expect.poll(() => visible(app)).toBe(true);
  await app.evaluate(({ app }) => {
    app.emit("before-quit", { preventDefault() {} });
  });
  await expect.poll(() => visible(app)).toBe(false);
  await expect.poll(() => dockVisible(app)).toBe(false);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  await app.close();
});

test("--hidden starts with no visible window", async () => {
  const app = await launch(["--hidden"]);
  const win = await app.firstWindow();
  await win.waitForLoadState("load");
  expect(await visible(app)).toBe(false);
  await app.close();
});

test("a real quit exits even while hidden", async () => {
  const app = await launch();
  await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  await expect.poll(() => visible(app)).toBe(false);
  const exited = new Promise((resolve) => app.process().once("exit", resolve));
  void app.evaluate(({ app }) => app.quit()).catch(() => {});
  await exited;
});

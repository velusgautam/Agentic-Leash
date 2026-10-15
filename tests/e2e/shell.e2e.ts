import { expect, test } from "@playwright/test";
import { launch } from "./launch";

test("opens the main window", async () => {
  const app = await launch();
  const win = await app.firstWindow();
  await expect(win).toHaveTitle("Agentic Leash");
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
  // String form: the test tsconfig has no DOM types.
  expect(await win.evaluate("window.leash.platform")).toBe("darwin");
  await app.close();
});

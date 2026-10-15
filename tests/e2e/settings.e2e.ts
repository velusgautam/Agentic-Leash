import { expect, test } from "@playwright/test";
import { launch } from "./launch";

test("General shows Open at login, disabled outside the installed app", async () => {
  const app = await launch();
  const win = await app.firstWindow();
  await win.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(win.getByText("Open at login")).toBeVisible();
  await expect(win.getByText("Available in the installed app.")).toBeVisible();
  await expect(win.getByRole("switch", { name: "Open at login" })).toBeDisabled();
  await app.close();
});

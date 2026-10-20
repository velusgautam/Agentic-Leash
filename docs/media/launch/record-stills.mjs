import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = dirname(fileURLToPath(import.meta.url));
const media = join(root, "..");
const boxes = JSON.parse(readFileSync(join(media, "walkthrough/boxes.json"), "utf8"));
const rect = (name, pad = 0) => {
  const b = boxes[name];
  return { x: b.x - pad, y: b.y - pad, w: b.width + pad * 2, h: b.height + pad * 2 };
};
const union = (a, b) => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};
const detail = rect("historyDetail");
const appearance = union(rect("appearanceTheme", 8), rect("appearanceInterface", 8));

const shots = {
  "grants.png": { plate: "07-grants-sorted.png", focus: union(rect("grantControls", 6), rect("grantList", 8)) },
  "revoke.png": { plate: "10-revoke.png", focus: rect("revokeDialog", 8) },
  "history-diff.png": { plate: "08-history.png", focus: { x: detail.x + 4, y: detail.y + 4, w: detail.w - 10, h: 360 } },
  "live-sensitive.png": { plate: "09-sensitive.png", focus: union(rect("sensitiveRow", 6), rect("sensitiveToggle", 6)) },
  "approval.png": { plate: "03-live-b.png", popup: "05-approval-scope.png", focus: { x: 444, y: 229, w: 552, h: 442 } },
  "appearance.png": { plate: "12-appearance.png", focus: { ...appearance, y: appearance.y - 56, h: appearance.h + 56 } },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(`file://${join(root, "stills.html")}`);

await page.evaluate(() => window.showBanner());
await page.locator("#banner").screenshot({ path: join(media, "banner.png") });

for (const [file, shot] of Object.entries(shots)) {
  await page.evaluate((value) => window.showShot(value), { dim: !shot.popup, ...shot });
  await page.locator("#shot").screenshot({ path: join(media, file) });
}
await browser.close();

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = dirname(fileURLToPath(import.meta.url));
const preview = process.argv.includes("--preview");
const frames = "/tmp/agentic-leash-walk-frames";
const fps = 30;
const ffmpeg = "/opt/homebrew/bin/ffmpeg";
const boxes = JSON.parse(readFileSync(join(root, "../walkthrough/boxes.json"), "utf8"));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`file://${join(root, "walkthrough.html")}`);
await page.evaluate((value) => { window.BOXES = value; }, boxes);
await page.waitForFunction(() => window.mediaReady);

if (preview) {
  const times = [700, 3400, 8200, 12800, 17600, 20600, 24600, 28600, 29800, 31100, 34200, 36800];
  mkdirSync("/tmp/al-walk-preview", { recursive: true });
  for (let i = 0; i < times.length; i++) {
    await page.evaluate((ms) => window.renderFrame(ms), times[i]);
    await page.screenshot({ path: `/tmp/al-walk-preview/${String(i).padStart(2, "0")}-${times[i]}.png` });
  }
  await browser.close();
  process.exit(0);
}

rmSync(frames, { recursive: true, force: true });
mkdirSync(frames);
const duration = await page.evaluate(() => window.DURATION);
const count = Math.round((duration / 1000) * fps);
for (let i = 0; i < count; i++) {
  await page.evaluate((ms) => window.renderFrame(ms), (i / fps) * 1000);
  await page.screenshot({ path: join(frames, `${String(i).padStart(4, "0")}.png`) });
}
await browser.close();

const mp4 = join(root, "../launch-walkthrough.mp4");
const result = spawnSync(ffmpeg, ["-y", "-framerate", String(fps), "-i", join(frames, "%04d.png"), "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", mp4], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = dirname(fileURLToPath(import.meta.url));
const frames = "/tmp/agentic-leash-frames";
const fps = 30;
const duration = 9;
const ffmpeg = "/opt/homebrew/bin/ffmpeg";

rmSync(frames, { recursive: true, force: true });
mkdirSync(frames);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`file://${join(root, "index.html")}`);
const count = fps * duration;
for (let i = 0; i < count; i++) {
  await page.evaluate((ms) => window.renderFrame(ms), (i / fps) * 1000);
  await page.screenshot({ path: join(frames, `${String(i).padStart(4, "0")}.png`) });
}
await browser.close();

const mp4 = join(root, "../launch.mp4");
const gif = join(root, "../launch.gif");
const palette = join(frames, "palette.png");
const run = (args) => {
  const result = spawnSync(ffmpeg, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run(["-y", "-framerate", String(fps), "-i", join(frames, "%04d.png"), "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", mp4]);
run(["-y", "-i", mp4, "-vf", "fps=12,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff", palette]);
run(["-y", "-i", mp4, "-i", palette, "-lavfi", "fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle", gif]);

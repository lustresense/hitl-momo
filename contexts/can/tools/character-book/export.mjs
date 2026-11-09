// Exports the two 1:1 boards for PPT/Word: node tools/character-book/export.mjs
// Needs: implementation/node_modules (playwright-core), a Chromium (CHROMIUM_PATH or /opt/pw-browsers/chromium),
// and ffmpeg on PATH (also what Playwright's video recorder uses; see docs/execution/RUN_GUIDE.md).
// Output in academic/progress-book/karakter/: karakter-{thinman,momo}-1x1.{png,mp4,gif}
import { chromium } from "../../implementation/node_modules/playwright-core/index.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../academic/progress-book/karakter");
const page_url = "file://" + path.join(out, "karakter-thinman-momo.html");
const exe = process.env.CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const SECONDS = { thinman: 16, momo: 28 };
const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ["--no-sandbox"] });

for (const who of ["thinman", "momo"]) {
  // 1) still PNG, 2400 x 2400
  let ctx = await browser.newContext({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 2 });
  let page = await ctx.newPage();
  await page.goto(page_url + "#solo=" + who); await page.reload(); await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, `karakter-${who}-1x1.png`) });
  await ctx.close();

  // 2) animated: record 1080 x 1080 with the auto-cycling solo mode, then MP4 (PPT) + GIF (Word)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "charbook-"));
  ctx = await browser.newContext({ viewport: { width: 1080, height: 1080 }, recordVideo: { dir: tmp, size: { width: 1080, height: 1080 } } });
  page = await ctx.newPage();
  await page.goto(page_url + "#solo=" + who + ";auto=1"); await page.reload();
  await page.waitForTimeout(SECONDS[who] * 1000);
  const video = await page.video().path();
  await ctx.close();
  const mp4 = path.join(out, `karakter-${who}-1x1.mp4`);
  const gif = path.join(out, `karakter-${who}-1x1.gif`);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", "1", "-i", video, "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", "1", "-i", video, "-vf", "fps=10,scale=540:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", gif]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(who, "ok");
}
await browser.close();

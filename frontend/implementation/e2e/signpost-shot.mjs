// Screenshot of the stage artwork previews (signposts at the end of each level). No onboarding needed.
//   OUT=<dir> node e2e/signpost-shot.mjs
import fs from "node:fs";
import path from "node:path";
import { ROOT, startStaticServer, launch } from "./lib/harness.mjs";

const OUT = process.env.OUT || path.join(ROOT, "docs/execution/evidence", `signpost-${Date.now()}`);
fs.mkdirSync(OUT, { recursive: true });
const { server, base } = await startStaticServer();
const { browser, context, page } = await launch({ viewport: { width: 1280, height: 900 } });
await page.goto(`${base}/preview/stages`, { waitUntil: "load" });
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(OUT, "stages-full.png"), fullPage: true });
// The preview shows one stage at a time (01 / 04 = tutorial flag); step through the three levels.
for (let step = 1; step <= 3; step++) {
  await page.mouse.click(698, 44);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, `stage-${step}.png`) });
  const goal = page.locator('[data-asset-role="goal-preview"][data-goal-kind="signpost"]:visible').first();
  const box = await goal.boundingBox().catch(() => null);
  if (box) await page.screenshot({ path: path.join(OUT, `signpost-${step}.png`), clip: { x: Math.max(0, box.x - 80), y: Math.max(0, box.y - 50), width: box.width + 160, height: box.height + 100 } });
}
const n = await page.locator('[data-goal-kind="signpost"]').count();
console.log(`signposts: ${n}, out=${OUT}`);
await context.close(); await browser.close(); server.close();

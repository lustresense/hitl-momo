// Screenshot of the stage artwork previews (signposts at the end of each level). No onboarding needed.
//   OUT=<dir> node e2e/signpost-shot.mjs
import fs from "node:fs";
import path from "node:path";
import { ROOT, startStaticServer, launch } from "./lib/harness.mjs";

const OUT = process.env.OUT || path.join(ROOT, "docs/execution/evidence", `signpost-${Date.now()}`);
fs.mkdirSync(OUT, { recursive: true });
const { server, base } = await startStaticServer();
const { browser, context, page } = await launch({ viewport: { width: 1280, height: 900 } });
await page.goto(`${base}/preview/stages/`, { waitUntil: "load" });
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(OUT, "stages-full.png"), fullPage: true });
const goals = page.locator('[data-asset-role="goal-preview"][data-goal-kind="signpost"]');
const n = await goals.count();
for (let i = 0; i < n; i++) {
  const box = await goals.nth(i).boundingBox();
  if (!box) continue;
  await page.screenshot({ path: path.join(OUT, `signpost-${i + 1}.png`), clip: { x: Math.max(0, box.x - 60), y: Math.max(0, box.y - 40), width: box.width + 120, height: box.height + 80 } });
}
console.log(`signposts: ${n}, out=${OUT}`);
await context.close(); await browser.close(); server.close();

// SVG -> PNG (2x) with the preinstalled Playwright Chromium.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch();
for (const f of readdirSync(dir).filter((n) => n.endsWith(".svg"))) {
  const svg = readFileSync(join(dir, f), "utf8");
  const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/);
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
  await page.setContent(`<html><body style="margin:0;background:#fff">${svg}</body></html>`);
  await page.screenshot({ path: join(dir, f.replace(/\.svg$/, ".png")), clip: { x: 0, y: 0, width: +w, height: +h } });
  await page.close();
  console.log("png", f);
}
await browser.close();

// Collider vs picture audit (read-only). Reaches the gameplay phase of each level with the student-style plan,
// then paints the physics boxes (platforms, hazards, goal, placed objects, player body) over the picture and
// saves plain + overlay screenshots. Trusted mouse/keyboard only; telemetry is read from canvas data-* attributes.
//   LEVELS=2 OUT=<dir> node e2e/collider-audit.mjs   (one level per run: the level list is reached once per onboarding)
import fs from "node:fs";
import path from "node:path";
import { ROOT, startStaticServer, launch, onboardToLevels, enterLevel, drawScribble, submitAndDecide, placeByDrag, confirmPlacement, readGame, sleep, writeJson } from "./lib/harness.mjs";

const plans = JSON.parse(fs.readFileSync(path.join(ROOT, "e2e/lib/level-plans.json"), "utf8"));
const OUT = process.env.OUT || path.join(ROOT, "docs/execution/evidence", `collider-audit-${Date.now()}`);
const LEVELS = (process.env.LEVELS || "1,2,3").split(",").map(Number);
const VIEW = process.env.VIEW ? process.env.VIEW.split("x").map(Number) : [1280, 720];
fs.mkdirSync(OUT, { recursive: true });
const log = (m, d) => console.log(`[${new Date().toISOString().slice(11, 23)}] ${m}${d !== undefined ? " " + JSON.stringify(d) : ""}`);

const { server, base } = await startStaticServer();
const { browser, context, page, errors } = await launch({ viewport: { width: VIEW[0], height: VIEW[1] } });

/** Paint every physics box as a translucent div over the canvas. Returns the geometry for the report. */
async function overlay(on) {
  return page.evaluate((show) => {
    document.getElementById("collider-overlay")?.remove();
    const c = document.querySelector("[data-testid=game-canvas]");
    if (!c) return null;
    const d = c.dataset;
    const geo = JSON.parse(d.geometry ?? "{}");
    const creations = JSON.parse(d.creations ?? "[]");
    if (!show) return { geo, creations };
    const r = c.getBoundingClientRect();
    const s = Number(d.worldScale), ox = Number(d.worldOffsetX), oy = Number(d.worldOffsetY);
    const root = document.createElement("div");
    root.id = "collider-overlay";
    root.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:99999";
    const box = (x, y, w, h, color, label) => {
      const e = document.createElement("div");
      e.style.cssText = `position:absolute;left:${r.left + ox + x * s}px;top:${r.top + oy + y * s}px;width:${w * s}px;height:${h * s}px;background:${color}33;border:1.5px solid ${color};box-sizing:border-box;font:9px monospace;color:${color}`;
      if (label) e.textContent = label;
      root.appendChild(e);
    };
    for (const p of geo.platforms ?? []) box(p.x, p.y, p.w, p.h, "#0a5cff", "");
    for (const p of geo.hazards ?? []) box(p.x, p.y, p.w, p.h, "#ff2a2a", "hazard");
    if (geo.goal) box(geo.goal.x, geo.goal.y, geo.goal.w, geo.goal.h, "#00b050", "goal");
    for (const it of creations) {
      const side = it.angle === 90 || it.angle === 270;
      box(it.x, it.y, side ? it.h : it.w, side ? it.w : it.h, "#d100d1", it.behavior);
    }
    box(Number(d.playerX), Number(d.playerY), 24, 40, "#ffa500", "player");
    document.body.appendChild(root);
    return { geo, creations };
  }, on);
}

async function shots(name) {
  await overlay(false);
  await page.screenshot({ path: path.join(OUT, `${name}-plain.png`) });
  await overlay(true);
  await page.screenshot({ path: path.join(OUT, `${name}-overlay.png`) });
  await overlay(false);
}

// Unlock every level from the start (no reload: a reload restarts the cover and would paint its sleeping Momo over the world).
await context.addInitScript(() => { try { sessionStorage.setItem("sketchbook.unlockAll", "1"); } catch { /* storage blocked */ } });
/** A free-hand cloud/heart-like squiggle, closer to what a student draws than the harness rectangle. */
async function drawFree() {
  const box = await page.locator("[data-testid=draw-canvas]").boundingBox();
  const cx = box.x + box.width * 0.4, cy = box.y + box.height * 0.5;
  const heart = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    heart.push([cx + 16 * Math.pow(Math.sin(t), 3) * 5, cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 5]);
  }
  const eye = [[cx - 20, cy - 10], [cx - 14, cy - 16], [cx - 8, cy - 10]];
  for (const s of [heart, eye]) {
    await page.mouse.move(s[0][0], s[0][1]);
    await page.mouse.down();
    for (const [x, y] of s.slice(1)) await page.mouse.move(x, y, { steps: 3 });
    await page.mouse.up();
  }
}
const report = { levels: {} };
try {
  await onboardToLevels(page, base, m => log(m));
  for (const stage of LEVELS) {
    log(`=== level ${stage} ===`);
    await page.locator(".level-card").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await enterLevel(page, stage, m => log(m));
    const plan = plans[String(stage)];
    const cycle = plan.cycles[0];
    if (process.env.SHAPE === "free") await drawFree(); else await drawScribble(page, "block");
    await page.screenshot({ path: path.join(OUT, `L${stage}-a-drawn.png`) });
    await submitAndDecide(page, { prefer: cycle.label, log: m => log(m) });
    await page.locator("[data-testid=sticker-stamp]").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT, `L${stage}-b-sticker.png`) });
    const placed = await placeByDrag(page, cycle.x + (cycle.w ?? plans.objectSize.w) / 2, cycle.y + (cycle.h ?? plans.objectSize.h) / 2);
    await shots(`L${stage}-0-placing`);
    await confirmPlacement(page);
    await sleep(800);
    await shots(`L${stage}-1-spawn`);
    const g = await readGame(page);
    const { geo, creations } = await overlay(false);
    report.levels[stage] = { placed: placed.after, spawn: { x: g.x, y: g.y }, geometry: geo, creations };
  }
} catch (e) {
  log("FAILURE", String(e?.stack || e));
  await page.screenshot({ path: path.join(OUT, "zz-failure.png") }).catch(() => {});
  report.failure = String(e?.stack || e);
}
writeJson(path.join(OUT, "report.json"), report);
await context.close(); await browser.close(); server.close();
console.log(`DONE out=${OUT} failure=${report.failure ? "yes" : "no"}`);
process.exit(report.failure ? 1 : 0);

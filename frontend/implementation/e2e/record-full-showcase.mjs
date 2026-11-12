// STALE: butuh pembaruan harness baru
// PRD 0.0.16 T14 — full showcase recording, NO skips, one MP4.
// Cover wave, ruler, tutorial, level select (ribbon thumb), the whole story intro incl. Momo flying up
// with the camera to the sky canvas, slow visible drawing, Momo's guess chat, HITL decision, world
// placement, walking, win, book close, L1-L3 and the closing (Pusat Halaman).
// Needs a NEXT_PUBLIC_TEST_HOOKS=1 static export in out/ (wave and thumb are simulated on the fake camera).
// Usage: node e2e/record-full-showcase.mjs
// Output: docs/execution/evidence/prd-0.0.16/full-showcase.mp4 (+ steps.json)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, launch, startStaticServer, sleep, writeJson, gitInfo, wakeMomoOnCover, pickStudentNumber, playTutorial, playEnding,
  enterLevel, drawSlow, submitAndDecide, placeByDrag, confirmPlacement, readGame, playPlanSteps, holdThumb, drawHandOrMouseSlow } from "./lib/harness.mjs";

const plans = JSON.parse(fs.readFileSync(path.join(ROOT, "e2e/lib/level-plans.json"), "utf8"));
const OUT = path.join(ROOT, "docs/execution/evidence/prd-0.0.16");
const VIDEO_TMP = path.join(OUT, "raw-video");
const DRAW_MS = Number(process.env.DRAW_MS || 10000);
const steps = [];
const log = msg => { const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`; steps.push(line); console.log(line); };

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(VIDEO_TMP, { recursive: true, force: true });
const { server, base } = await startStaticServer();
const { browser, context, page, errors } = await launch({
  videoDir: VIDEO_TMP,
  extraArgs: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  permissions: ["camera"],
});
let ok = false;
const toCentre = c => [c.x + plans.objectSize.w / 2, c.y + plans.objectSize.h / 2];
try {
  // 1. Cover: Momo sleeps, the wave wakes her, the book opens to the ruler (R1, R2).
  await wakeMomoOnCover(page, base, log);
  await sleep(600);
  // 2. Ruler: pick a number, Momo asks, 2 s thumb (R3, R4).
  await pickStudentNumber(page, { steps: 3, log });
  // 3. Tutorial: walk Thinman, cards 1-2 (1 s thumbs), card 3 draw + Mundur, Mulai Level 1 (2 s thumb).
  await playTutorial(page, log, { slow: true });
  for (const stage of [1, 2, 3]) {
    const plan = plans[String(stage)];
    await sleep(1200);
    if (stage > 1 || await page.locator(".level-card").first().isVisible().catch(() => false)) log(`L${stage}: level list`);
    // 4-5. Level select: thumb on the ribbon, ribbon bounces, book opens; whole story intro, Momo rises to the sky canvas.
    await enterLevel(page, stage, log, { entry: "thumb", intro: "watch" });
    // 6. Each object: slow drawing, guess chat, decision, placement.
    for (const [ci, cycle] of plan.cycles.entries()) {
      if (ci > 0) { await page.locator("[data-testid=btn-draw-again]").click(); log(`L${stage}: Ciptakan objek lagi`); }
      await drawHandOrMouseSlow(page, DRAW_MS);
      log(`L${stage}c${ci + 1}: drawn slowly (${await page.evaluate(() => window.__skbTestHooks?.surface?.getMode?.() ?? "pointer")} input)`);
      const { decision } = await submitAndDecide(page, { prefer: cycle.label, log: m => log(`L${stage}c${ci + 1}: ${m}`) });
      await sleep(800);
      await placeByDrag(page, ...toCentre(cycle));
      await confirmPlacement(page);
      log(`L${stage}c${ci + 1}: ${decision.type} ${decision.label} placed in the world`);
    }
    // 7. Walking to the win (retry from checkpoint if a jump misses).
    let win = false;
    for (let attempt = 1; attempt <= 4 && !win; attempt++) {
      const g0 = await readGame(page);
      if (g0.outcome) { await page.locator("[data-testid=btn-retry-cycle]").click(); await sleep(500); }
      const r = await playPlanSteps(page, plan.steps);
      log(`L${stage}: walk attempt ${attempt} -> ${r.outcome ?? "none"}`);
      win = r.outcome === "success";
    }
    if (!win) throw new Error(`L${stage}: no win`);
    await page.locator("[data-testid=success-chat][data-finished=true]").waitFor({ timeout: 25000 });
    await sleep(800);
    // 8. Book closes back to the level list (L1, L2) or opens the ending (L3).
    await holdThumb(page, "btn-continue", { timeout: 8000 }).catch(() => {});
    if (stage < 3) {
      await page.locator(".level-card").first().waitFor({ state: "visible", timeout: 20000 });
      log(`L${stage}: book closed, back to the level list`);
    }
  }
  // 9. Closing: Pusat Halaman (R9): 1 s, 1 s, pick, 2 s.
  await playEnding(page, { choice: "finish", log });
  await sleep(3000);
  ok = true;
} catch (e) {
  log(`FAILED: ${e.message}`);
  await page.screenshot({ path: path.join(OUT, "showcase-failure.png") }).catch(() => {});
} finally {
  await context.close();
  await browser.close();
  server.close();
}
const webm = fs.readdirSync(VIDEO_TMP).filter(f => f.endsWith(".webm")).map(f => path.join(VIDEO_TMP, f))[0];
const mp4 = path.join(OUT, "full-showcase.mp4");
if (webm) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
  fs.rmSync(VIDEO_TMP, { recursive: true, force: true });
  log(`video: ${path.relative(ROOT, mp4)}`);
}
const critical = errors.filter(e => !/favicon/i.test(e.text));
writeJson(path.join(OUT, "steps.json"), { ok, git: gitInfo(), steps, errors: critical });
process.exit(ok ? 0 : 1);

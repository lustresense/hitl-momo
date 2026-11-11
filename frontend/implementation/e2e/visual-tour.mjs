// E-SHOTS (2026-11-11): bukti visual semua layar dan ukuran jeda masuk level.
// Satu perjalanan dengan input mouse/keyboard tepercaya (kamera mati, mode fallback), dari cover sampai layar akhir
// setelah penutup Bab 3. Di tiap layar yang diminta diambil screenshot 1280x720 dan 390x844 (viewport dipindah lalu
// dikembalikan). Pengukuran waktu memakai pemantau requestAnimationFrame di halaman yang hanya MEMBACA DOM.
// Tidak memanggil window.__skb* dan tidak mengubah state produk.
import fs from "node:fs";
import path from "node:path";
import {
  ROOT, startStaticServer, launch, gitInfo, sleep, readGame, holdThumb, press,
  submitAndDecide, confirmPlacement, drawScribble, writeJson, placeByDrag,
} from "./lib/harness.mjs";

const plans = JSON.parse(fs.readFileSync(path.join(ROOT, "e2e/lib/level-plans.json"), "utf8"));
const OUT = process.env.TOUR_OUT || "/tmp/claude-0/-home-user-hitl-momo/70f1ddc5-ed67-5bfc-8173-b01b43d2907b/scratchpad/run8/E-SHOTS";
const DESKTOP = { width: 1280, height: 720 };
const MOBILE = { width: 390, height: 844 };
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 4);
const ENDING_AFTER = 3;
fs.mkdirSync(OUT, { recursive: true });

const T0 = Date.now();
const steps = [];
const timings = {};
const shotLog = [];
const gameplayAttempts = [];
const log = (msg, detail) => {
  const row = { at: Date.now() - T0, msg, ...(detail !== undefined ? { detail } : {}) };
  steps.push(row);
  console.log(`[${String(row.at).padStart(7)} ms] ${msg}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`);
};

// Read-only watchers: a predicate over the DOM, sampled each animation frame inside the page. The timestamp is the
// page's Date.now() at the first frame where it holds (precision about one frame, ~70 ms in this sandbox).
const EXPR = {
  introLine: "!!document.querySelector('[data-testid=intro-chat] .momo-bubble')",
  coverThumb: "(() => { const e = document.querySelector('[data-testid=cover-thumb]'); return !!e && e.getBoundingClientRect().width > 0; })()",
  flagReached: "(() => { const e = document.querySelector('[data-testid=tutorial-thumb-1]'); return !!e && e.getAttribute('aria-label') === 'Baca dulu, ya'; })()",
  thumb1Unlocked: "(() => { const e = document.querySelector('[data-testid=tutorial-thumb-1]'); return !!e && e.getAttribute('data-locked') !== 'true'; })()",
};

const { server, base } = await startStaticServer();
const { browser, context, page, errors } = await launch({ viewport: DESKTOP });
let result = "FAIL";
let failure = null;

/** Screenshot at 1280x720, then 390x844, then back to 1280x720. First picture per name only. */
const seen = new Set();
async function shotBoth(name) {
  if (seen.has(name)) return;
  seen.add(name);
  await sleep(300);
  const entry = { name, at: Date.now() - T0, files: {} };
  entry.files.desktop = path.join(OUT, `${name}-1280x720.png`);
  await page.screenshot({ path: entry.files.desktop }).catch(e => log(`shot ${name} desktop failed`, String(e)));
  await page.setViewportSize(MOBILE);
  await sleep(900);
  entry.files.mobile = path.join(OUT, `${name}-390x844.png`);
  await page.screenshot({ path: entry.files.mobile }).catch(e => log(`shot ${name} mobile failed`, String(e)));
  await page.setViewportSize(DESKTOP);
  await sleep(500);
  shotLog.push(entry);
  log(`shot ${name}`);
}

async function arm(key, expr) {
  await page.evaluate(([key, expr]) => {
    const w = (window.__tourWatch ||= {});
    if (key in w) return;
    w[key] = null;
    const pred = new Function(`return (${expr});`);
    const tick = () => {
      if (w[key] !== null) return;
      let ok = false;
      try { ok = !!pred(); } catch { ok = false; }
      if (ok) { w[key] = Date.now(); return; }
      requestAnimationFrame(tick);
    };
    tick();
  }, [key, expr]);
}
const watchAt = key => page.evaluate(k => window.__tourWatch?.[k] ?? null, key);
async function waitWatch(key, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await watchAt(key);
    if (v !== null) return v;
    await sleep(100);
  }
  return null;
}

async function waitThumbUnlocked(testId, timeout = 90000) {
  await page.waitForFunction(id => { const el = document.querySelector(`[data-testid="${id}"]`); return !!el && el.getAttribute("data-locked") !== "true"; }, testId, { timeout });
}

// Stepping copied from e2e/normal-journey.mjs (the journey that passes Bab 3 on the same build). Copied, not imported,
// because normal-journey.mjs runs its whole journey on import. Trusted keys only.
const stationary = async () => { await sleep(150); return readGame(page); };

/** Stand still at launchX (left-edge world x) using short key holds + feedback. */
async function standAt(targetX, tol = 7) {
  for (let i = 0; i < 8; i++) {
    const m = await stationary();
    if (m.phase !== "gameplay" || m.settled) return m;
    const dx = targetX - m.x;
    if (Math.abs(dx) <= tol && m.grounded) return m;
    const key = dx > 0 ? "ArrowRight" : "ArrowLeft";
    await page.keyboard.down(key);
    await sleep(Math.max(30, Math.abs(dx) / 200 * 1000 - 25));
    await page.keyboard.up(key);
  }
  return stationary();
}

async function waitLanding(release, timeoutMs = 4000) {
  const end = Date.now() + timeoutMs; let airborne = false, m;
  while (Date.now() < end) {
    m = await readGame(page);
    if (m.outcome || m.settled) break;
    if (!m.grounded) airborne = true;
    if (airborne && m.grounded) break;
    await sleep(8);
  }
  await release();
  return m;
}

async function jump(step) {
  const t0 = Date.now();
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("Space");
  await sleep(150); // >= 2 rendered frames at the ~15 fps this sandbox renders at
  await page.keyboard.up("Space");
  if (step.hold < 999) {
    await sleep(Math.max(0, step.hold * 20 - (Date.now() - t0)));
    await page.keyboard.up("ArrowRight");
    return waitLanding(async () => {});
  }
  return waitLanding(async () => { await page.keyboard.up("ArrowRight"); });
}

async function walkRightUntilOutcome(ms = 5000) {
  await page.keyboard.down("ArrowRight");
  const end = Date.now() + ms;
  while (Date.now() < end) { const m = await readGame(page); if (m.outcome || m.settled) break; await sleep(20); }
  await page.keyboard.up("ArrowRight");
}

/** Plays the given student steps in order; stops at an outcome. */
async function playSteps(stepList) {
  for (const step of stepList) {
    const before = await standAt(step.launchX);
    if (before.settled) return before;
    const after = await jump(step);
    if (after.outcome || after.settled) return after;
  }
  return readGame(page);
}

/** Partial test run: the first steps only (no walk to the end). */
const runSteps = list => playSteps(list);

async function failShotIfVisible() {
  const vis = await page.locator("[data-testid=fail-reason]").isVisible().catch(() => false);
  if (vis) await shotBoth("15-layar-gagal");
}

async function cover() {
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 45000 });
  const wake = page.locator("[data-testid=cover-wake]");
  // Camera off (mouse mode): Momo sleeps on the right. The fallback button "Bangunkan Momo" appears only after the
  // camera switch is turned on and no camera answers (as in the normal journey), so the switch is pressed first.
  await page.locator("[data-testid=btn-camera-toggle-switch]").waitFor({ state: "visible", timeout: 30000 });
  await sleep(1500);
  await shotBoth("01-cover-tidur");
  await page.locator("[data-testid=btn-camera-toggle-switch]").click();
  log("cover: camera switch turned on (no camera in this browser)");
  await wake.waitFor({ state: "visible", timeout: 30000 });

  await arm("coverThumb", EXPR.coverThumb);
  const tWake = Date.now();
  await wake.click();
  log("cover: Bangunkan Momo clicked (camera off)");
  await sleep(3000);
  await shotBoth("02-cover-setelah-bangun");
  await page.locator("[data-testid=cover-thumb]").waitFor({ state: "visible", timeout: 90000 });
  const tRing = await waitWatch("coverThumb", 90000);
  timings.bangunMomoKeCincinAkuMengerti = { wakeMs: tWake, ringMs: tRing, ms: tRing === null ? null : tRing - tWake };
  log("cover: 'Aku mengerti' ring visible", timings.bangunMomoKeCincinAkuMengerti);

  await holdThumb(page, "cover-thumb", { timeout: 90000 });
  await page.waitForURL(u => u.pathname === "/onboarding/number", { timeout: 30000 });
  log("cover: book opened to the ruler");
}

async function ruler() {
  const slider = page.getByRole("slider", { name: "Nomor absen" });
  await slider.waitFor({ state: "visible", timeout: 20000 });
  await shotBoth("03-penggaris-fase-fokus");
  await page.waitForFunction(() => document.querySelector("[role=slider][aria-label='Nomor absen']")?.getAttribute("tabindex") === "0", null, { timeout: 60000 });
  log("ruler: unlocked after Momo's focus phase");
  await slider.focus();
  for (let i = 0; i < 2; i++) { await page.keyboard.press("ArrowRight"); await sleep(120); }
  await sleep(1500); // 0.6 s rest, then the question and the 2 s thumb
  await shotBoth("04-penggaris-setelah-digeser");
  const value = Number(await slider.getAttribute("aria-valuenow"));
  await holdThumb(page, "number-thumb", { timeout: 60000 });
  log(`ruler: number ${value} confirmed`);
}

async function tutorial() {
  const walk = page.locator("[data-testid=tutorial-walk]");
  await walk.waitFor({ state: "visible", timeout: 30000 });
  await sleep(1200);
  await arm("flagReached", EXPR.flagReached);
  await arm("thumb1Unlocked", EXPR.thumb1Unlocked);
  for (let tries = 0; tries < 8; tries++) {
    const wb = await walk.boundingBox();
    const y = wb.y + wb.height * 0.6;
    await page.mouse.move(wb.x + wb.width * 0.12, y);
    await page.mouse.down();
    await page.mouse.move(wb.x + wb.width * 0.92, y, { steps: 24 });
    await page.mouse.up();
    if (await page.getByText("Baca dulu, ya").first().waitFor({ state: "visible", timeout: 2500 }).then(() => true, () => false)) break;
    log(`tutorial: walk try ${tries + 1} not at the flag yet`);
  }
  const tFlag = await waitWatch("flagReached", 30000);
  await sleep(400);
  await shotBoth("05-kartu1-cincin-terkunci");
  const tActive = await waitWatch("thumb1Unlocked", 60000);
  timings.kartu1SampaiBenderaKeCincinAktif = { flagMs: tFlag, activeMs: tActive, ms: tFlag === null || tActive === null ? null : tActive - tFlag };
  log("tutorial: card 1 flag -> ring active", timings.kartu1SampaiBenderaKeCincinAktif);
  await holdThumb(page, "tutorial-thumb-1", { timeout: 15000 });

  await waitThumbUnlocked("tutorial-thumb-2");
  await holdThumb(page, "tutorial-thumb-2", { timeout: 15000 });

  const canvas = page.locator("canvas.tut-draw__canvas");
  await canvas.waitFor({ state: "visible", timeout: 30000 });
  await page.locator(".tutorial-card-3.is-open").waitFor({ state: "attached", timeout: 30000 });
  await sleep(3000);
  const cb = await canvas.boundingBox();
  const cx = cb.x + cb.width / 2, cy = cb.y + cb.height / 2;
  const drag = async pts => {
    await page.mouse.move(cx + pts[0][0], cy + pts[0][1]);
    await page.mouse.down();
    for (const [dx, dy] of pts.slice(1)) await page.mouse.move(cx + dx, cy + dy, { steps: 6 });
    await page.mouse.up();
  };
  await drag([[-60, -20], [60, -20], [60, 25], [-60, 25]]);
  await page.locator("[data-tool=erase]").click();
  await drag([[-70, 0], [70, 0]]);
  await page.locator("[data-tool=draw]").click();
  await page.locator("[data-tool=undo]").click();
  await page.locator("[data-tool=redo]").click();
  await sleep(600);
  await shotBoth("06-kartu3");
  await waitThumbUnlocked("tutorial-thumb-3");
  await holdThumb(page, "tutorial-thumb-3", { timeout: 15000 });
  log("tutorial: card 3 confirmed, Mulai Level 1");
}

async function enterLevel(stage) {
  const alreadyIn = await page.locator("[data-testid=level-intro], [data-testid=draw-canvas]").first()
    .waitFor({ state: "attached", timeout: 2500 }).then(() => true, () => false);
  if (!alreadyIn) {
    const card = page.locator(".level-card").nth(stage - 1);
    await card.waitFor({ state: "visible", timeout: 20000 });
    await page.waitForFunction(i => document.querySelectorAll(".level-card")[i]?.dataset.state !== "locked", stage - 1, { timeout: 8000 });
    if (stage === 1) await shotBoth("07-daftar-bab");
    await arm(`introLine${stage}`, EXPR.introLine);
    const tPull = Date.now();
    await card.click();
    if (stage === 1) timings.tarikPitaKeBarisPertamaMomo = { pullMs: tPull, firstLineMs: await waitWatch("introLine1", 30000) };
    if (stage === 1) {
      const t = timings.tarikPitaKeBarisPertamaMomo;
      t.ms = t.firstLineMs === null ? null : t.firstLineMs - t.pullMs;
      log("ribbon pulled -> first Momo line in the intro", t);
    }
  } else log(`L${stage}: opened straight from the tutorial`);

  const intro = page.locator("[data-testid=level-intro]");
  if (await intro.waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false)) {
    await sleep(2500);
    if (stage === 1) await shotBoth("08-intro-level-gelap");
    if (stage === 3) await shotBoth("08b-intro-level3-gelap");
    await holdThumb(page, "intro-continue", { timeout: 45000 });
    log(`L${stage}: intro thumb held, the book rises`);
    await intro.waitFor({ state: "detached", timeout: 15000 });
  }
  await page.locator("[data-testid=draw-canvas]").waitFor({ state: "attached", timeout: 15000 });
  const start = page.locator("[data-testid=btn-focus-start]");
  if (await start.waitFor({ state: "visible", timeout: 90000 }).then(() => true, () => false)) {
    await sleep(1200);
    if (stage === 1) await shotBoth("09-kanvas-fase-fokus");
    await holdThumb(page, "btn-focus-start", { timeout: 15000 });
    await page.locator("[data-testid=drawing-focus-backdrop]").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    log(`L${stage}: "Mulai Menggambar" held, canvas open`);
  }
  await page.locator("[data-testid=draw-canvas]").waitFor({ state: "visible", timeout: 15000 });
  // Journey check (REVISI 18C): the canvas of a level lives at /canvasN, reached by pushState from /levelN.
  await page.waitForURL(u => u.pathname === `/canvas${stage}`, { timeout: 15000 }).catch(() => {});
  const route = new URL(page.url()).pathname;
  log(`L${stage}: route`, route);
  if (route !== `/canvas${stage}`) throw new Error(`L${stage}: expected route /canvas${stage}, got ${route}`);
}

async function level(stage) {
  log(`=== LEVEL ${stage} ===`);
  await enterLevel(stage);
  const plan = plans[String(stage)];
  for (const [ci, cycle] of plan.cycles.entries()) {
    if (ci === 0) {
      await drawScribble(page, "block");
      if (stage === 1) await shotBoth("10-kanvas-menggambar");
    } else {
      await press(page, "btn-draw-again");
      await drawScribble(page, ci % 2 ? "spike" : "block");
    }
    const submitVia = ci % 2 ? "button" : "finish";
    const { decision } = await submitAndDecide(page, {
      prefer: cycle.label, submitVia, log: m => log(`L${stage}c${ci + 1}: ${m}`), shot: n => shotBoth(`11-${n}`),
    });
    log(`L${stage}c${ci + 1}: decision`, decision);
    await page.locator("[data-testid=sticker-stamp]").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    if (stage === 1 && ci === 0) await shotBoth("12-stiker");
    await press(page, "btn-throw-sticker");
    await page.waitForFunction(() => document.querySelector("[data-testid=game-canvas]")?.dataset.phase === "placing", null, { timeout: 15000 });
    if (stage === 1 && ci === 0) await shotBoth("13-penempatan");
    // Same drag as normal-journey (placeByDrag). The sticker was thrown above, so create:false (as recovery-paths does).
    const placed = await placeByDrag(page, cycle.x + plans.objectSize.w / 2, cycle.y + plans.objectSize.h / 2, { create: false });
    log(`L${stage}c${ci + 1}: placed`, { objectX: +placed.after.objectX.toFixed(1), objectY: +placed.after.objectY.toFixed(1) });
    await confirmPlacement(page);
    await sleep(800);
    if (stage === 1 && ci === 0) await shotBoth("14-gameplay");
    if (ci < plan.cycles.length - 1) {
      const partial = plan.steps.slice(0, stage === 2 ? 2 : 1);
      const r = await runSteps(partial);
      log(`L${stage}c${ci + 1}: test run`, { outcome: r.outcome ?? null });
      if (r.outcome) {
        await page.locator("[data-testid=outcome-overlay]").waitFor({ timeout: 8000 }).catch(() => {});
        await failShotIfVisible();
        await press(page, "btn-retry-cycle");
      }
    }
  }

  let win = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !win; attempt++) {
    const g0 = await readGame(page);
    if (g0.outcome) { await press(page, "btn-retry-cycle"); await sleep(400); }
    const t = Date.now();
    let r = await playSteps(plan.steps);
    if (!r.outcome) { await walkRightUntilOutcome(); r = await readGame(page); }
    await page.locator("[data-testid=outcome-overlay]").waitFor({ timeout: 8000 }).catch(() => {});
    if (r.outcome && r.outcome !== "success") await failShotIfVisible();
    gameplayAttempts.push({ stage, attempt, outcome: r.outcome ?? null, ms: Date.now() - t });
    log(`L${stage}: attempt ${attempt} -> ${r.outcome ?? "none"}`);
    if (r.outcome === "success") win = true;
  }
  if (!win) throw new Error(`L${stage}: no WIN after ${MAX_ATTEMPTS} attempts`);

  await page.locator("[data-testid=success-chat]").waitFor({ timeout: 8000 });
  await page.locator("[data-testid=success-chat][data-finished=true]").waitFor({ timeout: 25000 });
  log(`L${stage}: Momo success chat finished`);
}

async function ending() {
  await page.locator("[data-testid=center-of-page]").waitFor({ state: "visible", timeout: 30000 });
  await sleep(3000);
  await shotBoth("16-portal");
  await holdThumb(page, "ending-understood", { timeout: 60000 });
  await page.locator("[data-testid=ending-recap]").waitFor({ state: "visible", timeout: 30000 });
  await sleep(800);
  await shotBoth("17-rekap");
  await holdThumb(page, "ending-recap-next", { timeout: 30000 });
  await press(page, "ending-back-to-cover", { timeout: 30000 });
  await page.locator("[data-testid=cover-wake], [data-testid=btn-camera-toggle-switch]").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  await sleep(2500);
  await shotBoth("18-layar-akhir");
  log("ending: back on the cover");
}

try {
  log("run-start", { git: gitInfo(), input: "mouse+keyboard, camera off (fallback)", viewports: [DESKTOP, MOBILE] });
  await cover();
  await ruler();
  await tutorial();
  for (const stage of [1, 2, 3]) {
    if (stage === 1) {
      await page.locator(".level-card").first().waitFor({ state: "visible", timeout: 30000 });
    }
    await level(stage);
    if (stage === ENDING_AFTER) {
      await holdThumb(page, "btn-continue", { timeout: 8000 }).catch(() => {});
      await ending();
      break;
    }
    // Same hand-over as normal-journey: stage 1 is confirmed with btn-continue, stage 2 hands over by itself.
    if (stage === 1) await holdThumb(page, "btn-continue");
    await page.locator(".level-card").first().waitFor({ state: "visible", timeout: 15000 });
    await page.waitForURL(u => u.pathname === "/levels", { timeout: 15000 });
    await sleep(1500);
    const states = await page.locator(".level-card").evaluateAll(xs => xs.map(x => x.dataset.state));
    log(`after L${stage}: level list`, states);
    if (states[stage - 1] !== "done") throw new Error(`L${stage} must show as done after the win, got ${states}`);
    if (stage < ENDING_AFTER && states[stage] === "locked") throw new Error(`L${stage + 1} must be unlocked after winning L${stage}, got ${states}`);
  }
  result = "PASS";
} catch (e) {
  failure = String(e?.stack || e);
  log("FAILURE", failure);
  await page.screenshot({ path: path.join(OUT, "99-gagal-terakhir-1280x720.png") }).catch(() => {});
}

const criticalErrors = errors.filter(e => !/favicon|Download the React DevTools/i.test(e.text));
await context.close();
await browser.close();
server.close();
writeJson(path.join(OUT, "timings.json"), { timings, gameplayAttempts });
writeJson(path.join(OUT, "run.json"), { result, failure, git: gitInfo(), shots: shotLog, consoleAndPageErrors: criticalErrors, steps });
console.log(`RESULT ${result}  shots=${shotLog.length}  consoleErrors=${criticalErrors.length}  out=${OUT}`);
process.exit(result === "PASS" ? 0 : 1);

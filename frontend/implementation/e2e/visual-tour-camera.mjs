// W-CAMSHOTS2 (2026-11-12): tour of every screen in CAMERA mode (fake camera device, Mouse toggle never clicked).
// Copy of e2e/visual-tour.mjs. Changes against it:
//  - Chromium gets a fake camera and the camera permission, so the app starts in input mode "camera".
//  - Cover: the wave ring (cover-wave-hint) is woken by a silent 1 s mouse hold (commit 5d3fb2d), not by the
//    "Bangunkan Momo" button. The text button must not show in camera mode; the probe records it if it does.
//  - Rings (GestureRing, ThumbConfirm) are advanced with the silent pointer hold they accept in camera mode.
//    The __skbThumb hook exists only in a NEXT_PUBLIC_TEST_HOOKS=1 build, and out/ is not one.
//  - Card 3 and the level canvas are drawn with the mouse (pointer drawing is silently accepted in camera mode).
//    The script fails if a mouse stroke leaves no ink.
//  - Placement confirm is the ring-place ring (camera) instead of btn-confirm-placement (fallback button).
//  - Stand-ins that are NOT camera input, marked in the log: Thinman's walking and jumping, and the ruler slider,
//    use the keyboard (useGameplayInput.ts keeps keydown listeners in camera mode, and the direction buttons take
//    no press there). Every screen is still checked for camera mode.
//  - Recovery: on level 1 (first cycle), Thinman walks off the first gap on purpose to reach the fail screen.
//  - Every screenshot first checks that the app is still in camera mode (sessionStorage flag written by
//    src/input/input-mode.ts, plus no data-mode="fallback" element). Desktop 1280x720 only.
// Read-only probe per screen: gesture rings, finger glyphs, gameplay bar, keyboard/mouse hints, Mouse/Kamera switch.
import fs from "node:fs";
import path from "node:path";
import {
  ROOT, startStaticServer, launch, gitInfo, sleep, readGame, drawScribble, writeJson, placeByDrag,
} from "./lib/harness.mjs";

const plans = JSON.parse(fs.readFileSync(path.join(ROOT, "e2e/lib/level-plans.json"), "utf8"));
const OUT = process.env.TOUR_OUT || "/tmp/claude-0/-home-user-hitl-momo/70f1ddc5-ed67-5bfc-8173-b01b43d2907b/scratchpad/run13-cam";
const DESKTOP = { width: 1280, height: 720 };
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 4);
const ENDING_AFTER = 3;
// Silent hold on the cover wave ring: WAVE_RING_HOLD_MS = 1000 in GlobalCamera.tsx; held 1.6 s for margin.
const WAVE_HOLD_MS = 1600;
fs.mkdirSync(OUT, { recursive: true });

const T0 = Date.now();
const steps = [];
const timings = {};
const shotLog = [];
const gameplayAttempts = [];
const findings = [];
const log = (msg, detail) => {
  const row = { at: Date.now() - T0, msg, ...(detail !== undefined ? { detail } : {}) };
  steps.push(row);
  console.log(`[${String(row.at).padStart(7)} ms] ${msg}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`);
};
const finding = (key, detail) => { findings.push({ key, detail }); log(`FINDING ${key}`, detail); };

const EXPR = {
  introLine: "!!document.querySelector('[data-testid=intro-chat] .momo-bubble')",
  coverThumb: "(() => { const e = document.querySelector('[data-testid=cover-thumb]'); return !!e && e.getBoundingClientRect().width > 0; })()",
  flagReached: "(() => { const e = document.querySelector('[data-testid=tutorial-thumb-1]'); return !!e && e.getAttribute('aria-label') === 'Baca dulu, ya'; })()",
  thumb1Unlocked: "(() => { const e = document.querySelector('[data-testid=tutorial-thumb-1]'); return !!e && e.getAttribute('data-locked') !== 'true'; })()",
};

const { server, base } = await startStaticServer();
const { browser, context, page, errors } = await launch({
  viewport: DESKTOP,
  extraArgs: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  permissions: ["camera"],
});
let result = "FAIL";
let failure = null;

// Read-only DOM probe. storedFallback is the value input-mode.ts writes when the app is in fallback.
const PROBE = () => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  let storedFallback = null;
  try { storedFallback = sessionStorage.getItem("skb-input-mode-fallback"); } catch { storedFallback = "unavailable"; }
  const leaves = [...document.querySelectorAll("body *")].filter(e => e.children.length === 0 && vis(e)).map(e => e.textContent.trim()).filter(Boolean);
  const bar = document.querySelector("[data-testid=gameplay-controls]");
  return {
    storedFallback,
    fallbackAttrs: document.querySelectorAll('[data-mode="fallback"],[data-input-mode="fallback"]').length,
    cameraAttrs: document.querySelectorAll('[data-mode="camera"],[data-input-mode="camera"]').length,
    mouseKameraSwitchVisible: [...document.querySelectorAll("[data-testid=btn-input-pointer],[data-testid=btn-input-hand]")].filter(vis).length,
    keyboardOrMouseHintsVisible: [...new Set(leaves.filter(t => /\[(A|D|Spasi|Klik)|Lompat|Geser Objek|Kiri|Kanan|Putar kiri|Putar kanan/.test(t)))].slice(0, 20),
    coverWakeTextButtonVisible: [...document.querySelectorAll("[data-testid=cover-wake]")].some(vis),
    rings: [...document.querySelectorAll(".gesture-ring, [data-testid=cover-wave-hint]")].filter(vis).map(e => ({
      testId: e.getAttribute("data-testid"), label: e.getAttribute("aria-label"), mode: e.getAttribute("data-mode"), state: e.getAttribute("data-state"),
    })),
    fingerGlyphs: [...document.querySelectorAll(".finger-glyph")].filter(vis).length,
    steerDialVisible: [...document.querySelectorAll("[data-testid=steer-dial]")].some(vis),
    gameplayBar: bar ? {
      inputMode: bar.getAttribute("data-input-mode"),
      visibleButtons: [...bar.querySelectorAll("button")].filter(vis).map(b => b.getAttribute("aria-label") || b.innerText.trim()),
      visibleText: bar.innerText.replace(/\s+/g, " ").trim().slice(0, 200),
    } : null,
    visibleButtonTexts: [...document.querySelectorAll("button")].filter(vis).map(b => b.innerText.trim()).filter(Boolean).slice(0, 30),
  };
};

/** Screenshot 1280x720 (first picture per name only), then the camera-mode assertion. */
const seen = new Set();
async function shot(name) {
  if (seen.has(name)) return;
  seen.add(name);
  await sleep(300);
  const file = path.join(OUT, `${name}-1280x720.png`);
  await page.screenshot({ path: file }).catch(e => log(`shot ${name} failed`, String(e)));
  const probe = await page.evaluate(PROBE).catch(e => ({ error: String(e) }));
  shotLog.push({ name, at: Date.now() - T0, file, probe });
  log(`shot ${name}`, {
    storedFallback: probe.storedFallback, fallbackAttrs: probe.fallbackAttrs, cameraAttrs: probe.cameraAttrs,
    mouseKameraSwitchVisible: probe.mouseKameraSwitchVisible, rings: (probe.rings || []).map(r => r.label || r.testId),
  });
  if (probe.storedFallback === "1" || probe.fallbackAttrs > 0) throw new Error(`${name}: app is NOT in camera mode (fallback)`);
}

/** Screenshot of one element (the gameplay bar, the speedometer). Probe-free: the screen shot already probed. */
async function shotEl(selector, name) {
  const el = page.locator(`${selector} >> visible=true`).first();
  if (!(await el.isVisible().catch(() => false))) { log(`shotEl ${name}: not visible`); return; }
  await el.screenshot({ path: path.join(OUT, `${name}-elemen.png`) }).catch(e => log(`shotEl ${name} failed`, String(e)));
  log(`shotEl ${name}`);
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

// Camera-mode hold. ThumbConfirm and GestureRing (data-mode="camera") fill while a pointer is held on them; the
// same press works as the silent fallback. Ring confirms once, the latch needs a release before it can refill.
async function waitRingDone(testId, holdMs) {
  // DOM read (not a Playwright locator): a locator read that fails must not count as a confirmed ring.
  const read = () => page.evaluate(id => {
    const nodes = [...document.querySelectorAll(`[data-testid="${id}"]`)];
    const n = nodes.find(x => x.getBoundingClientRect().width > 0) ?? null;
    return n ? { p: Number(n.getAttribute("data-progress")), c: n.classList.contains("is-confirmed"), count: nodes.length } : null;
  }, testId).catch(() => "error");
  const end = Date.now() + holdMs * 6 + 2000;
  await sleep(holdMs);
  let last = null, gone = false;
  while (Date.now() < end) {
    const r = await read();
    if (r === "error") { await sleep(80); continue; }
    if (r === null) { gone = true; break; } // the ring left the screen with its step
    last = r;
    if (r.c || r.p >= 100) break;
    await sleep(80);
  }
  await sleep(150);
  const confirmed = !!last && (last.c || last.p >= 100);
  log(`hold ${holdMs} ms on ${testId}: last progress ${last?.p ?? "-"}, confirmed=${confirmed}, gone=${gone}`);
  return confirmed || gone;
}

async function holdThumb(page, testId, { timeout = 15000, tries = 3 } = {}) {
  const el = page.locator(`[data-testid="${testId}"] >> visible=true`);
  await el.waitFor({ state: "visible", timeout });
  const mode = await el.getAttribute("data-mode");
  const holdMs = Number(await el.getAttribute("data-hold-ms")) || 2000;
  if (mode === null) { await el.click(); return { mode: "tap", holdMs: 0 }; }
  if (mode !== "camera") throw new Error(`${testId}: data-mode="${mode}" in the camera tour (fallback reached)`);
  // Momo's wake and the ring's mount move the layout: press only once the ring has settled (a press that starts
  // while it mounts carries over and does not fill). Probed: a settled press fills to 100 and confirms.
  await sleep(1500);
  for (let attempt = 1; attempt <= tries; attempt++) {
    await sleep(300); // a ring that appears under a held pointer is armed only after one released frame
    const b = await el.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + Math.min(36, b.height / 3));
    await page.mouse.down();
    const confirmed = await waitRingDone(testId, holdMs);
    await page.mouse.up();
    if (confirmed) return { mode, holdMs, attempt };
    // A tutorial ring resets to 0 once its card has turned; the next card being open is the real confirmation.
    const card = /^tutorial-thumb-(\d)$/.exec(testId);
    if (card && await page.locator(`.tutorial-card-${Number(card[1]) + 1}.is-open`).count()) {
      log(`hold on ${testId}: card ${Number(card[1]) + 1} is open, the hold was accepted`);
      return { mode, holdMs, attempt };
    }
  }
  throw new Error(`${testId}: camera-mode ring did not fill after ${tries} silent holds`);
}

/** Cover wave ring: the silent 1 s hold that wakes Momo in camera mode (no button). */
async function holdWaveRing({ tries = 3 } = {}) {
  const ring = page.locator("[data-testid=cover-wave-hint] >> visible=true").first();
  await ring.waitFor({ state: "visible", timeout: 15000 });
  for (let attempt = 1; attempt <= tries; attempt++) {
    await sleep(300);
    const b = await ring.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await sleep(WAVE_HOLD_MS);
    await page.mouse.up();
    const gone = await page.locator("[data-testid=cover-wave-hint]").first().waitFor({ state: "hidden", timeout: 3000 }).then(() => true, () => false);
    log(`wave ring silent hold ${WAVE_HOLD_MS} ms, attempt ${attempt}: ring gone (Momo awake)=${gone}`);
    if (gone) return attempt;
  }
  throw new Error("cover-wave-hint: silent 1 s hold did not wake Momo after 3 tries");
}

async function press(page, testId, { timeout = 15000 } = {}) {
  const el = page.locator(`[data-testid="${testId}"] >> visible=true`);
  await el.waitFor({ state: "visible", timeout });
  if ((await el.getAttribute("data-hold-ms")) !== null) return holdThumb(page, testId, { timeout });
  await el.click();
  return { testId, mode: "click" };
}

async function holdFinishDrawing(page, { timeout = 15000 } = {}) {
  const el = page.locator("[data-testid=btn-finish-drawing]");
  await el.waitFor({ state: "visible", timeout });
  return holdThumb(page, "btn-finish-drawing", { timeout });
}

async function pickCandidate(page, rank, { timeout = 15000 } = {}) {
  const testId = rank === 1 ? "btn-accept" : `btn-correct-${rank}`;
  const btn = page.locator(`[data-testid=${testId}]`);
  await btn.waitFor({ state: "visible", timeout });
  const name = await btn.getAttribute("aria-label");
  await holdThumb(page, testId, { timeout });
  return name;
}

async function overrideTo(page, label, { timeout = 15000 } = {}) {
  await press(page, "btn-override", { timeout });
  await page.locator(`[data-testid="override-option-${label}"]`).waitFor({ state: "visible", timeout });
  await press(page, `override-option-${label}`, { timeout });
  await press(page, "override-confirm", { timeout });
}

// Local copy of the harness decision flow: the harness one calls its own fallback-only hold.
async function submitAndDecide(page, { prefer = "balok", log: lg = () => {}, shotFn, submitVia = "finish" } = {}) {
  const heading = page.getByRole("heading", { name: /tebakan momo/i });
  if (!(await heading.isVisible().catch(() => false))) {
    await sleep(1500);
    if (await heading.isVisible().catch(() => false)) throw new Error("Momo guessed while the student was still drawing (auto-ask is back)");
    // Tebak Gambarku is hidden in camera mode unless the hand is lost or Bantuan is open: use it only when shown.
    const btnVisible = await page.locator("[data-testid=btn-submit-drawing]").isVisible().catch(() => false);
    if (submitVia === "button" && btnVisible) { await page.locator("[data-testid=btn-submit-drawing]").click(); lg("submit via Tebak Gambarku button"); }
    else { if (submitVia === "button") lg("Tebak Gambarku hidden in camera mode, finish thumb used"); await holdFinishDrawing(page); }
  }
  await heading.waitFor({ timeout: 15000 });
  const labels = (await page.locator(".momo-guess__label, .top3-item .label").allTextContents()).map(x => x.replace(/⭐.*$/s, "").trim());
  lg(`Top-3 (MOCK provider): ${JSON.stringify(labels)}`);
  if (shotFn) await shotFn("top3");
  const rank = labels.findIndex(x => x.toLowerCase() === prefer) + 1;
  let decision;
  if (rank === 1) { await pickCandidate(page, 1); decision = { type: "Accept", rank, label: prefer }; }
  else if (rank > 1) { await pickCandidate(page, rank); decision = { type: "Correct", rank, label: prefer }; }
  else { await overrideTo(page, prefer); decision = { type: "Override", label: prefer }; }
  lg(`decision: ${JSON.stringify(decision)}`);
  return { labels, decision };
}

const stationary = async () => { await sleep(150); return readGame(page); };

// Stand-in for the hand (see header): keyboard walking, because the direction buttons take no press in camera mode.
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
  await sleep(150);
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

async function playSteps(stepList) {
  for (const step of stepList) {
    const before = await standAt(step.launchX);
    if (before.settled) return before;
    const after = await jump(step);
    if (after.outcome || after.settled) return after;
  }
  return readGame(page);
}

const runSteps = list => playSteps(list);

async function failShotIfVisible() {
  const vis = await page.locator("[data-testid=fail-reason]").isVisible().catch(() => false);
  if (vis) await shot("15-layar-gagal");
}

async function cover() {
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 45000 });
  const toggle = page.locator("[data-testid=btn-camera-toggle-switch]");
  await toggle.waitFor({ state: "visible", timeout: 30000 });
  await sleep(1500);
  await shot("01-cover-tidur");
  // The camera switch (not the Mouse toggle): camera on, the fake device starts. Without this there is no wave ring.
  await toggle.click();
  log("cover: camera switch turned on (fake camera device)");
  await page.waitForFunction(() => !!document.querySelector(".camera-widget-card.has-stream"), null, { timeout: 30000 });
  await sleep(3000);
  await shot("01b-cover-kamera-nyala");
  // Nobody waves (the fake device has no hand). The nudge runs 8 s to 20 s; the old wake button appeared at 20 s.
  await page.locator("[data-testid=cover-wave-hint]").first().waitFor({ state: "visible", timeout: 30000 });
  await sleep(22000);
  const wakeButton = await page.locator("[data-testid=cover-wake]").isVisible().catch(() => false);
  if (wakeButton) finding("cover-wake-button-in-camera-mode", { note: "text button shown in camera mode after 22 s" });
  log("cover: text wake button visible after 22 s in camera mode", { wakeButton });
  await shot("01c-cover-setelah-nudge-cincin-lambaian");

  await arm("coverThumb", EXPR.coverThumb);
  const tWake = Date.now();
  await holdWaveRing();
  log("cover: Momo woken by the silent 1 s hold on the wave ring (no button)");
  await sleep(3000);
  await shot("02-cover-setelah-bangun");
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
  await shot("03-penggaris-fase-fokus");
  await page.waitForFunction(() => document.querySelector("[role=slider][aria-label='Nomor absen']")?.getAttribute("tabindex") === "0", null, { timeout: 60000 });
  log("ruler: unlocked after Momo's focus phase");
  await slider.focus();
  for (let i = 0; i < 2; i++) { await page.keyboard.press("ArrowRight"); await sleep(120); }
  await sleep(1500);
  await shot("04-penggaris-setelah-digeser");
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
  await shot("05-kartu1-cincin-terkunci");
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
  const ink = () => page.evaluate(() => {
    const c = document.querySelector("canvas.tut-draw__canvas");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}.${String(e.className).slice(0, 60)}` : null; }, [cx, cy]);
  const inkBefore = await ink();
  log("card 3: element at canvas centre, ink before", { hit, ink: inkBefore });
  await drag([[-60, -20], [60, -20], [60, 25], [-60, 25]]);
  const inkAfter = await ink();
  log("card 3: ink after the first MOUSE stroke (camera mode)", { ink: inkAfter, used: await page.locator("[data-tool]").evaluateAll(xs => xs.map(x => `${x.dataset.tool}:${x.className.includes("is-used")}`)) });
  // The NUI-FIX (commit 5d3fb2d): pointer drawing is silently accepted in camera mode. No ink = still blocked.
  if (inkAfter <= inkBefore) throw new Error(`card 3: mouse stroke left no ink in camera mode (ink ${inkBefore} -> ${inkAfter})`);
  await page.locator("[data-tool=erase]").click();
  await drag([[-70, 0], [70, 0]]);
  await page.locator("[data-tool=draw]").click();
  await page.locator("[data-tool=undo]").click();
  await page.locator("[data-tool=redo]").click();
  await sleep(600);
  await shot("06-kartu3");
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
    if (stage === 1) await shot("07-daftar-bab");
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
    if (stage === 1) await shot("08-intro-level-gelap");
    if (stage === 3) await shot("08b-intro-level3-gelap");
    // Momo's story runs in beats (timer-driven typing). In camera mode the first line came ~6 s later than in the
    // fallback reference run (run12), so the thumb gets up to 150 s; a timeout logs where the story stopped.
    const thumbUp = await page.locator("[data-testid=intro-continue] >> visible=true").first().waitFor({ state: "visible", timeout: 150000 }).then(() => true, () => false);
    if (!thumbUp) {
      const where = await page.evaluate(() => ({ phase: document.querySelector("[data-testid=level-intro]")?.getAttribute("data-phase"), bubble: document.querySelector("[data-testid=intro-chat] .momo-bubble")?.textContent?.trim() ?? null }));
      await shot("08x-intro-tanpa-jempol");
      throw new Error(`L${stage}: intro thumb never appeared after 150 s: ${JSON.stringify(where)}`);
    }
    await holdThumb(page, "intro-continue", { timeout: 15000 });
    log(`L${stage}: intro thumb held, the book rises`);
    await intro.waitFor({ state: "detached", timeout: 15000 });
  }
  await page.locator("[data-testid=draw-canvas]").waitFor({ state: "attached", timeout: 15000 });
  // The focus phase opens after Momo's typed lines (timer-driven). In run2 it came ~90 s after the intro thumb in
  // camera mode (the reference run: ~20 s), so the wait is 180 s; a miss is a failure, not a skipped step.
  const start = page.locator("[data-testid=btn-focus-start]");
  const focusUp = await start.waitFor({ state: "visible", timeout: 180000 }).then(() => true, () => false);
  if (!focusUp) {
    await shot("09x-kanvas-tanpa-mulai");
    throw new Error(`L${stage}: "Mulai Menggambar" ring never appeared in 180 s`);
  }
  {
    await sleep(1200);
    if (stage === 1) await shot("09-kanvas-fase-fokus");
    await holdThumb(page, "btn-focus-start", { timeout: 15000 });
    await page.locator("[data-testid=drawing-focus-backdrop]").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    log(`L${stage}: "Mulai Menggambar" held, canvas open`);
  }
  await page.locator("[data-testid=draw-canvas]").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForURL(u => u.pathname === `/canvas${stage}`, { timeout: 15000 }).catch(() => {});
  const route = new URL(page.url()).pathname;
  log(`L${stage}: route`, route);
  if (route !== `/canvas${stage}`) throw new Error(`L${stage}: expected route /canvas${stage}, got ${route}`);
}

/** Placement confirm in camera mode is the "Taruh di sini" ring (ring-place), not the fallback button. */
async function confirmPlacementCam() {
  const ready = await page.waitForFunction(() => {
    const e = document.querySelector("[data-testid=ring-place]");
    return !!e && e.getAttribute("aria-disabled") !== "true";
  }, null, { timeout: 8000 }).then(() => true, () => false);
  if (!ready) throw new Error("ring-place (Taruh di sini) stayed disabled: placement not legal");
  await holdThumb(page, "ring-place", { timeout: 15000 });
  await page.waitForFunction(() => { const c = document.querySelector("[data-testid=game-canvas]"); return c?.dataset.phase === "gameplay" && Number(c.dataset.committedCount) >= 1; }, null, { timeout: 8000 });
}

/**
 * Recovery screen (REVISI §20): Thinman walks off the first gap on purpose. The fail overlay must offer three finger
 * rings; the first (Coba lagi) is held to retry. Returns false when the walk does not fall (screen not reached).
 */
async function recoveryFall() {
  await walkRightUntilOutcome(6000);
  const after = await readGame(page);
  if (!after.outcome) { log("recovery: walk right did not fall, fail screen not reached", { phase: after.phase }); return false; }
  if (after.outcome === "success") throw new Error("recovery probe: walking right WON the level, the fail screen was not reached");
  await page.locator("[data-testid=outcome-overlay]").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("[data-testid=btn-retry-cycle]").waitFor({ state: "visible", timeout: 8000 });
  await sleep(1200);
  await shot("15-layar-gagal");
  const rings = await page.locator(".world-fail .gesture-ring").evaluateAll(xs => xs.map(x => ({ testId: x.dataset.testid, label: x.getAttribute("aria-label"), mode: x.dataset.mode })));
  log("recovery: fail-screen rings", { outcome: after.outcome, failReason: after.failReason, rings });
  if (rings.length !== 3) finding("recovery-ring-count", { expected: 3, got: rings.length });
  await holdThumb(page, "btn-retry-cycle", { timeout: 15000 });
  await page.locator("[data-testid=outcome-overlay]").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  log("recovery: 'Coba lagi' (1 finger) held, fail screen closed");
  return true;
}

const inkOnCanvas = () => page.evaluate(() => {
  const c = document.querySelector("[data-testid=draw-canvas]");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return n;
});

/** The canvas takes ink only when the drawing screen is live: no intro cover, no focus backdrop, pointer on. */
async function canvasReady(stage) {
  const ok = await page.waitForFunction(() => {
    const sec = document.querySelector("#screen-drawing");
    const host = document.querySelector(".drawing-flow-host");
    const cv = document.querySelector("[data-testid=draw-canvas]");
    return !!sec && sec.getAttribute("data-drawing-active") === "true" && host?.getAttribute("data-intro") !== "true"
      && !document.querySelector("[data-testid=drawing-focus-backdrop]") && !!cv && getComputedStyle(cv).pointerEvents === "auto";
  }, null, { timeout: 60000 }).then(() => true, () => false);
  const diag = await page.evaluate(() => ({
    active: document.querySelector("#screen-drawing")?.getAttribute("data-drawing-active") ?? null,
    intro: document.querySelector(".drawing-flow-host")?.getAttribute("data-intro") ?? null,
    backdrop: !!document.querySelector("[data-testid=drawing-focus-backdrop]"),
    canvasPointerEvents: document.querySelector("[data-testid=draw-canvas]") ? getComputedStyle(document.querySelector("[data-testid=draw-canvas]")).pointerEvents : null,
  }));
  log(`L${stage}: canvas ready=${ok}`, diag);
  return diag;
}

/** Mouse scribble on the level canvas (camera mode, no hand): retried until ink lands, else a finding and a stop. */
async function scribbleChecked(stage) {
  for (let t = 1; t <= 3; t++) {
    const before = await inkOnCanvas();
    await drawScribble(page, "block");
    const after = await inkOnCanvas();
    log(`L${stage}: mouse scribble try ${t}, ink ${before} -> ${after}`);
    if (after > before) return after;
    await sleep(1500);
  }
  const hit = await page.evaluate(() => {
    const r = document.querySelector("[data-testid=draw-canvas]").getBoundingClientRect();
    const e = document.elementFromPoint(r.x + r.width * 0.4, r.y + r.height * 0.5);
    return e ? `${e.tagName}.${String(e.className).slice(0, 80)}` : null;
  });
  finding("level-canvas-mouse-no-ink", { stage, hitAtCanvasCentre: hit });
  throw new Error(`L${stage}: mouse strokes left no ink on the level canvas in camera mode`);
}

async function level(stage) {
  log(`=== LEVEL ${stage} ===`);
  await enterLevel(stage);
  const plan = plans[String(stage)];
  for (const [ci, cycle] of plan.cycles.entries()) {
    if (ci === 0) {
      await canvasReady(stage);
      await scribbleChecked(stage);
      if (stage === 1) await shot("10-kanvas-menggambar");
    } else {
      await press(page, "btn-draw-again");
      await drawScribble(page, ci % 2 ? "spike" : "block");
    }
    const submitVia = ci % 2 ? "button" : "finish";
    const { decision } = await submitAndDecide(page, {
      prefer: cycle.label, submitVia, log: m => log(`L${stage}c${ci + 1}: ${m}`), shotFn: n => shot(`11-${n}`),
    });
    log(`L${stage}c${ci + 1}: decision`, decision);
    await page.locator("[data-testid=sticker-stamp]").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    if (stage === 1 && ci === 0) await shot("12-stiker");
    await press(page, "btn-throw-sticker");
    await page.waitForFunction(() => document.querySelector("[data-testid=game-canvas]")?.dataset.phase === "placing", null, { timeout: 15000 });
    if (stage === 1 && ci === 0) await shot("13-penempatan");
    const placed = await placeByDrag(page, cycle.x + plans.objectSize.w / 2, cycle.y + plans.objectSize.h / 2, { create: false });
    log(`L${stage}c${ci + 1}: placed`, { objectX: +placed.after.objectX.toFixed(1), objectY: +placed.after.objectY.toFixed(1) });
    await confirmPlacementCam();
    await sleep(800);
    if (stage === 1 && ci === 0) {
      await shot("14-gameplay");
      await shotEl("[data-testid=gameplay-controls]", "14b-bilah-kontrol-bawah");
      await shotEl("[data-testid=steer-dial]", "14c-speedometer");
      await recoveryFall().catch(e => { finding("recovery-error", String(e)); });
      await sleep(800);
    }
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
  await shot("16-portal");
  await holdThumb(page, "ending-understood", { timeout: 60000 });
  await page.locator("[data-testid=ending-recap]").waitFor({ state: "visible", timeout: 30000 });
  await sleep(800);
  await shot("17-rekap");
  await holdThumb(page, "ending-recap-next", { timeout: 30000 });
  await press(page, "ending-back-to-cover", { timeout: 30000 });
  await page.locator("[data-testid=cover-wake], [data-testid=btn-camera-toggle-switch], [data-testid=cover-wave-hint]").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  await sleep(2500);
  await shot("18-layar-akhir");
  log("ending: back on the cover");
}

try {
  log("run-start", { git: gitInfo(), input: "camera mode (fake camera device), rings held with silent pointer press, wave ring held silently, Mouse toggle NOT clicked", viewport: DESKTOP });
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
  shotLog.push({ name: "99-gagal-terakhir", probe: await page.evaluate(PROBE).catch(e2 => ({ error: String(e2) })) });
}

const criticalErrors = errors.filter(e => !/favicon|Download the React DevTools/i.test(e.text));
await context.close();
await browser.close();
server.close();
writeJson(path.join(OUT, "timings.json"), { timings, gameplayAttempts });
writeJson(path.join(OUT, "run.json"), { result, failure, git: gitInfo(), findings, shots: shotLog, consoleAndPageErrors: criticalErrors, steps });
console.log(`RESULT ${result}  shots=${shotLog.length}  findings=${findings.length}  consoleErrors=${criticalErrors.length}  out=${OUT}`);
process.exit(result === "PASS" ? 0 : 1);

#!/usr/bin/env node
/**
 * Audio browser E2E (M-047). Drives the statically exported app (built with NEXT_PUBLIC_DEV_TOOLS=1 so `window.__audioDiag`
 * exists) in headless Chromium with trusted mouse/keyboard input only, and asserts on the audio engine's own diagnostics:
 * autoplay unlock, scene -> music mapping, no duplicate BGM, event counts per real action, mute/hidden-tab behaviour,
 * asset-failure resilience, rapid scene stress, zero console errors.
 *
 *   OUT_DIR=/path/to/out node e2e/audio/audio-e2e.mjs        (writes e2e/audio/logs/audio-e2e-report.json)
 *
 * Evidence class: BROWSER_E2E on a headless null audio sink. It proves the engine scheduled the right sounds at the right
 * moments; it does NOT prove how anything sounds (listening is NOT_TESTED), nor webcam/headphone/school-device behaviour.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, startStaticServer, sleep } from "../lib/harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.resolve(HERE, "../../out");
const REPORT = process.env.REPORT ?? path.join(HERE, "logs", "audio-e2e-report.json");
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
const T = (id) => `[data-testid="${id}"]`;
const checks = [];
const check = (name, ok, detail = null) => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== null ? " " + JSON.stringify(detail) : ""}`);
};

const { server, base } = await startStaticServer(OUT_DIR, 0);

async function newSession(opts = {}) {
  const s = await launch({ viewport: { width: 1280, height: 720 } });
  await s.page.addInitScript(() => {
    window.__alog = [];
    window.__maxSlots = 0;
    const iv = setInterval(() => {
      const a = window.__audioDiag;
      if (a && !window.__alogHooked) {
        window.__alogHooked = true;
        a.subscribeDiag((e) => window.__alog.push(e));
      }
      if (a) window.__maxSlots = Math.max(window.__maxSlots, a.snapshot().music.slots);
    }, 25);
    window.addEventListener("pagehide", () => clearInterval(iv));
  });
  s.failedResponses = [];
  s.page.on("response", (r) => { if (r.status() >= 400) s.failedResponses.push(`${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`); });
  if (opts.block) await s.page.route(opts.block, (r) => r.fulfill({ status: 404, body: "blocked" }));
  return s;
}
const snap = (page) => page.evaluate(() => window.__audioDiag?.snapshot() ?? null);
const log = (page) => page.evaluate(() => window.__alog.slice());
const count = (entries, kind, id) => entries.filter((e) => e.kind === kind && e.id === id).length;
async function waitFor(page, fn, to = 15000, arg) {
  const end = Date.now() + to;
  while (Date.now() < end) {
    if (await page.evaluate(fn, arg).catch(() => false)) return true;
    await sleep(100);
  }
  return false;
}
const hold = async (page, x, y, ms) => {
  await page.mouse.move(x, y); await sleep(120); await page.mouse.down(); await sleep(ms); await page.mouse.up(); await sleep(150);
};
const wait = (page, sel, to = 30000) => page.locator(sel).first().waitFor({ state: "visible", timeout: to });
const centre = async (page, sel) => { const b = await page.locator(sel).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };

const real = (list, fr) => (fr.every((r) => /\/api\/settings\/skip-button$/.test(r)) ? list.filter((e) => !/Failed to load resource/.test(e.text)) : list);
/* ---------------------------------------------------------------- 1. autoplay, mute, hidden tab, spam (dream loader) */
{
  const { page, errors, browser, failedResponses } = await newSession();
  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await wait(page, T("r83-entry-name-input"), 40000);
  const pre = await snap(page);
  check("before any gesture: no AudioContext, state idle", pre && pre.state === "idle" && pre.sampleRate === null, pre && { state: pre.state, sr: pre.sampleRate });
  await page.evaluate(() => window.__audioDiag.emit("ui.tap"));
  const pre2 = await snap(page);
  check("sound requested before unlock is dropped as locked (never queued)", (pre2.dropped.locked ?? 0) >= 1, pre2.dropped);

  await page.locator(T("r83-entry-name-input")).click();
  await page.keyboard.type("Uji Audio", { delay: 30 });
  check("typing the nickname (a real gesture) unlocks audio", await waitFor(page, () => window.__audioDiag.state() === "running", 5000), (await snap(page)).state);
  check("dream scene music starts (bgm.dream)", await waitFor(page, () => window.__audioDiag.snapshot().music.track === "bgm.dream", 15000), (await snap(page)).music);
  check("dream ambience starts", await waitFor(page, () => window.__audioDiag.snapshot().ambience.track === "amb.dream_wind", 15000));

  // mute: nothing new plays, drops are counted as muted
  const before = (await snap(page)).counters.played ?? 0;
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__audioDiag.setPrefs({ muted: true }));
  await page.evaluate(() => { for (let i = 0; i < 5; i++) window.__audioDiag.emit("momo.hop"); });
  const m = await snap(page);
  check("muted: no voice starts, drops counted as muted", (m.counters.played ?? 0) === before && (m.dropped.muted ?? 0) >= 5, { played: m.counters.played, muted: m.dropped.muted });
  await page.evaluate(() => window.__audioDiag.setPrefs({ muted: false }));
  const prefsKept = await page.evaluate(() => JSON.parse(localStorage.getItem("sketchbook.audio.prefs.v1") ?? "null"));
  check("preferences persisted locally", prefsKept && prefsKept.muted === false, prefsKept);

  // cooldown: 40 rapid taps do not make 40 sounds
  await sleep(300);
  const p0 = (await snap(page)).counters.played ?? 0;
  await page.evaluate(() => { for (let i = 0; i < 40; i++) window.__audioDiag.emit("ui.tap"); });
  const p1 = (await snap(page)).counters.played ?? 0;
  check("40 rapid ui.tap -> at most 2 sounds (cooldown)", p1 - p0 <= 2, { played: p1 - p0 });

  // hidden tab
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
  const hid = await snap(page);
  check("hidden tab: engine reports suspended", hid.state === "suspended", hid.state);
  await page.evaluate(() => window.__audioDiag.emit("momo.hop"));
  check("sounds requested while hidden are dropped", ((await snap(page)).dropped.hidden ?? 0) >= 1);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
  check("tab visible again: audio running", await waitFor(page, () => window.__audioDiag.state() === "running", 5000));
  // the static export has no /api/settings/skip-button (pre-existing 404 on the baseline too): ignore exactly that one
  check("no console/page errors in dream/controls part", real(errors, failedResponses).length === 0, { errors: errors.slice(0, 3), failedResponses });
  await browser.close();
}

/* ---------------------------------------------------------------- 2. full journey */
const seen = { scenes: [], tracks: [] };
{
  const jr = await newSession();
  const { page, errors, browser } = jr;
  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await wait(page, T("r83-entry-name-input"), 40000);
  const sceneNow = async () => (await snap(page)).music;
  const expectTrack = async (label, scene, track) => {
    const ok = await waitFor(page, ([t]) => window.__audioDiag.snapshot().music.track === t, 20000, [track]);
    const m = await sceneNow();
    seen.scenes.push({ label, scene: m.scene, track: m.track });
    check(`${label}: scene ${scene}, music ${track}`, ok && m.scene === scene, m);
  };
  await page.locator(T("r83-entry-name-input")).fill("Uji Audio");
  await page.locator(T("r83-entry-submit")).click();
  await page.locator(T("dream-loader")).waitFor({ state: "detached", timeout: 60000 });
  await wait(page, T("r83-cover-screen")); await wait(page, T("r83-gate-go"));
  await expectTrack("cover", "cover", "bgm.cover");
  await page.locator(T("r83-gate-checkbox")).click(); await page.locator(T("r83-gate-go")).click(); await sleep(400);
  await wait(page, T("r83-camera-toggle")); await page.locator(T("r83-camera-toggle")).click();
  await wait(page, T("r83-camera-fallback-btn")); await page.locator(T("r83-camera-fallback-btn")).click();
  await wait(page, T("r83-ayo-ring"), 60000); await sleep(500);
  let [x, y] = await centre(page, T("r83-ayo-ring")); await hold(page, x, y, 1300);
  await wait(page, T("r83-tutorial-screen"), 40000); await wait(page, T("r83-tut-walk"), 40000);
  await expectTrack("tutorial", "tutorial", "bgm.tutorial");
  for (let i = 0; i < 40; i++) { await page.keyboard.press("ArrowRight"); await sleep(30); }
  await wait(page, '[data-testid="r83-tut-thumb"]:not(.tut-thumb--locked)', 40000); await sleep(400); await hold(page, 640, 360, 1400);
  await wait(page, T("r83-tut-safety"), 30000); await wait(page, '.tut-card[data-i="1"] [data-testid="r83-tut-thumb"]:not(.tut-thumb--locked)', 40000); await sleep(400); await hold(page, 640, 360, 1400);
  await wait(page, T("r83-tut-canvas"), 30000); await sleep(400);
  const c = await page.locator(T("r83-tut-canvas")).boundingBox(); const yy = c.y + Math.min(120, c.height * 0.45);
  await page.mouse.move(c.x + 80, yy); await sleep(60); await page.mouse.down(); await page.mouse.move(c.x + 220, yy, { steps: 6 }); await page.mouse.up(); await sleep(200);
  [x, y] = await centre(page, T("r83-tool-eraser")); await hold(page, x, y, 1300);
  await page.mouse.move(c.x + 130, yy); await sleep(60); await page.mouse.down(); await page.mouse.move(c.x + 170, yy, { steps: 4 }); await page.mouse.up(); await sleep(200);
  await page.keyboard.press("z"); await page.keyboard.press("x"); await sleep(200);
  [x, y] = await centre(page, T("r83-tool-clear")); await hold(page, x, y, 1300);
  await wait(page, '.tut-card[data-i="2"] [data-testid="r83-tut-thumb"]:not(.tut-thumb--locked)', 40000); await sleep(400); await hold(page, 640, 360, 1400);
  await wait(page, T("r83-level-select-screen"), 30000); await sleep(1400);
  await expectTrack("level select", "levels", "bgm.levels");
  await page.locator(T("r83-level-card-1")).click(); await wait(page, T("r83-world-intro"), 20000); await sleep(1500);
  await expectTrack("story intro", "story", "bgm.story");
  await wait(page, T("r83-intro-understand"), 45000); await sleep(400); await hold(page, 640, 360, 1400);
  await wait(page, T("r83-canvas-screen"), 30000); await sleep(800);
  await expectTrack("canvas", "canvas", "bgm.focus");
  await sleep(2000);
  const b = await page.locator(T("r83-draw-canvas")).boundingBox();
  const X = (u) => b.x + b.width * (0.2 + 0.6 * u), Y = (v) => b.y + b.height * (0.1 + 0.8 * v);
  // same stroke pattern as the perf flow (down, ten moves, up); the first strokes can be swallowed while the screen settles
  let loops = 0;
  for (let k = 0; k < 8 && loops < 1; k++) {
    const a = k % 6;
    await page.mouse.move(X(0.1 + 0.1 * a), Y(0.1)); await page.mouse.down();
    for (let s = 1; s <= 10; s++) {
      await page.mouse.move(X(0.1 + 0.1 * a + 0.03 * s), Y(0.1 + 0.08 * s), { steps: 2 });
      if (s === 7) { await sleep(120); loops = Math.max(loops, (await snap(page)).activeLoops); }
    }
    if (loops < 1) { await page.mouse.up(); await sleep(150); }
  }
  if (process.env.SHOT_DIR) { fs.mkdirSync(process.env.SHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.SHOT_DIR, "canvas_during_draw.png") }); }
  check("valid drawing: pencil loop active while drawing", loops >= 1, { loops });
  await page.mouse.up(); await sleep(600);
  check("pencil loop stops after the stroke", (await snap(page)).activeLoops === 0);
  await wait(page, T("r83-guess-ring"), 20000); await sleep(400);
  [x, y] = await centre(page, T("r83-guess-ring")); await hold(page, x, y, 2450);
  await wait(page, T("r83-guess-panel"), 30000); await sleep(1500);
  const mid = await sceneNow();
  check("prediction/HITL keeps the same focus track (no restart, no tension change)", mid.track === "bgm.focus" && mid.scene === "canvas", mid);
  await wait(page, T("r83-guess-accept"), 15000); await sleep(500);
  [x, y] = await centre(page, T("r83-guess-accept")); await hold(page, x, y, 2400);
  await wait(page, T("r83-sticker"), 20000); await sleep(800); await wait(page, T("r83-sticker-throw"), 15000); await sleep(500);
  [x, y] = await centre(page, T("r83-sticker-throw")); await hold(page, x, y, 2100);
  await wait(page, T("r83-world-screen"), 25000);
  await expectTrack("world level 1", "world1", "bgm.l1");
  await sleep(2500);

  const entries = await log(page);
  const s = await snap(page);
  const maxSlots = await page.evaluate(() => window.__maxSlots);
  const emits = (id) => count(entries, "emit", id);
  check("never more than 2 music tracks at once (no duplicate BGM)", maxSlots <= 2, { maxSlots });
  check("no unknown events / missing assets / load failures", !(s.dropped["unknown-event"] || s.dropped["missing-asset"] || s.dropped["load-failed"]), s.dropped);
  check("no failed asset loads", s.failedLoads.length === 0, s.failedLoads);
  check("one hitl.submit, one hitl.reveal, one hitl.decide for one decision", emits("hitl.submit") === 1 && emits("hitl.reveal") === 1 && emits("hitl.decide") === 1, { submit: emits("hitl.submit"), reveal: emits("hitl.reveal"), decide: emits("hitl.decide") });
  check("sticker pop and throw once each", emits("sticker.pop") === 1 && emits("sticker.throw") === 1, { pop: emits("sticker.pop"), throw: emits("sticker.throw") });
  check("ring commits sounded (nui.commit) for the holds performed", emits("nui.commit") >= 6, emits("nui.commit"));
  check("world.fall then world.land for the thrown object", emits("world.fall") >= 1 && emits("world.land") >= 1, { fall: emits("world.fall"), land: emits("world.land") });
  check("level intro jingle once", emits("jingle.level_intro") === 1, emits("jingle.level_intro"));
  check("memory: decoded buffers stay modest", s.bufferMemoryMB < 120, { MB: s.bufferMemoryMB });
  const top = {};
  for (const e of entries) if (e.kind === "emit") top[e.id] = (top[e.id] ?? 0) + 1;
  seen.emits = top; seen.snapshot = s; seen.maxSlots = maxSlots;
  check("no console/page errors during the journey", real(errors, jr.failedResponses).length === 0, { errors: errors.slice(0, 5), failedResponses: jr.failedResponses });
  await browser.close();
}

/* ---------------------------------------------------------------- 3. asset failure */
{
  const { page, errors, browser } = await newSession({ block: /\/audio\/(sfx\/ui_tap_|music\/bgm_cover)/ });
  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await wait(page, T("r83-entry-name-input"), 40000);
  await page.locator(T("r83-entry-name-input")).fill("Uji Gagal");
  await page.locator(T("r83-entry-submit")).click();
  await page.locator(T("dream-loader")).waitFor({ state: "detached", timeout: 60000 });
  await wait(page, T("r83-cover-screen"));
  await sleep(3000);
  const s = await snap(page);
  check("blocked music file: failure recorded, game still on the cover", s.failedLoads.some((f) => f.id === "bgm.cover") && (await page.locator(T("r83-cover-screen")).count()) === 1, s.failedLoads);
  check("failed loads are bounded (<= 3 attempts)", s.failedLoads.every((f) => f.attempts <= 3), s.failedLoads);
  const pageErrors = errors.filter((e) => e.type === "pageerror");
  check("asset failure raises no uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 3));
  await browser.close();
}

/* ---------------------------------------------------------------- 4. rapid scene stress (Audio Lab) */
{
  const { page, errors, browser } = await newSession();
  await page.goto(base + "/dev/audio", { waitUntil: "domcontentloaded" });
  await wait(page, T("audio-lab"), 30000);
  await page.locator(T("lab-scene-cover")).click();
  await waitFor(page, () => window.__audioDiag?.state() === "running", 5000);
  for (let r = 0; r < 3; r++) { await page.locator(T("lab-stress")).click(); await sleep(400); }
  await sleep(4500);
  const s = await snap(page);
  const maxSlots = await page.evaluate(() => window.__maxSlots);
  check("rapid scene stress: exactly one music track audible afterwards", s.music.slots <= 2 && s.music.track !== null, s.music);
  check("rapid scene stress: never more than 3 track slots (live + one fading + one being cut)", maxSlots <= 3, { maxSlots });
  await page.locator(T("lab-spam")).click();
  check("lab spam test did not throw", errors.length === 0, errors.slice(0, 3));
  await browser.close();
}

server.close();
const failed = checks.filter((c) => !c.ok);
fs.writeFileSync(REPORT, JSON.stringify({ when: new Date().toISOString(), outDir: OUT_DIR, evidence: "BROWSER_E2E headless null sink; listening NOT_TESTED", total: checks.length, failed: failed.length, checks, seen }, null, 1));
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed; report ${REPORT}`);
process.exit(failed.length ? 1 : 0);

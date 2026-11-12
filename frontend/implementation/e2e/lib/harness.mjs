// Shared E2E harness: static server for the Next export, browser/video launch,
// and student-journey helpers that use ONLY trusted browser input (mouse/keyboard).
// Telemetry helpers are read-only observers of canvas data-* attributes; nothing here
// invokes controller/store APIs or window.__skb* hooks.
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export { sleep };
export const sha256 = p => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".wasm": "application/wasm", ".task": "application/octet-stream", ".txt": "text/plain", ".ico": "image/x-icon", ".woff2": "font/woff2", ".mjs": "text/javascript" };

export function gitInfo() {
  const g = (...a) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return null; } };
  return { head: g("rev-parse", "HEAD"), branch: g("rev-parse", "--abbrev-ref", "HEAD"), dirty: (g("status", "--porcelain", "--", ".") || "").length > 0 };
}

export function startStaticServer(dir = path.join(ROOT, "out"), port = 0) {
  if (!fs.existsSync(path.join(dir, "index.html"))) throw new Error(`no static export at ${dir}; run npm run build first`);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const candidates = [p, p + ".html", path.join(p, "index.html")];
    for (const c of candidates) {
      const f = path.join(dir, c);
      if (f.startsWith(dir) && fs.existsSync(f) && fs.statSync(f).isFile()) {
        res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
        return fs.createReadStream(f).pipe(res);
      }
    }
    res.writeHead(404); res.end("not found");
  });
  return new Promise(resolve => server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port, base: `http://127.0.0.1:${server.address().port}` })));
}

export async function launch({ videoDir, viewport = { width: 1280, height: 720 }, deviceScaleFactor = 1, extraArgs = [], permissions } = {}) {
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ["--no-sandbox", ...extraArgs] });
  const context = await browser.newContext({ viewport, deviceScaleFactor, ...(permissions ? { permissions } : {}), ...(videoDir ? { recordVideo: { dir: videoDir, size: viewport } } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push({ type: "console", text: m.text() }); });
  page.on("pageerror", e => errors.push({ type: "pageerror", text: String(e) }));
  page.__consoleLog = [];
  page.on("console", m => page.__consoleLog.push(`${m.type()}: ${m.text()}`.slice(0, 300)));
  return { browser, context, page, errors };
}

/** Read-only telemetry snapshot from the integrated game canvas data-* attributes. */
/** Optional screenshot sink for the showcase: enableSnaps(page, dir) once per run; snap(name) writes dir/name.png
 *  the first time a name is seen (later passes keep the first picture). No-op when not enabled. */
let snapPage = null, snapDir = null;
export function enableSnaps(page, dir) { snapPage = page; snapDir = dir; fs.mkdirSync(dir, { recursive: true }); }
const snapped = new Set();
export async function snap(name) {
  if (!snapPage || !snapDir || snapped.has(name)) return;
  snapped.add(name);
  await snapPage.screenshot({ path: path.join(snapDir, `${name}.png`) }).catch(() => {});
}

export const readGame = page => page.evaluate(() => {
  const c = document.querySelector("[data-testid=game-canvas]");
  if (!c) return null;
  const d = c.dataset;
  return { phase: d.phase, x: Number(d.playerX), y: Number(d.playerY), vy: Number(d.playerVelocityY || 0), grounded: d.grounded === "true", settled: d.settled === "true", outcome: d.outcome ?? null, failReason: d.failReason ?? null, objectX: Number(d.objectX), objectY: Number(d.objectY), objectW: Number(d.objectWidth), objectH: Number(d.objectHeight), committed: Number(d.committedCount) };
});

/** Install a passive requestAnimationFrame sampler. Observes only; never writes. */
export const installFrameRecorder = page => page.evaluate(() => {
  if (window.__rec) return;
  const rec = { frames: [], on: true, t0: performance.now() };
  window.__rec = rec;
  const tick = () => {
    if (!rec.on) return;
    const c = document.querySelector("[data-testid=game-canvas]");
    if (c && c.dataset.phase === "gameplay") {
      const d = c.dataset;
      rec.frames.push([+(performance.now() - rec.t0).toFixed(1), +Number(d.playerX).toFixed(2), +Number(d.playerY).toFixed(2), d.grounded === "true" ? 1 : 0, d.outcome ?? ""]);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
export const takeFrames = page => page.evaluate(() => { const f = window.__rec?.frames ?? []; if (window.__rec) window.__rec.frames = []; return f; });

/** PRD 0.0.16 R4: hold a thumbs-up on the ThumbConfirm `testId` until it confirms.
 *  Camera mode: simulated thumb via the test hook (NEXT_PUBLIC_TEST_HOOKS=1 build).
 *  Fallback mode: trusted mouse hold on the visible thumb button. */
/** Keep holding until the ring confirms (it leaves, pulses, or resets after full): headless frames can be slow. */
async function waitRingDone(el, holdMs) {
  const end = Date.now() + holdMs * 6 + 2000;
  await sleep(holdMs);
  let last = null;
  while (Date.now() < end) {
    last = await el.evaluate(n => ({ p: Number(n.getAttribute("data-progress")), c: n.classList.contains("is-confirmed") }), undefined, { timeout: 400 }).catch(() => null);
    if (!last || last.c || last.p >= 100) break;
    await sleep(80);
  }
  await sleep(150);
  // true = the ring confirmed (or left the screen with its step); false = still filling when we gave up.
  return !last || last.c || last.p >= 100;
}

export async function holdThumb(page, testId, { timeout = 15000, tries = 3 } = {}) {
  const el = page.locator(`[data-testid="${testId}"] >> visible=true`);
  await el.waitFor({ state: "visible", timeout });
  const mode = await el.getAttribute("data-mode");
  const holdMs = Number(await el.getAttribute("data-hold-ms")) || 2000;
  if (mode === null) { await el.click(); return { mode: "tap", holdMs: 0 }; } // a plain tap control (DecisionPanel confirm="tap")
  for (let attempt = 1; attempt <= tries; attempt++) {
    let confirmed;
    if (mode === "fallback") {
      await sleep(300); // let the ring settle (chat layout can still move it)
      const b = await el.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + Math.min(36, b.height / 3));
      await page.mouse.down();
      confirmed = await waitRingDone(el, holdMs);
      await page.mouse.up();
    } else {
      const hasHook = await page.evaluate(() => typeof window.__skbThumb === "function");
      if (!hasHook) throw new Error("camera-mode ThumbConfirm needs a NEXT_PUBLIC_TEST_HOOKS=1 build (window.__skbThumb)");
      await page.evaluate(() => window.__skbThumb(true));
      confirmed = await waitRingDone(el, holdMs);
      await page.evaluate(() => window.__skbThumb(null));
    }
    // The ring's own fill is the proof: a full ring fires once. A toggle that stays on screen (btn-override) is not re-held.
    if (confirmed) return { mode, holdMs, attempt };
  }
  return { mode, holdMs, attempt: tries, stillVisible: true };
}

/** PinchRing (tutorial cards): hold the pinch ring `testId` for `ms` (default: its data-hold-ms).
 *  Fallback mode: trusted mouse press in the middle of the ring, released after it confirms.
 *  Camera mode: simulated pinch through window.__skbPinch (NEXT_PUBLIC_TEST_HOOKS=1 build). */
export async function holdPinch(page, testId, ms, { timeout = 15000 } = {}) {
  const el = page.locator(`[data-testid="${testId}"]`);
  await el.waitFor({ state: "visible", timeout });
  const holdMs = ms ?? (Number(await el.getAttribute("data-hold-ms")) || 1000);
  const mode = await el.getAttribute("data-mode");
  let confirmed;
  if (mode === "fallback") {
    await sleep(300); // a press that starts with the ring already mounted must not carry over (latch)
    const b = await el.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    confirmed = await waitRingDone(el, holdMs);
    await page.mouse.up();
  } else {
    const hasHook = await page.evaluate(() => typeof window.__skbPinch === "function");
    if (!hasHook) throw new Error("camera-mode PinchRing needs a NEXT_PUBLIC_TEST_HOOKS=1 build (window.__skbPinch)");
    await page.evaluate(() => window.__skbPinch(true));
    confirmed = await waitRingDone(el, holdMs);
    await page.evaluate(() => window.__skbPinch(null));
  }
  if (!confirmed) throw new Error(`${testId}: pinch ring did not fill after ${holdMs} ms hold (mode ${mode})`);
  return { testId, mode, holdMs };
}

/** Press any control of the new flow: rings and thumbs (they carry data-hold-ms) are held until they fill; plain
 *  buttons (DwellButton: back to cover, draw again, undo...) are clicked. Trusted mouse only in fallback. */
export async function press(page, testId, { timeout = 15000 } = {}) {
  const el = page.locator(`[data-testid="${testId}"] >> visible=true`);
  await el.waitFor({ state: "visible", timeout });
  if ((await el.getAttribute("data-hold-ms")) !== null) return holdThumb(page, testId, { timeout });
  await el.click();
  return { testId, mode: "click" };
}

/** New draw flow (Owner rule 2026-11-09): Momo guesses only after the student holds a thumb on the finish ring
 *  (`btn-finish-drawing`, 2 s). Fallback (mouse): press it, keep it down until it confirms, release. The ring only
 *  shows once there is ink, so this is called after drawing. */
export async function holdFinishDrawing(page, { timeout = 15000 } = {}) {
  const el = page.locator("[data-testid=btn-finish-drawing]");
  await el.waitFor({ state: "visible", timeout });
  // A ring that appears under a held mouse is armed only after one released frame: let it mount and settle.
  await sleep(400);
  const r = await holdThumb(page, "btn-finish-drawing", { timeout });
  if (r.stillVisible) throw new Error("btn-finish-drawing: the finish thumb did not confirm after 3 holds");
  return r;
}

/** Top-3 decision by click (fallback) or dwell (camera): rank 1 = Terima (btn-accept), 2 and 3 = Pakai (btn-correct-N).
 *  A DwellButton is a real button, so a click commits at once; the decision locks the rest of the panel. */
export async function pickCandidate(page, rank, { timeout = 15000 } = {}) {
  // 2026-11-11 (T3): candidates are GestureRings, no quick click. Fallback = hold until the ring fills.
  const testId = rank === 1 ? "btn-accept" : `btn-correct-${rank}`;
  const btn = page.locator(`[data-testid=${testId}]`);
  await btn.waitFor({ state: "visible", timeout });
  const name = await btn.getAttribute("aria-label");
  await holdThumb(page, testId, { timeout });
  return name;
}

/** Override to a label outside the Top-3: open "Bukan ini, pilih lainnya", pick the label, press "Pakai <label>". */
export async function overrideTo(page, label, { timeout = 15000 } = {}) {
  await press(page, "btn-override", { timeout });
  await page.locator(`[data-testid="override-option-${label}"]`).waitFor({ state: "visible", timeout });
  await press(page, `override-option-${label}`, { timeout });
  await press(page, "override-confirm", { timeout });
}

/** PRD 0.0.16 R1: camera on, Momo sleeps; a (simulated) wave wakes her, she talks, the book opens to the ruler. */
export async function wakeMomoOnCover(page, base, log = () => {}) {
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 45000 });
  // The student turns the camera on. Camera works (fake device + test-hooks build): simulated wave.
  // No camera: R13 fallback button "Bangunkan Momo".
  const toggle = page.locator("[data-testid=btn-camera-toggle-switch]");
  await toggle.waitFor({ state: "visible", timeout: 30000 });
  await snap("01-cover-asleep");
  await toggle.click();
  log("cover: camera switch turned on");
  const how = await Promise.any([
    page.waitForFunction(() => typeof window.__skbWave === "function" && document.querySelector("video")?.srcObject, null, { timeout: 30000 }).then(() => "wave"),
    page.locator("[data-testid=cover-wake]").waitFor({ state: "visible", timeout: 30000 }).then(() => "button"),
  ]);
  await sleep(800);
  if (how === "wave") await page.evaluate(() => window.__skbWave());
  else await page.locator("[data-testid=cover-wake]").click();
  log(`cover: Momo woken (${how})`);
  // 2026-11-11 (R3): after her last line and a read pause, the 1 s thumb "Aku mengerti" opens the book by itself.
  await holdThumb(page, "cover-thumb", { timeout: 90000 });
  log("cover: thumb held, the book opens");
  await page.waitForURL(u => u.pathname === "/onboarding/number", { timeout: 30000 });
  log("cover: book opened to the ruler");
}

/** PRD 0.0.16 R3 / R5: Momo speaks alone first (ruler locked), then the student moves the ruler. The question
 *  "Benar ini nomor absenmu?" and the 2 s thumb appear only after a move and 0.6 s of rest, so at least one move is
 *  made (default: 2 steps right). Returns the number the thumb confirmed. */
export async function pickStudentNumber(page, { steps = 2, log = () => {} } = {}) {
  const ruler = page.getByRole("slider", { name: "Nomor absen" });
  await ruler.waitFor({ state: "visible", timeout: 20000 });
  await sleep(1200); // Momo's focus phase: dimmed page, big Momo, ruler locked
  await snap("penggaris-fase-fokus");
  await page.waitForFunction(() => document.querySelector("[role=slider][aria-label='Nomor absen']")?.getAttribute("tabindex") === "0", null, { timeout: 60000 });
  log("ruler: unlocked (Momo has moved to the corner)");
  await ruler.focus();
  const moves = steps > 0 ? Array(steps).fill("ArrowRight") : ["ArrowRight", "ArrowLeft"];
  for (const key of moves) { await page.keyboard.press(key); await sleep(120); }
  const value = await ruler.getAttribute("aria-valuenow");
  await holdThumb(page, "number-thumb", { timeout: 60000 });
  log(`ruler: number ${value} confirmed with thumb`);
  return Number(value);
}

/** Wait until the card's thumb is unlocked (its gate passed: Momo done, practice done, 10 s read). */
async function waitThumbUnlocked(page, testId, timeout = 90000) {
  await page.waitForFunction(id => { const el = document.querySelector(`[data-testid="${id}"]`); return !!el && el.getAttribute("data-locked") !== "true"; }, testId, { timeout });
}

/** Tutorial (R4): card 1 walk by mouse drag to the flag (>= 76%), thumb 1 s; card 2 read + thumb 1 s; card 3 the four
 *  tools on the practice canvas (draw, erase, undo, redo, each really changes the drawing), thumb 2 s. */
export async function playTutorial(page, log = () => {}, { slow = false } = {}) {
  const walk = page.locator("[data-testid=tutorial-walk]");
  await walk.waitFor({ state: "visible", timeout: 30000 });
  await sleep(1200); // the page-open animation and Momo's first line
  for (let tries = 0; tries < 8; tries++) {
    const wb = await walk.boundingBox();
    const y = wb.y + wb.height * 0.6;
    await page.mouse.move(wb.x + wb.width * 0.12, y);
    await page.mouse.down();
    await page.mouse.move(wb.x + wb.width * 0.92, y, { steps: slow ? 60 : 24 });
    await page.mouse.up();
    // The practice counts as done once the walk reached the flag: the locked thumb then says "Baca dulu, ya".
    if (await page.getByText("Baca dulu, ya").first().waitFor({ state: "visible", timeout: 2500 }).then(() => true, () => false)) break;
    log(`tutorial: walk try ${tries + 1} not at the flag yet`);
  }
  log("tutorial: Thinman walked to the flag");
  await snap("kartu1-cincin-terkunci");
  await waitThumbUnlocked(page, "tutorial-thumb-1");
  await holdThumb(page, "tutorial-thumb-1", { timeout: 15000 });
  log("tutorial: card 1 thumb (1 s) confirmed");

  await waitThumbUnlocked(page, "tutorial-thumb-2");
  await holdThumb(page, "tutorial-thumb-2", { timeout: 15000 });
  log("tutorial: card 2 thumb (1 s) confirmed");

  const canvas = page.locator("canvas.tut-draw__canvas");
  await canvas.waitFor({ state: "visible", timeout: 30000 });
  // Card 2 closes (1.0 s), a 1.1 s pause, then card 3 opens (0.95 s): draw only once its page is open and still.
  await page.locator(".tutorial-card-3.is-open").waitFor({ state: "attached", timeout: 30000 });
  await sleep(3000);
  const cb = await canvas.boundingBox();
  const cx = cb.x + cb.width / 2, cy = cb.y + cb.height / 2;
  const drag = async pts => {
    await page.mouse.move(cx + pts[0][0], cy + pts[0][1]);
    await page.mouse.down();
    for (const [dx, dy] of pts.slice(1)) await page.mouse.move(cx + dx, cy + dy, { steps: slow ? 18 : 6 });
    await page.mouse.up();
  };
  await drag([[-60, -20], [60, -20], [60, 25], [-60, 25]]); // draw (default tool)
  await page.locator("[data-tool=erase]").click();
  await drag([[-70, 0], [70, 0]]); // erase across the stroke
  await page.locator("[data-tool=draw]").click();
  await page.locator("[data-tool=undo]").click(); // undo the erase: the stroke is back
  await page.locator("[data-tool=redo]").click(); // redo the erase
  log("tutorial: card 3 tools draw, erase, undo, redo tried");
  await snap("kartu3-alat");
  await waitThumbUnlocked(page, "tutorial-thumb-3");
  await holdThumb(page, "tutorial-thumb-3", { timeout: 15000 });
  log("tutorial: card 3 thumb (2 s) confirmed, Mulai Level 1");
}

/** Full onboarding: wave, ruler thumb, whole tutorial. */
export async function onboardToLevels(page, base, log = () => {}) {
  await wakeMomoOnCover(page, base, log);
  await pickStudentNumber(page, { log });
  await playTutorial(page, log);
  await page.locator(".level-card").first().waitFor({ state: "visible", timeout: 30000 });
}

/** Journey variant: wake, ruler, and the whole tutorial (the skip button is gone since R4). */
export async function onboardToLevelsFast(page, base, log = () => {}) {
  await onboardToLevels(page, base, log);
}

/** Enter a level from the ribbon list.
 *  entry: "click" (pick the card, auto-pull; journey tests) or "thumb" (2 s level-thumb-N, R6).
 *  Story (L1): the thumb "intro-continue" (1 s) after Momo's last line; the book then rises through the clouds.
 *  Canvas (L6): the focus phase first; the "Mulai Menggambar" thumb (btn-focus-start) closes its backdrop. */
export async function enterLevel(page, stage, log = () => {}, { entry = "click" } = {}) {
  const alreadyIn = await page.locator("[data-testid=level-intro], [data-testid=draw-canvas]").first()
    .waitFor({ state: "attached", timeout: 2500 }).then(() => true, () => false);
  if (!alreadyIn) {
    const card = page.locator(".level-card").nth(stage - 1);
    await card.waitFor({ state: "visible", timeout: 20000 });
    await snap("pilih-bab");
    await page.waitForFunction(i => document.querySelectorAll(".level-card")[i]?.dataset.state !== "locked", stage - 1, { timeout: 8000 });
    if (entry === "thumb") { await holdThumb(page, `level-thumb-${stage}`, { timeout: 20000 }); log(`L${stage}: ribbon thumb held`); }
    else await card.click();
  } else log(`L${stage}: opened straight from the tutorial`);
  const introEl = page.locator("[data-testid=level-intro]");
  if (await introEl.waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false)) {
    log(`L${stage}: story intro visible`);
    await sleep(2500);
    await snap("intro-level-gelap");
    await holdThumb(page, "intro-continue", { timeout: 45000 });
    log(`L${stage}: intro thumb (1 s) held, Momo rises through the clouds`);
    await introEl.waitFor({ state: "detached", timeout: 15000 });
  }
  await page.locator("[data-testid=draw-canvas]").waitFor({ state: "attached", timeout: 15000 });
  // Focus phase on the canvas (L6): Momo reviews the four tools, then the "Mulai Menggambar" thumb opens the canvas.
  const start = page.locator("[data-testid=btn-focus-start]");
  if (await start.waitFor({ state: "visible", timeout: 90000 }).then(() => true, () => false)) {
    log(`L${stage}: canvas focus phase`);
    await sleep(1200);
    await snap("kanvas-fase-fokus");
    await holdThumb(page, "btn-focus-start", { timeout: 15000 });
    await page.locator("[data-testid=drawing-focus-backdrop]").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    log(`L${stage}: "Mulai Menggambar" held, canvas open`);
  }
  await page.locator("[data-testid=draw-canvas]").waitFor({ state: "visible", timeout: 15000 });
}

/** Slow, visible drawing (~durationMs) for the showcase: a block outline with a cross line, many small moves. */
export async function drawSlow(page, durationMs = 10000) {
  const canvas = page.locator("[data-testid=draw-canvas]");
  const box = await canvas.boundingBox();
  const cx = box.x + box.width * 0.4, cy = box.y + box.height * 0.5;
  const strokes = [[[-80, -25], [80, -25], [80, 30], [-80, 30], [-80, -25]], [[-50, 0], [0, 8], [50, 0]]];
  const segs = strokes.reduce((n, s) => n + s.length - 1, 0);
  const stepsPerSeg = 30;
  const pause = Math.max(4, Math.floor(durationMs / (segs * stepsPerSeg)));
  for (const s of strokes) {
    await page.mouse.move(cx + s[0][0], cy + s[0][1]);
    await page.mouse.down();
    for (let k = 1; k < s.length; k++) {
      const [ax, ay] = s[k - 1], [bx, by] = s[k];
      for (let i = 1; i <= stepsPerSeg; i++) {
        await page.mouse.move(cx + ax + (bx - ax) * i / stepsPerSeg, cy + ay + (by - ay) * i / stepsPerSeg);
        await sleep(pause);
      }
    }
    await page.mouse.up();
    await sleep(250); // short pause between strokes; a pause no longer submits anything (thumb or Tebak only)
  }
}

/** Student-like freehand scribble with trusted mouse events. `shape` varies strokes. */
export async function drawScribble(page, shape = "block") {
  // Camera mode draws by hand: use the simulated hand (test-hooks build) instead of the mouse.
  if (await page.evaluate(() => window.__skbTestHooks?.surface?.getMode?.() === "hand")) return drawHandOrMouseSlow(page, 1500);
  const canvas = page.locator("[data-testid=draw-canvas]");
  const box = await canvas.boundingBox();
  const cx = box.x + box.width * 0.4, cy = box.y + box.height * 0.5;
  const strokes = shape === "spike"
    ? [[[-70, 40], [-35, -60], [0, 40], [35, -60], [70, 40]]]
    : [[[-70, -20], [70, -20], [70, 30], [-70, 30], [-70, -20]], [[-40, 0], [0, 10], [40, 0]]];
  for (const s of strokes) {
    await page.mouse.move(cx + s[0][0], cy + s[0][1]);
    await page.mouse.down();
    for (const [dx, dy] of s.slice(1)) await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
    await page.mouse.up();
  }
}

/** mode: "auto" (Accept/Correct/Override as needed to reach `prefer`), "accept" (rank 1 whatever it is),
 *  "override" (reject Top-3 and pick the first of `prefer` list present in the override vocabulary). */
export async function submitAndDecide(page, { prefer = "balok", mode = "auto", log = () => {}, shot = null, inspect = null, submitVia = "finish" } = {}) {
  // 2026-11-09 rule: Momo stays quiet while the student draws. Nothing is submitted by a pause any more.
  const heading = page.getByRole("heading", { name: /tebakan momo/i });
  if (!(await heading.isVisible().catch(() => false))) {
    await sleep(1500); // longer than the old 1 s auto-ask pause: a guess here means the auto-ask came back
    if (await heading.isVisible().catch(() => false)) throw new Error("Momo guessed while the student was still drawing (auto-ask is back)");
    // The student says "selesai": the finish thumb (default), or the Tebak Gambarku button (submitVia "button").
    if (submitVia === "button") await page.locator("[data-testid=btn-submit-drawing]").click();
    else await holdFinishDrawing(page);
  }
  await heading.waitFor({ timeout: 15000 });
  const labels = (await page.locator(".momo-guess__label, .top3-item .label").allTextContents()).map(x => x.replace(/⭐.*$/s, "").trim());
  log(`Top-3 (MOCK provider): ${JSON.stringify(labels)}`);
  await snap("top3");
  if (shot) await shot("top3");
  if (inspect) await inspect(); // runs while the Top-3 panel is still on screen (before the decision)
  const rank = labels.findIndex(x => x.toLowerCase() === prefer) + 1;
  let decision;
  if (mode === "accept") { await pickCandidate(page, 1); decision = { type: "Accept", rank: 1, label: labels[0] }; }
  else if (mode === "override") {
    // Open the picker once (btn-override is a ring: hold it), read what it offers, then pick and confirm (holds).
    await press(page, "btn-override");
    await page.locator("[data-testid^=override-option-]").first().waitFor({ state: "visible", timeout: 15000 });
    const opts = await page.locator("[data-testid^=override-option-]").evaluateAll(xs => xs.map(x => x.dataset.testid.replace("override-option-", "")));
    const wanted = [].concat(prefer).find(p => opts.includes(p)) ?? opts[0];
    await press(page, `override-option-${wanted}`);
    await press(page, "override-confirm");
    decision = { type: "Override", label: wanted, optionsOffered: opts };
  }
  else if (rank === 1) { await pickCandidate(page, 1); decision = { type: "Accept", rank, label: prefer }; }
  else if (rank > 1) { await pickCandidate(page, rank); decision = { type: "Correct", rank, label: prefer }; }
  else { await overrideTo(page, prefer); decision = { type: "Override", label: prefer }; }
  log(`decision: ${JSON.stringify(decision)}`);
  return { labels, decision };
}

/** Drag the pending object (visible on canvas) to a world-space target centre. Trusted mouse only. */
export async function placeByDrag(page, targetCx, targetCy, { create = true } = {}) {
  // 2026-11-11 (S1): after the decision the object is a sticker on the canvas; "Lempar" (2 s ring) drops it into the
  // world and starts placement. There is no "Masukkan ke dunia" popup any more (btn-enter-world removed).
  await page.locator("[data-testid=sticker-stamp]").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await snap("stiker");
  if (create) await press(page, "btn-throw-sticker");
  const game = page.locator("[data-testid=game-canvas]");
  await page.waitForFunction(() => document.querySelector("[data-testid=game-canvas]")?.dataset.phase === "placing", null, { timeout: 15000 });
  await snap("penempatan");
  const gb = await game.boundingBox();
  const g = await readGame(page);
  const toScreen = (wx, wy) => ({ x: gb.x + wx / 800 * gb.width, y: gb.y + wy / 450 * gb.height });
  const s = toScreen(g.objectX + g.objectW / 2, g.objectY + g.objectH / 2);
  const t = toScreen(targetCx, targetCy);
  await page.mouse.move(s.x, s.y); await page.mouse.down(); await page.mouse.move(t.x, t.y, { steps: 14 }); await page.mouse.up();
  const after = await readGame(page);
  return { before: g, after };
}

export async function confirmPlacement(page) {
  const confirm = page.locator("[data-testid=btn-confirm-placement]");
  await confirm.waitFor({ state: "visible", timeout: 8000 });
  if (!(await confirm.isEnabled())) throw new Error("placement not legal: confirm disabled");
  await confirm.click();
  await page.waitForFunction(() => { const c = document.querySelector("[data-testid=game-canvas]"); return c?.dataset.phase === "gameplay" && Number(c.dataset.committedCount) >= 1; }, null, { timeout: 8000 });
}

export function writeJson(file, obj) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }

/** Ending (L4, Pusat Halaman) after the L3 win: the portal (~7 s), "Aku mengerti" (1 s), the neutral recap
 *  (1 s "Lanjut"), then "Kembali ke sampul" (no quiz by default) to the cover. */
export async function playEnding(page, { log = () => {} } = {}) {
  await page.locator("[data-testid=center-of-page]").waitFor({ state: "visible", timeout: 30000 });
  log("ending: Pusat Halaman opened (portal)");
  await sleep(3000);
  await snap("portal");
  await holdThumb(page, "ending-understood", { timeout: 60000 });
  log("ending: AI talk understood (1 s)");
  await page.locator("[data-testid=ending-recap]").waitFor({ state: "visible", timeout: 30000 });
  await holdThumb(page, "ending-recap-next", { timeout: 30000 });
  log("ending: recap read (1 s)");
  await snap("rekap");
  await press(page, "ending-back-to-cover", { timeout: 30000 });
  log("ending: back to cover");
}

/** Trusted-key level runner shared by the showcase: stand at launchX, jump, then walk right until an outcome. */
export async function standAt(page, targetX, tol = 7) {
  for (let i = 0; i < 8; i++) {
    await sleep(150); const m = await readGame(page);
    if (m.phase !== "gameplay" || m.settled) return m;
    const dx = targetX - m.x; if (Math.abs(dx) <= tol && m.grounded) return m;
    const key = dx > 0 ? "ArrowRight" : "ArrowLeft";
    await page.keyboard.down(key); await sleep(Math.max(30, Math.abs(dx) / 200 * 1000 - 25)); await page.keyboard.up(key);
  }
  await sleep(150); return readGame(page);
}
export async function jumpStep(page, step) {
  const t0 = Date.now();
  await page.keyboard.down("ArrowRight"); await page.keyboard.down("Space"); await sleep(150); await page.keyboard.up("Space");
  if (step.hold < 999) { await sleep(Math.max(0, step.hold * 20 - (Date.now() - t0))); await page.keyboard.up("ArrowRight"); }
  const end = Date.now() + 4000; let air = false, m;
  while (Date.now() < end) { m = await readGame(page); if (m.outcome || m.settled) break; if (!m.grounded) air = true; if (air && m.grounded) break; await sleep(8); }
  await page.keyboard.up("ArrowRight"); return m;
}
export async function playPlanSteps(page, steps) {
  for (const s of steps) { const b = await standAt(page, s.launchX); if (b.settled) return b; const a = await jumpStep(page, s); if (a.outcome || a.settled) return a; }
  await page.keyboard.down("ArrowRight"); const end = Date.now() + 6000;
  while (Date.now() < end) { const m = await readGame(page); if (m.outcome || m.settled) break; await sleep(20); }
  await page.keyboard.up("ArrowRight"); return readGame(page);
}

/** Showcase drawing in CAMERA mode (hand input, fake camera): feed a synthetic pinching hand through the real
 *  hand pipeline (TEST HOOKS build: window.__skbTestHooks.surface.feedHandLandmarksForTest). Falls back to the mouse. */
export async function drawHandOrMouseSlow(page, durationMs = 10000) {
  const hasHand = await page.evaluate(() => !!window.__skbTestHooks?.surface && window.__skbTestHooks.surface.getMode?.() === "hand");
  if (!hasHand) return drawSlow(page, durationMs);
  // Canvas-normalized polyline (0..1): block outline + cross line, like drawSlow.
  const strokes = [[[0.25, 0.42], [0.55, 0.42], [0.55, 0.56], [0.25, 0.56], [0.25, 0.42]], [[0.3, 0.49], [0.4, 0.51], [0.5, 0.49]]];
  const stepsPerSeg = 30, segs = strokes.reduce((n, s) => n + s.length - 1, 0);
  const pause = Math.max(10, Math.floor(durationMs / (segs * stepsPerSeg)));
  let ts = 1;
  const feed = (nx, ny, pinch) => page.evaluate(([nx, ny, pinch, ts]) => {
    // Hand pose around the index tip at (nx, ny) in canvas space; x is mirrored by the pipeline (1 - x).
    const tx = 1 - nx, ty = ny, h = new Array(21).fill(0).map(() => ({ x: tx, y: ty + 0.1 }));
    h[0] = { x: tx + 0.05, y: ty + 0.3 }; h[9] = { x: tx + 0.05, y: ty + 0.1 };
    h[5] = { x: tx, y: ty + 0.1 }; h[6] = { x: tx, y: ty + 0.06 }; h[7] = { x: tx, y: ty + 0.03 }; h[8] = { x: tx, y: ty };
    for (const [m, p, d, t, dx] of [[9, 10, 11, 12, 0.05], [13, 14, 15, 16, 0.09], [17, 18, 19, 20, 0.12]]) {
      h[m] = { x: tx + dx, y: ty + 0.1 }; h[p] = { x: tx + dx, y: ty + 0.06 }; h[d] = { x: tx + dx, y: ty + 0.1 }; h[t] = { x: tx + dx, y: ty + 0.13 };
    }
    h[2] = { x: tx - 0.06, y: ty + 0.16 };
    h[4] = pinch ? { x: tx + 0.005, y: ty + 0.005 } : { x: tx - 0.12, y: ty + 0.1 };
    window.__skbTestHooks.surface.feedHandLandmarksForTest(h, ts);
  }, [nx, ny, pinch, ts++ * 33]);
  for (const s of strokes) {
    for (let i = 0; i < 4; i++) { await feed(s[0][0], s[0][1], false); await sleep(pause); }
    for (let k = 1; k < s.length; k++) {
      const [ax, ay] = s[k - 1], [bx, by] = s[k];
      for (let i = 0; i <= stepsPerSeg; i++) { await feed(ax + (bx - ax) * i / stepsPerSeg, ay + (by - ay) * i / stepsPerSeg, true); await sleep(pause); }
    }
    await feed(s[s.length - 1][0], s[s.length - 1][1], false);
    await sleep(250);
  }
  await page.evaluate(() => window.__skbTestHooks.surface.feedHandLandmarksForTest(undefined, 0));
}

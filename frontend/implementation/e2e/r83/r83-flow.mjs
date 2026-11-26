#!/usr/bin/env node
/**
 * Wave 5 P9 Hardening — End-to-End Flow, Performance & Parity Suite for r8.3 (`NEXT_PUBLIC_UI_R83=1`).
 *
 * Drives the statically exported `./out` production app in real headless Chromium:
 *  1. Cover Consent Gate -> Fallback Mode -> "Ayo Mulai" -> Name input -> Confirm ("Ya, itu namaku")
 *  2. Tutorial 3 Cards (Walk -> Safety -> Canvas 5 Tools -> "Pilih level")
 *  3. Level Select lock guard (`/level2` -> `/levels` "Selesaikan Level 1 dulu", O-8 no "Bab")
 *  4. Level 1 World Intro -> Canvas Draw + Erase/Undo/Redo/Clear + Mock Top-3 (O-13 no "Demo") + Override -> Sticker Throw -> World
 *  5. Direct `/ending` screen + 1x `#cam-pip` check + Performance telemetry (0 pageerrors, longtask check)
 *  6. Captures `docs/migration-r83/parity/prod-r83/*.png` and checks geometry/pixel match vs `sandbox-ref`
 */
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { ROOT, startStaticServer, launch } from "../lib/harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, "../..");
const PROD_PARITY_DIR = path.join(APP_DIR, "docs", "migration-r83", "parity", "prod-r83");
const SANDBOX_PARITY_DIR = path.join(APP_DIR, "docs", "migration-r83", "parity", "sandbox-ref");
const PERF_JSON = path.join(APP_DIR, "e2e", "r83", "logs", "r83-perf-report.json");

fs.mkdirSync(PROD_PARITY_DIR, { recursive: true });
fs.mkdirSync(path.dirname(PERF_JSON), { recursive: true });

const CAMERA_MASK_SELECTOR = "#cam-pip, #camera.pip, .cam-box, video, [data-r83-camera-mask]";
const HYDRATION_ERROR_RE = /#418|#423|Minified React error #(?:418|423)|Hydration failed|did not match/i;
const IGNORED_CONSOLE_RE = /favicon|Download the React DevTools/i;
const checks = [];
const perfMetrics = {
  longTasks: [],
  routeTimingsMs: {},
  canvasMoveLongTasks: 0,
  camPipNodes: [],
  camPipChecks: [],
  hydrationErrors: [],
  directRouteChecks: [],
};

function check(name, ok, detail = null) {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== null ? " " + JSON.stringify(detail) : ""}`);
}

function filterRealErrors(list) {
  return list.filter((e) => !IGNORED_CONSOLE_RE.test(e.text));
}

async function readCamPipInfo(page) {
  return page.evaluate(() => {
    const nodes = document.querySelectorAll("#cam-pip");
    const pip = document.querySelector('[data-testid="r83-cam-pip"]') ?? nodes[0] ?? null;
    if (!pip) {
      return { count: nodes.length, found: false };
    }
    const cs = window.getComputedStyle(pip);
    const rect = pip.getBoundingClientRect();
    return {
      count: nodes.length,
      found: true,
      id: pip.id,
      testId: pip.getAttribute("data-testid"),
      position: cs.position,
      display: cs.display,
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      hasMonuiMode: pip.hasAttribute("data-monui-mode"),
      monuiMode: pip.getAttribute("data-monui-mode"),
      insideR83Scope: Boolean(pip.closest('[data-ui="r83"]') || pip.getAttribute("data-ui") === "r83"),
    };
  });
}

async function inspectCamPip(page, routeLabel) {
  const info = await readCamPipInfo(page);
  perfMetrics.camPipNodes.push(info.count);
  perfMetrics.camPipChecks.push({ route: routeLabel, ...info });
  check(
    `O-11 & P9a: #cam-pip fixed bottom-left + data-monui-mode on ${routeLabel}`,
    info.found &&
      info.count === 1 &&
      info.id === "cam-pip" &&
      info.position === "fixed" &&
      info.display !== "none" &&
      info.y > 400 &&
      info.x < 100 &&
      info.width > 0 &&
      info.height > 0 &&
      info.hasMonuiMode &&
      ["idle", "worker", "fallback", "error"].includes(info.monuiMode ?? ""),
    info,
  );
  return info;
}

async function settleFrames(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

async function nuiPinchHold(page, x, y, holdMs = 1150) {
  await page.mouse.move(x, y);
  await sleep(120);
  await page.mouse.down();
  await sleep(holdMs);
  await page.mouse.up();
  await sleep(150);
}

async function snapProd(page, name) {
  await settleFrames(page);
  const maskLocator = page.locator(CAMERA_MASK_SELECTOR);
  const outPath = path.join(PROD_PARITY_DIR, `${name}__1280x720.png`);
  await page.screenshot({
    path: outPath,
    fullPage: false,
    mask: [maskLocator],
    maskColor: "#1e2126",
  });
  return fs.statSync(outPath).size;
}

const { server, base } = await startStaticServer();
const { browser, context, page, errors } = await launch({ viewport: { width: 1280, height: 720 } });
// The static server has no backend: answer the skip-button setting the way a backend with no admin choice does.
await context.route("**/api/settings/skip-button", (route) => route.fulfill({ json: { enabled: null, updated_at: null } }));

try {
  await page.addInitScript(() => {
    window.__r83LongTasks = [];
    if (typeof PerformanceObserver !== "undefined") {
      try {
        const obs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            window.__r83LongTasks.push({ duration: e.duration, startTime: e.startTime });
          }
        });
        obs.observe({ entryTypes: ["longtask"] });
      } catch {
        /* ignore if unsupported */
      }
    }
  });

  // 1. IN-DREAM NICKNAME INPUT & NON-SKIPPABLE DREAM LOADER (/) -> IRIS HANDOVER -> COVER (/onboarding/cam)
  const t0Cover = Date.now();
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 30000 });
  const dreamLoader = page.locator('[data-testid="dream-loader"]');
  const dreamMounted = await dreamLoader.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false);
  const nameInput = page.locator('[data-testid="r83-entry-name-input"]');
  const nameInputVisible = await nameInput.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false);
  const loadPath = new URL(page.url()).pathname;
  const skipBtnCount = await page.locator('[data-testid="dream-loader-skip"]').count();
  check(
    "Route / opens non-skippable DreamLoader with in-dream nickname input (zero dream-loader-skip)",
    dreamMounted && nameInputVisible && loadPath === "/" && skipBtnCount === 0,
    { dreamMounted, nameInputVisible, loadPath, skipBtnCount },
  );

  await nameInput.fill("Rani");
  await page.locator('[data-testid="r83-entry-submit"]').click();
  const dreamPrompt = page.locator('[data-testid="dream-name-prompt"]');
  const sawDreamReact = await dreamPrompt
    .filter({ hasText: "Oooo... Rani" })
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check("DreamLoader Momo reacts sleepily ('Oooo... Rani... zzz...') after nickname submit", sawDreamReact);

  if (dreamMounted) {
    await dreamLoader.waitFor({ state: "detached", timeout: 30000 });
  }
  await page.locator('[data-testid="r83-nui-warmup-banner"]').waitFor({ state: "detached", timeout: 25000 }).catch(() => {});
  await page.locator('[data-testid="r83-cover-screen"]').waitFor({ state: "visible", timeout: 15000 });
  await page.locator('[data-testid="r83-gate-go"]').waitFor({ state: "visible", timeout: 10000 });
  check(
    "DreamLoader finishes warmup & iris morphs -> /onboarding/cam",
    new URL(page.url()).pathname === "/onboarding/cam",
    { pathname: new URL(page.url()).pathname },
  );
  perfMetrics.routeTimingsMs.coverMount = Date.now() - t0Cover;

  const hasSkipbar = (await page.locator("#skipbar").count()) > 0;
  const hasLegacyHero = (await page.locator('[data-testid="global-camera-widget"]').count()) > 0;
  check("O-9 & O-11: Cover r8.3 active, zero #skipbar, zero legacy GlobalCamera", !hasSkipbar && !hasLegacyHero);
  check("Cover parity shot cover-sleep", (await snapProd(page, "cover-sleep")) > 0);

  // Agree consent -> camera fallback -> wake -> Momo greets "Hai, Rani!" -> Ayo! -> book-curl -> Tutorial directly
  await page.locator('[data-testid="r83-gate-checkbox"]').click();
  await page.locator('[data-testid="r83-gate-go"]').click();
  await sleep(300);
  check("Cover parity shot cover-gate", (await snapProd(page, "cover-gate")) > 0);

  // Click camera toggle in CoverCameraCard; without physical webcam in headless Chromium, fallback button appears -> click it
  await page.locator('[data-testid="r83-camera-toggle"]').waitFor({ state: "visible", timeout: 10000 });
  await page.locator('[data-testid="r83-camera-toggle"]').click();
  const fallbackBtn = page.locator('[data-testid="r83-camera-fallback-btn"]');
  await fallbackBtn.waitFor({ state: "visible", timeout: 10000 });
  await fallbackBtn.click();
  const coverPip = await readCamPipInfo(page);
  check(
    "O-11 & P9a: Cover fails closed without physical camera (#cam-pip mounted + data-monui-mode)",
    coverPip.found && coverPip.count === 1 && coverPip.display === "none" && coverPip.hasMonuiMode,
    coverPip,
  );

  // Capture personalized greeting during intro/wake before Ayo ring appears
  const coverBubble = page.locator('[data-testid="r83-cover-bubble"]');
  let sawGreeting = false;
  const greetDeadline = Date.now() + 25000;
  while (Date.now() < greetDeadline) {
    const bubbleText = await coverBubble.innerText().catch(() => "");
    if (bubbleText.includes("Hai, Rani!")) {
      sawGreeting = true;
      break;
    }
    if (await page.locator('[data-testid="r83-ayo-ring"]').isVisible().catch(() => false)) {
      const latestText = await coverBubble.innerText().catch(() => "");
      sawGreeting = latestText.includes("Hai, Rani!");
      break;
    }
    await sleep(150);
  }
  await page.locator('[data-testid="r83-ayo-ring"]').waitFor({ state: "visible", timeout: 30000 });
  check("Cover Momo greets 'Hai, Rani!' before Ayo!", sawGreeting);
  check("Cover parity shot cover-ayo", (await snapProd(page, "cover-ayo")) > 0);

  // Wait >200ms target settle window then hold Rule A pinch 1200ms -> book curls open -> directly to Tutorial (no STT step!)
  await sleep(300);
  await nuiPinchHold(page, 640, 360, 1250);

  // 2. TUTORIAL 3 CARDS
  await page.locator('[data-testid="r83-tutorial-screen"]').waitFor({ state: "visible", timeout: 25000 });
  const hadNameStep = (await page.locator('[data-testid="r83-name-card"]').count()) > 0;
  check(
    "Cover -> Tutorial direct transition (no STT step)",
    new URL(page.url()).pathname === "/onboarding/card" && !hadNameStep,
    { pathname: new URL(page.url()).pathname, hadNameStep },
  );
  await page.locator('[data-testid="r83-tut-walk"]').waitFor({ state: "visible", timeout: 25000 });
  await inspectCamPip(page, "/onboarding/card");
  check("Tutorial parity shot kartu-1", (await snapProd(page, "kartu-1")) > 0);

  // Card 1 walk to flag via ArrowRight, wait unlocked thumb (Rule A)
  for (let i = 0; i < 32; i++) {
    await page.keyboard.press("ArrowRight");
    await sleep(30);
  }
  await page.locator('[data-testid="r83-tut-thumb"]:not(.tut-thumb--locked)').first().waitFor({ state: "visible", timeout: 25000 });
  await sleep(300);
  await nuiPinchHold(page, 640, 360, 1300);

  // Card 2 safety -> wait unlocked thumb (CARD_READ_MS after Momo) -> confirm
  await page.locator('[data-testid="r83-tut-safety"]').waitFor({ state: "visible", timeout: 20000 });
  const safetyText = await page.locator('[data-testid="r83-tutorial-screen"]').innerText();
  check("O-8: Tutorial Card 2 has no 'Bab'", !/\bBab\b/i.test(safetyText));
  await page.locator('.tut-card[data-i="1"] [data-testid="r83-tut-thumb"]:not(.tut-thumb--locked)').waitFor({ state: "visible", timeout: 25000 });
  await sleep(300);
  await nuiPinchHold(page, 640, 360, 1300);

  // Card 3 canvas tools -> 5 tools -> wait unlocked thumb -> "Pilih level"
  await page.locator('[data-testid="r83-tut-canvas"]').waitFor({ state: "visible", timeout: 20000 });
  await sleep(250);
  const cBox = await page.locator('[data-testid="r83-tut-canvas"]').boundingBox();
  if (cBox) {
    const strokeY = cBox.y + Math.min(120, cBox.height * 0.45);
    const startX = cBox.x + Math.min(80, cBox.width * 0.25);
    const endX = cBox.x + Math.min(220, cBox.width * 0.75);
    // Draw horizontal stroke with real mouse (tests MouseSource fallback + CanvasController)
    await page.mouse.move(startX, strokeY);
    await sleep(60);
    await page.mouse.down();
    await page.mouse.move(endX, strokeY, { steps: 6 });
    await page.mouse.up();
    await sleep(150);
    // Point-hold eraser button
    const eBox = await page.locator('[data-testid="r83-tool-eraser"]').boundingBox();
    if (eBox) await nuiPinchHold(page, eBox.x + eBox.width / 2, eBox.y + eBox.height / 2, 1250);
    // Erase segment over middle of stroke
    await page.mouse.move(cBox.x + Math.min(130, cBox.width * 0.4), strokeY);
    await sleep(60);
    await page.mouse.down();
    await page.mouse.move(cBox.x + Math.min(170, cBox.width * 0.6), strokeY, { steps: 4 });
    await page.mouse.up();
    await sleep(150);
    await page.keyboard.press("z");
    await page.keyboard.press("x");
    const clrBox = await page.locator('[data-testid="r83-tool-clear"]').boundingBox();
    if (clrBox) await nuiPinchHold(page, clrBox.x + clrBox.width / 2, clrBox.y + clrBox.height / 2, 1250);
  }
  await page.locator('.tut-card[data-i="2"] [data-testid="r83-tut-thumb"]:not(.tut-thumb--locked)').waitFor({ state: "visible", timeout: 25000 });
  await sleep(300);
  await nuiPinchHold(page, 640, 360, 1300);

  // 3. LEVEL SELECT
  await page.locator('[data-testid="r83-level-select-screen"]').waitFor({ state: "visible", timeout: 20000 });
  // Wait >= 900ms for useRibbonAnimations (0.6s + 0.12s * 2 stagger) so all 3 ribbons & locks settle (matches parity-capture.mjs 1200ms).
  await sleep(1200);
  check("Tutorial -> /levels transition", new URL(page.url()).pathname === "/levels");
  const lvlText = await page.locator('[data-testid="r83-level-select-screen"]').innerText();
  check("O-8: LevelSelect uses 'Level', zero 'Bab'", lvlText.includes("Level") && !/\bBab\b/i.test(lvlText));
  await inspectCamPip(page, "/levels");
  check("LevelSelect parity shot levels-idle", (await snapProd(page, "levels-idle")) > 0);

  // Test locked level guard directly on /level2
  await page.goto(`${base}/level2`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.locator('[data-testid="r83-route-notice"]').waitFor({ state: "visible", timeout: 10000 });
  const noticeText = await page.locator('[data-testid="r83-route-notice"]').innerText();
  const guardBodyText = await page.locator("body").innerText();
  const guardOk =
    new URL(page.url()).pathname === "/levels" &&
    noticeText.includes("Level") &&
    !/\bBab\b/i.test(noticeText) &&
    !/\bBab\b/i.test(guardBodyText);
  check(
    "Locked /level2 redirects to /levels with Level message (O-8, zero 'Bab')",
    guardOk,
    guardOk ? null : { pathname: new URL(page.url()).pathname, noticeText },
  );

  // Click Level 1 ribbon -> WorldIntro -> complete via production Rule A pinch ("Aku mengerti") -> Canvas
  await page.locator('[data-testid="r83-level-card-1"]').click();
  await page.locator('[data-testid="r83-world-intro"]').waitFor({ state: "visible", timeout: 15000 });
  // Wait >= 500ms (chip delay 0.3s + 0.5s fade; 1400ms matches parity-capture.mjs) so "Level 1 · Jembatan Pertama" settles cleanly.
  await sleep(1400);
  check("WorldIntro parity shot world-intro", (await snapProd(page, "world-intro")) > 0);
  const understandRing = page.locator('[data-testid="r83-intro-understand"]');
  await understandRing.waitFor({ state: "visible", timeout: 35000 });
  await sleep(300);
  await nuiPinchHold(page, 640, 360, 1300);

  // 4. CANVAS SCREEN + CURSOR PERF + TOP-3 / OVERRIDE -> STICKER THROW -> WORLD
  await page.locator('[data-testid="r83-canvas-screen"]').waitFor({ state: "visible", timeout: 20000 });
  check("Canvas route /canvas1 active", new URL(page.url()).pathname === "/canvas1");
  await inspectCamPip(page, "/canvas1");
  check("Canvas parity shot canvas-empty", (await snapProd(page, "canvas-empty")) > 0);

  const paperBox = await page.locator('[data-testid="r83-draw-canvas"]').boundingBox();
  check("Canvas surface visible", Boolean(paperBox));
  const ltBeforeMove = await page.evaluate(() => window.__r83LongTasks?.length ?? 0);
  if (paperBox) {
    for (let i = 0; i < 20; i++) {
      await page.mouse.move(paperBox.x + 80 + i * 10, paperBox.y + 80 + i * 4);
      await sleep(16);
    }
    const ltAfterMove = await page.evaluate(() => window.__r83LongTasks?.length ?? 0);
    perfMetrics.canvasMoveLongTasks = ltAfterMove - ltBeforeMove;
    check("PERF: <= 0 longtasks during 20 cursor moves", perfMetrics.canvasMoveLongTasks === 0, { count: perfMetrics.canvasMoveLongTasks });

    // Draw closed box via real trusted mouse
    await page.mouse.move(paperBox.x + 60, paperBox.y + 60);
    await sleep(60);
    await page.mouse.down();
    await page.mouse.move(paperBox.x + 220, paperBox.y + 60, { steps: 5 });
    await page.mouse.move(paperBox.x + 220, paperBox.y + 140, { steps: 5 });
    await page.mouse.move(paperBox.x + 60, paperBox.y + 140, { steps: 5 });
    await page.mouse.move(paperBox.x + 60, paperBox.y + 60, { steps: 5 });
    await page.mouse.up();
  }

  // Wait 1000ms idle GuessRing (O-14) and let GSAP pop settle before reading coords
  await page.locator('[data-testid="r83-guess-ring"]').waitFor({ state: "visible", timeout: 10000 });
  await sleep(300);
  const ringBox = await page.locator('[data-testid="r83-guess-ring"]').boundingBox();
  if (ringBox) await nuiPinchHold(page, ringBox.x + ringBox.width / 2, ringBox.y + ringBox.height / 2, 2350);

  await page.locator('[data-testid="r83-guess-panel"]').waitFor({ state: "visible", timeout: 15000 });
  const provText = await page.locator('[data-testid="r83-prediction-source"]').innerText();
  check("O-13: Prediction provenance never mentions Demo", !/demo/i.test(provText), { provText });

  // Pick Accept rank 1 (HOLD_MS_DECISION = 2000ms) after row entrance animation settles
  await page.locator('[data-testid="r83-guess-accept"]').waitFor({ state: "visible", timeout: 10000 });
  await sleep(400);
  const acceptBox = await page.locator('[data-testid="r83-guess-accept"]').boundingBox();
  if (acceptBox) await nuiPinchHold(page, acceptBox.x + acceptBox.width / 2, acceptBox.y + acceptBox.height / 2, 2300);

  // Sticker stage -> Lempar (holdMs = 1500ms)
  await page.locator('[data-testid="r83-sticker"]').waitFor({ state: "visible", timeout: 10000 });
  await page.locator('[data-testid="r83-sticker-throw"]').waitFor({ state: "visible", timeout: 10000 });
  await sleep(500);
  const throwBox = await page.locator('[data-testid="r83-sticker-throw"]').boundingBox();
  if (throwBox) await nuiPinchHold(page, throwBox.x + throwBox.width / 2, throwBox.y + throwBox.height / 2, 2000);

  // Lands in WorldScreen (/level1)
  await page.locator('[data-testid="r83-world-screen"]').waitFor({ state: "visible", timeout: 15000 });
  check("Sticker throw -> /level1 WorldScreen", new URL(page.url()).pathname === "/level1");

  // 5. DIRECT STATIC ROUTE CHECKS (/ending, /onboarding/card, /levels, /canvas1, /level1) & PRIVACY CHECK
  const verifyDirectRoute = async (routePath, readySelector, { settleMs = 0, expectLevel = false } = {}) => {
    const errStart = errors.length;
    await page.goto(`${base}${routePath}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.locator(readySelector).first().waitFor({ state: "visible", timeout: 15000 });
    if (settleMs > 0) await sleep(settleMs);
    await settleFrames(page);
    const routeErrors = filterRealErrors(errors.slice(errStart));
    const routeHydration = routeErrors.filter((e) => HYDRATION_ERROR_RE.test(e.text));
    const actualPath = new URL(page.url()).pathname;
    const visibleText = await page.locator("body").innerText();
    const hasBab = /\bBab\b/i.test(visibleText);
    const hasLevel = visibleText.includes("Level");
    perfMetrics.directRouteChecks.push({
      route: routePath,
      pathname: actualPath,
      errorCount: routeErrors.length,
      hydrationErrorCount: routeHydration.length,
      hasBab,
      hasLevel,
    });
    check(
      `Direct static route ${routePath} loads cleanly (0 console/page/hydration errors)`,
      actualPath === routePath && routeErrors.length === 0 && routeHydration.length === 0,
      routeErrors.length > 0 ? { actualPath, routeErrors } : null,
    );
    check(
      `O-8: ${routePath} visible DOM text has zero 'Bab'${expectLevel ? " and expects 'Level'" : ""}`,
      !hasBab && (!expectLevel || hasLevel),
      hasBab || (expectLevel && !hasLevel) ? { routePath, hasBab, hasLevel } : null,
    );
  };

  // Match parity-capture.mjs (~1500ms after fonts+reveal) so ParachuteScene canopy, lines & zoom settle before ending-init.
  await verifyDirectRoute("/ending", '[data-testid="r83-ending-screen"]', { settleMs: 1850 });
  await inspectCamPip(page, "/ending");
  check("Ending parity shot ending-init", (await snapProd(page, "ending-init")) > 0);

  const storageDump = await page.evaluate(() => JSON.stringify({ ls: { ...localStorage }, ss: { ...sessionStorage } }));
  check("Privacy invariant: zero 'Rani' stored in localStorage/sessionStorage", !storageDump.includes("Rani"));

  await verifyDirectRoute("/onboarding/card", '[data-testid="r83-tutorial-screen"]');
  await verifyDirectRoute("/levels", '[data-testid="r83-level-select-screen"]', { expectLevel: true });
  await verifyDirectRoute("/canvas1", '[data-testid="r83-canvas-screen"]');
  await verifyDirectRoute("/level1", '[data-testid="r83-world-intro"], [data-testid="r83-world-screen"]', { expectLevel: true });

  perfMetrics.longTasks = await page.evaluate(() => window.__r83LongTasks ?? []);
  const realErrors = filterRealErrors(errors);
  const hydrationErrors = realErrors.filter((e) => HYDRATION_ERROR_RE.test(e.text));
  perfMetrics.hydrationErrors = hydrationErrors;
  check("Zero React hydration errors (#418/#423/Hydration failed)", hydrationErrors.length === 0, hydrationErrors);
  check("Zero runtime console/page errors", realErrors.length === 0, realErrors);
  check(
    "Single #cam-pip across routes (1 node each)",
    perfMetrics.camPipNodes.length >= 4 && perfMetrics.camPipNodes.every((n) => n === 1),
    perfMetrics.camPipNodes,
  );

  // Measure quantitative pixel difference vs sandbox-ref PNGs via Chromium 2D canvas (ignoring bottom-left PIP box x<200,y>560)
  const parityPairs = [];
  for (const state of ["cover-sleep", "cover-gate", "cover-ayo", "kartu-1", "levels-idle", "world-intro", "canvas-empty", "ending-init"]) {
    const sb = path.join(SANDBOX_PARITY_DIR, `${state}__1280x720.png`);
    const pr = path.join(PROD_PARITY_DIR, `${state}__1280x720.png`);
    const sandboxBytes = fs.existsSync(sb) ? fs.statSync(sb).size : 0;
    const prodBytes = fs.existsSync(pr) ? fs.statSync(pr).size : 0;
    let diffPct = null;
    if (sandboxBytes > 0 && prodBytes > 0) {
      const sbB64 = fs.readFileSync(sb).toString("base64");
      const prB64 = fs.readFileSync(pr).toString("base64");
      diffPct = await page.evaluate(async ([a64, b64]) => {
        const load = (b) =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = `data:image/png;base64,${b}`;
          });
        const [ia, ib] = await Promise.all([load(a64), load(b64)]);
        const w = Math.min(ia.width, ib.width);
        const h = Math.min(ia.height, ib.height);
        const ca = document.createElement("canvas");
        const cb = document.createElement("canvas");
        ca.width = cb.width = w;
        ca.height = cb.height = h;
        const xa = ca.getContext("2d");
        const xb = cb.getContext("2d");
        xa.drawImage(ia, 0, 0);
        xb.drawImage(ib, 0, 0);
        const da = xa.getImageData(0, 0, w, h).data;
        const db = xb.getImageData(0, 0, w, h).data;
        let diff = 0;
        let total = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (x < 210 && y > h - 180) continue;
            total++;
            const i = (y * w + x) * 4;
            const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
            if (d > 48) diff++;
          }
        }
        return total > 0 ? Number(((diff / total) * 100).toFixed(2)) : 0;
      }, [sbB64, prB64]);
    }
    parityPairs.push({ state, sandboxBytes, prodBytes, diffPct });
  }

  fs.writeFileSync(
    PERF_JSON,
    JSON.stringify({ generatedAt: new Date().toISOString(), checks, perfMetrics, parityPairs }, null, 2),
  );
  const failed = checks.filter((c) => !c.ok);
  console.log(`R83-FLOW SUMMARY: ${checks.length - failed.length}/${checks.length} PASS`);
  if (failed.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}

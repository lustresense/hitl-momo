// E-ROUTE: the drawing canvas has its own URL (/canvasN) and the URL follows the level (/levelN on the ground).
// Mode: mouse fallback (the sandbox has no camera); trusted Playwright mouse/keyboard; read-only telemetry.
// Two browser profiles, so one finding never hides another:
//  Profile A (cover camera failed -> mouse fallback, the normal path):
//   1) intro of Bab 1 shows at /level1
//   2) after the intro thumb the cloud rise leaves the URL at /canvas1; the canvas takes a mouse stroke
//   4) browser Back from /canvas1 keeps a usable screen with no new console or page errors
//   5) Top-3 and the sticker still work after Back
//   6) "Lempar" (2 s thumb) returns the URL to /level1
//   7) /canvas3 while Bab 3 is locked goes safely to /levels with the locked notice
//  Profile B (refresh on /canvas1):
//   3) refresh on /canvas1 opens the Bab 1 canvas without the intro (or lands safely on /levels)
//   3c) after the refresh the mouse can hold the "Mulai Menggambar" ring (data-mode fallback)
//   3d) after Bantuan -> Mouse the ring is still held by the mouse
// Output: ROUTE_OUT (default docs/execution/evidence/route-canvas-<run>). Set ROUTE_OUT to keep the repo clean.
import fs from "node:fs";
import path from "node:path";
import { ROOT, startStaticServer, launch, gitInfo, onboardToLevelsFast, holdThumb, drawScribble, holdFinishDrawing, pickCandidate, press, sleep, writeJson } from "./lib/harness.mjs";

const RUN = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = process.env.ROUTE_OUT || path.join(ROOT, "docs/execution/evidence", `route-canvas-${RUN}`);
fs.mkdirSync(OUT, { recursive: true });
const checks = [], steps = [];
const log = m => { steps.push({ t: new Date().toISOString(), m }); console.log(m); };
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail: detail ?? null }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`); };
const videoDir = process.env.NO_VIDEO ? undefined : OUT;

const { server, base } = await startStaticServer();

/** Helpers bound to one browser profile. */
function profile(p) {
  const { page, errors } = p;
  const realErrors = () => errors.filter(e => !/favicon|Download the React DevTools/i.test(e.text));
  const pathOf = () => page.evaluate(() => window.location.pathname).catch(() => null);
  const visible = sel => page.locator(sel).first().isVisible().catch(() => false);
  const shot = n => page.screenshot({ path: path.join(OUT, `${n}.png`) }).catch(() => {});
  /** Poll the address bar (pushState and replaceState do not fire a load event). */
  async function waitPath(want, timeout = 10000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if ((await pathOf()) === want) return true; await sleep(100); }
    return false;
  }
  /** The canvas takes no ink while Momo's focus phase is open (pointer-events none under the backdrop). The phase ends
   *  only after Momo's review, when "Mulai Menggambar" (2 s thumb) appears: wait for it as enterLevel does (90 s). */
  async function openCanvasIfFocus() {
    const backdrop = page.locator("[data-testid=drawing-focus-backdrop]");
    if (!(await backdrop.waitFor({ state: "attached", timeout: 3000 }).then(() => true, () => false))) return;
    const startThumb = page.locator("[data-testid=btn-focus-start]").first();
    if (await startThumb.waitFor({ state: "visible", timeout: 90000 }).then(() => true, () => false)) {
      await sleep(1200);
      await holdThumb(page, "btn-focus-start", { timeout: 15000 });
      await backdrop.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
      log("canvas: focus phase closed with Mulai Menggambar");
    } else log("canvas: focus backdrop still open after 90 s without Mulai Menggambar");
  }
  return { page, realErrors, pathOf, visible, shot, waitPath, openCanvasIfFocus };
}

/** Onboarding, Bab 1 card, intro thumb: the student is on the canvas (URL /canvas1 after the rise). */
async function reachCanvas1(q, { checks: withChecks }) {
  await onboardToLevelsFast(q.page, base, log);
  const card1 = q.page.locator(".level-card").nth(0);
  await card1.waitFor({ state: "visible", timeout: 20000 });
  await card1.click();
  const intro = q.page.locator("[data-testid=level-intro]");
  const introShown = await intro.waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
  const pathAtIntro = await q.pathOf();
  if (withChecks) check("1 intro Bab 1 tampil dan URL /level1", introShown && pathAtIntro === "/level1", { introShown, path: pathAtIntro });
  await sleep(2500);
  await q.shot("01-intro-level1");
  await holdThumb(q.page, "intro-continue", { timeout: 45000 });
  await intro.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  const rose = await q.waitPath("/canvas1", 12000);
  if (withChecks) check("2 setelah naik awan URL /canvas1", rose, { path: await q.pathOf() });
  await q.page.locator("[data-testid=draw-canvas]").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
}

// ---------------- Profile A: normal mouse path ----------------
const A = profile(await launch({ videoDir, deviceScaleFactor: 1 }));
let failureA = null;
try {
  log(`run-start ${JSON.stringify(gitInfo())}`);
  await reachCanvas1(A, { checks: true });
  await A.openCanvasIfFocus();
  check("2b kanvas Bab 1 terlihat setelah naik awan", await A.visible("[data-testid=draw-canvas]"));
  await drawScribble(A.page, "block");
  const inked = await A.page.locator("[data-testid=btn-finish-drawing]").waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
  check("2c kanvas menerima coretan dengan mouse (tombol selesai muncul)", inked);
  await A.shot("02-canvas1-inked");

  // 4) Browser Back from /canvas1: the screen stays usable and the URL follows the state.
  const errBeforeBack = A.realErrors().length;
  await A.page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(e => log(`goBack error ${e}`));
  await sleep(1200);
  const pathAfterBack = await A.pathOf();
  const bodyText = await A.page.locator("body").innerText().catch(() => "");
  const canvasAfterBack = await A.visible("[data-testid=draw-canvas]");
  const levelsAfterBack = await A.visible(".level-card");
  const notBlank = bodyText.trim().length > 20 && (canvasAfterBack || levelsAfterBack || pathAfterBack === "/level1");
  check("4 Back dari /canvas1 tidak layar kosong dan URL sesuai state", notBlank, { pathAfterBack, canvasAfterBack, levelsAfterBack, bodyLen: bodyText.length });
  check("4b Back tidak menambah error konsol", A.realErrors().length === errBeforeBack, A.realErrors().slice(errBeforeBack).map(e => e.text).slice(0, 3));
  await A.shot("04-after-back");

  // 5) The canvas still works after Back: strokes -> finish thumb -> Top-3 -> Terima (sticker).
  if (!(await A.visible("[data-testid=draw-canvas]"))) {
    await A.page.goForward({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    await sleep(1200);
    log(`after Back the canvas was not visible (path ${await A.pathOf()}); Forward tried`);
  }
  await A.openCanvasIfFocus();
  await drawScribble(A.page, "block");
  const inkAfterBack = await A.page.locator("[data-testid=btn-finish-drawing]").waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
  check("5a kanvas menerima coretan setelah Back (tombol selesai muncul)", inkAfterBack, { path: await A.pathOf() });
  if (!inkAfterBack) throw new Error("no ink after Back: the canvas does not take strokes, steps 5 to 7 cannot run");
  await holdFinishDrawing(A.page);
  const guessed = await A.page.getByRole("heading", { name: /tebakan momo/i }).waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false);
  check("5 setelah Back Momo menebak dan Top-3 muncul", guessed);
  if (guessed) {
    const picked = await pickCandidate(A.page, 1);
    const sticker = await A.page.getByTestId("sticker-stamp").first().waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
    check("5b Terima membuat stiker di kanvas", sticker, { picked });
    await A.shot("05-sticker");

    // 6) Lempar: 2 s thumb on the sticker; the object leaves the canvas and the URL returns to /level1.
    await press(A.page, "btn-throw-sticker");
    const back = await A.waitPath("/level1", 15000);
    check("6 setelah Lempar URL kembali /level1", back, { path: await A.pathOf() });
    await sleep(800);
    await A.shot("06-after-throw");
  }
  check("6b tidak ada error konsol sepanjang profil A", A.realErrors().length === 0, A.realErrors().slice(0, 3).map(e => e.text));

  // 7) /canvas3 with Bab 3 locked (this profile has only Bab 1 open): safe landing on /levels with the notice.
  await A.page.goto(`${base}/canvas3`, { waitUntil: "domcontentloaded", timeout: 45000 });
  const landed = await A.waitPath("/levels", 15000);
  await A.page.locator(".level-card").first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  const notice = await A.page.getByText("Bab ini masih terkunci", { exact: false }).first().isVisible().catch(() => false);
  check("7 /canvas3 terkunci aman ke /levels dengan pesan kunci", landed && notice, { path: await A.pathOf(), notice });
  await A.shot("07-canvas3-locked");
} catch (e) {
  failureA = String(e?.stack || e);
  log(`FAILURE (profile A) ${failureA}`);
  check("profile A finished without an exception (later checks not reached)", false, String(e?.message || e).split("\n")[0]);
  await A.shot("zz-failure-A");
}
const videoA = await A.page.video()?.path().catch(() => null);
await A.page.context().close(); await A.page.context().browser().close();

// ---------------- Profile B: refresh on /canvas1 ----------------
const B = profile(await launch({ videoDir, deviceScaleFactor: 1 }));
let failureB = null;
try {
  await reachCanvas1(B, { checks: false });
  const errBeforeReload = B.realErrors().length;
  await B.page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  await B.page.locator("[data-testid=draw-canvas], [data-testid=level-intro], .level-card").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  await sleep(800);
  const pathAfterReload = await B.pathOf();
  const introAfterReload = await B.visible("[data-testid=level-intro]");
  const canvasAfterReload = await B.visible("[data-testid=draw-canvas]");
  const reloadOk = pathAfterReload === "/canvas1" ? (canvasAfterReload && !introAfterReload) : pathAfterReload === "/levels";
  check("3 refresh /canvas1 buka kanvas Bab 1 tanpa intro (atau aman ke /levels)", reloadOk, { path: pathAfterReload, canvas: canvasAfterReload, intro: introAfterReload });
  check("3b tidak ada error konsol saat refresh", B.realErrors().length === errBeforeReload, B.realErrors().slice(errBeforeReload).map(e => e.text).slice(0, 3));
  await B.shot("03-after-refresh");

  // 3c/3d: the focus ring is the only way forward before drawing. Its input mode decides whether a mouse can hold it.
  // The app input mode lives in memory and only turns to "fallback" when the camera fails (cover); a refresh resets it.
  const focusRing = B.page.locator("[data-testid=btn-focus-start]").first();
  const ringShown = await focusRing.waitFor({ state: "visible", timeout: 90000 }).then(() => true, () => false);
  const modeAfterReload = ringShown ? await focusRing.getAttribute("data-mode") : null;
  check("3c setelah refresh mouse bisa menahan cincin Mulai Menggambar (data-mode fallback)", ringShown && modeAfterReload === "fallback", { ringShown, mode: modeAfterReload });
  if (!ringShown || modeAfterReload !== "fallback") {
    // Bantuan opens the Mouse/Kamera switch in camera mode; does that make the ring mouse-holdable?
    const help = B.page.locator("[data-testid=btn-drawing-help]").first();
    const helpShown = await help.isVisible().catch(() => false);
    let pointerShown = false;
    if (helpShown) {
      await help.click({ timeout: 5000 }).catch(() => {});
      pointerShown = await B.page.locator("[data-testid=btn-input-pointer]").first().waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false);
      if (pointerShown) await B.page.locator("[data-testid=btn-input-pointer]").first().click({ timeout: 5000 }).catch(() => {});
    }
    const modeAfterHelp = ringShown ? await focusRing.getAttribute("data-mode") : null;
    check("3d setelah Bantuan lalu Mouse cincin Mulai Menggambar bisa ditahan dengan mouse", modeAfterHelp === "fallback", { helpShown, pointerShown, mode: modeAfterHelp });
    await B.shot("03d-after-help");
  }
} catch (e) {
  failureB = String(e?.stack || e);
  log(`FAILURE (profile B) ${failureB}`);
  check("profile B finished without an exception", false, String(e?.message || e).split("\n")[0]);
  await B.shot("zz-failure-B");
}
const videoB = await B.page.video()?.path().catch(() => null);
await B.page.context().close(); await B.page.context().browser().close();
server.close();

const critical = [...A.realErrors(), ...B.realErrors()];
const pass = checks.every(c => c.ok);
const videos = [videoA, videoB].filter(Boolean).map(p => path.basename(p));
writeJson(path.join(OUT, "evidence.json"), { run: RUN, result: pass ? "PASS" : "FAIL", failures: { A: failureA, B: failureB }, git: gitInfo(), checks, consoleAndPageErrors: critical, steps, videos });
console.log(`RESULT ${pass ? "PASS" : "FAIL"} checks=${checks.filter(c => c.ok).length}/${checks.length} consoleErrors=${critical.length} out=${OUT}`);
process.exit(pass ? 0 : 1);

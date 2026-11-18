// Momo guides every page before the game (fallback mode, no camera, production build with NEXT_PUBLIC_TEST_HOOKS=0):
// cover (asleep -> "Bangunkan Momo" -> her three lines -> 1 s thumb opens the book), ruler (focus phase, then the
// question after a move), tutorial (three cards), level list (Bab 1), level intro (1 s thumb rises into the sky).
// Records a video and checks what Momo says on each page. Trusted mouse/keyboard only.
import fs from "node:fs";
import path from "node:path";
import { ROOT, startStaticServer, launch, sleep, pickStudentNumber, playTutorial, holdThumb, press } from "./lib/harness.mjs";

const OUT = process.env.GUIDE_OUT || path.join(ROOT, "docs/execution/evidence/prd-0.0.16/guide-flow");
fs.mkdirSync(OUT, { recursive: true });
const { server, base } = await startStaticServer();
const { browser, context, page, errors } = await launch({ videoDir: process.env.NO_VIDEO ? undefined : path.join(OUT, "raw") });
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); };
const say = async id => (await page.locator(`[data-testid=${id}-chat] .momo-chat__bubble:not(.momo-chat__typing)`).allTextContents()).join(" | ");
const waitSay = async (id, re, ms = 30000) => { await page.waitForFunction(([i, r]) => [...document.querySelectorAll(`[data-testid=${i}-chat] .momo-chat__bubble`)].some(b => new RegExp(r, "i").test(b.textContent)), [id, re.source], { timeout: ms }); };
const shot = n => page.screenshot({ path: path.join(OUT, `${n}.png`) });

try {
  // 1. Cover: Momo sleeps; without a camera the "Bangunkan Momo" button wakes her; the 1 s thumb opens the book.
  await page.goto(base, { waitUntil: "domcontentloaded" }); await sleep(2200);
  check("cover: Momo is asleep before anything is pressed", (await page.locator("[data-testid=cover-momo]").getAttribute("data-asleep")) === "true");
  await shot("1-cover-asleep");
  await page.locator("[data-testid=btn-camera-toggle-switch]").click().catch(() => {});
  await page.locator("[data-testid=cover-wake]").waitFor({ state: "visible", timeout: 30000 });
  check("cover: no camera means the 'Bangunkan Momo' button is shown", true);
  await page.locator("[data-testid=cover-wake]").click();
  await page.waitForFunction(() => document.querySelector("[data-testid=cover-momo]")?.getAttribute("data-asleep") === "false", null, { timeout: 15000 });
  check("cover: the button wakes Momo", true);
  await waitSay("cover-momo", /gambar satu-satunya/);
  check("cover: she introduces herself", true, await say("cover-momo"));
  await shot("2-cover-awake");
  await waitSay("cover-momo", /antar dia/i);
  check("cover: she asks you to take the character to its place", true, await say("cover-momo"));
  await holdThumb(page, "cover-thumb", { timeout: 60000 });
  await page.waitForURL(u => u.pathname === "/onboarding/number", { timeout: 30000 });
  check("cover: the 1 s thumb opens the book to the ruler", true);

  // 2. Ruler: Momo focuses first; the question comes only after the student moves the ruler.
  await waitSay("number-momo", /pilih nomor absenmu/i, 30000);
  check("ruler: Momo asks for the number in the focus phase", true, await say("number-momo")); await shot("3-ruler-focus");
  await pickStudentNumber(page, { steps: 2 });
  check("ruler: after a move the question appeared and the 2 s thumb confirmed", true);

  // 3. Tutorial: she introduces the three cards; the walk and the thumbs follow.
  await waitSay("tutorial-momo", /tiga kartu/i, 60000);
  check("tutorial: Momo introduces the cards", true, await say("tutorial-momo")); await shot("4-tutorial");
  await playTutorial(page, () => {});
  check("tutorial: walk to the flag, card 1/2 (1 s) and card 3 (2 s) thumbs", true);

  // 4. Level list: the ribbon, Momo points at Bab 1; the 2 s ribbon thumb opens the book into the level intro.
  await page.locator(".level-card").first().waitFor({ state: "visible", timeout: 30000 });
  await waitSay("levels-momo", /Bab 1/, 30000);
  check("levels: Momo points at Bab 1", true, await say("levels-momo")); await shot("5-levels");
  await holdThumb(page, "level-thumb-1", { timeout: 20000 });
  await page.locator("[data-testid=level-intro]").waitFor({ state: "visible", timeout: 15000 });
  check("levels: the 2 s ribbon thumb opens the level intro", true);
  await sleep(2500); await shot("6-intro");
  await holdThumb(page, "intro-continue", { timeout: 60000 });
  await page.locator("[data-testid=level-intro]").waitFor({ state: "detached", timeout: 15000 });
  check("intro: the 1 s thumb lifts Momo through the clouds to the canvas", true);
  await press(page, "btn-focus-start", { timeout: 90000 });
  check("canvas: 'Mulai Menggambar' closes the focus backdrop", true);
} catch (e) { check("flow completed", false, String(e).slice(0, 240)); await shot("zz-failure").catch(() => {}); }

check("no page errors", errors.length === 0, errors.map(e => e.text).join(" ").slice(0, 200));
await context.close(); await browser.close(); server.close();
const ok = checks.every(c => c.ok);
fs.writeFileSync(path.join(OUT, "guide-flow-result.json"), JSON.stringify({ ok, checks }, null, 2));
console.log(ok ? "GUIDE FLOW OK" : "GUIDE FLOW FAILED");
process.exit(ok ? 0 : 1);

// Momo guides every page before the game: cover (asleep -> wakes, waves, greets), ruler, tutorial (3 cards), level list, story intro.
// PRD 0.0.16: fake camera + NEXT_PUBLIC_TEST_HOOKS=1 build (wave and thumbs are simulated). Records a video and checks what Momo says on each page.
import fs from "node:fs";
import path from "node:path";
import { ROOT, startStaticServer, launch, sleep, pickStudentNumber, playTutorial, holdThumb } from "./lib/harness.mjs";

const OUT = process.env.GUIDE_OUT || path.join(ROOT, "docs/execution/evidence/prd-0.0.16/guide-flow");
fs.mkdirSync(OUT, { recursive: true });
const { server, base } = await startStaticServer();
const { browser, context, page, errors } = await launch({
  videoDir: process.env.NO_VIDEO ? undefined : path.join(OUT, "raw"),
  extraArgs: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"], permissions: ["camera"],
});
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); };
const say = async id => (await page.locator(`[data-testid=${id}-chat] .momo-chat__bubble:not(.momo-chat__typing)`).allTextContents()).join(" | ");
const waitSay = async (id, re, ms = 15000) => { await page.waitForFunction(([i, r]) => [...document.querySelectorAll(`[data-testid=${i}-chat] .momo-chat__bubble`)].some(b => new RegExp(r, "i").test(b.textContent)), [id, re.source], { timeout: ms }); };
const shot = n => page.screenshot({ path: path.join(OUT, `${n}.png`) });

try {
  // 1. Cover (R1): Momo sleeps; turning the camera on does NOT wake her; the wave does.
  await page.goto(base, { waitUntil: "domcontentloaded" }); await sleep(2200);
  check("cover: Momo is asleep before the camera is on", (await page.locator("[data-testid=cover-momo]").getAttribute("data-asleep")) === "true");
  await shot("1-cover-asleep");
  await page.locator("[data-testid=btn-camera-toggle-switch]").click();
  await page.waitForFunction(() => typeof window.__skbWave === "function" && document.querySelector("video")?.srcObject, null, { timeout: 20000 });
  await sleep(2500);
  check("cover: camera on keeps Momo asleep (only a wave wakes her)", (await page.locator("[data-testid=cover-momo]").getAttribute("data-asleep")) === "true");
  check("cover: wave hint shown, no buttons in camera mode", (await page.locator("[data-testid=cover-wave-hint]").count()) === 1 && (await page.locator("[data-testid=cover-wake]").count()) === 0);
  await shot("2-cover-camera-on");
  await page.evaluate(() => window.__skbWave());
  await page.waitForFunction(() => document.querySelector("[data-testid=cover-momo]")?.getAttribute("data-asleep") === "false", null, { timeout: 15000 });
  check("cover: the wave wakes Momo", true);
  await waitSay("cover-momo", /Halo! Aku Momo/);
  check("cover: she greets", true, await say("cover-momo"));
  await shot("3-cover-awake");
  await page.waitForURL(u => u.pathname === "/onboarding/number", { timeout: 40000 });
  check("cover: after her last line the book opens to the ruler by itself", true);

  // 2. Ruler (R3): Momo asks about the number she sees; a 2 s thumb confirms.
  await waitSay("number-momo", /nomor absenmu/);
  check("ruler: Momo asks for the number", true, await say("number-momo")); await shot("4-ruler");
  await pickStudentNumber(page, { steps: 2 });
  check("ruler: Momo asked 'Bener nomor absenmu' and the thumb confirmed", true);

  // 3. Tutorial: she follows what the student does; every step is a thumb.
  await waitSay("tutorial-momo", /tiga kartu|geser tanganmu/i);
  check("tutorial: Momo introduces the cards", true, await say("tutorial-momo")); await shot("5-tutorial");
  await playTutorial(page, () => {});
  check("tutorial: walk, two 1 s thumbs, draw + Mundur, 2 s thumb", true);

  // 4. Level list (R6): ribbon thumb.
  await page.locator(".level-card").first().waitFor({ state: "visible", timeout: 20000 });
  await waitSay("levels-momo", /Bab 1/);
  check("levels: Momo points at Bab 1", true, await say("levels-momo")); await shot("6-levels");
  await holdThumb(page, "level-thumb-1", { timeout: 20000 });
  await page.locator("[data-testid=level-intro]").waitFor({ state: "visible", timeout: 15000 });
  check("levels: the 2 s ribbon thumb opens the book into the level intro", true);
  await sleep(4500); await shot("7-intro");
} catch (e) { check("flow completed", false, String(e).slice(0, 240)); await shot("zz-failure").catch(() => {}); }

check("no page errors", errors.length === 0, errors.map(e => e.text).join(" ").slice(0, 200));
await context.close(); await browser.close(); server.close();
const ok = checks.every(c => c.ok);
fs.writeFileSync(path.join(OUT, "guide-flow-result.json"), JSON.stringify({ ok, checks }, null, 2));
console.log(ok ? "GUIDE FLOW OK" : "GUIDE FLOW FAILED");
process.exit(ok ? 0 : 1);

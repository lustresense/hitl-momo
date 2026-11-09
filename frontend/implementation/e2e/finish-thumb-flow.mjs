// New draw flow (Owner rule 2026-11-09), trusted mouse only (fallback mode; the sandbox has no camera):
//  1) draw a little, then stay still 5 s -> NO guess, NO Top-3 (Momo stays quiet while the student draws)
//  2) a short press on the finish thumb (700 ms) -> still NO guess (a tap is not a thumbs-up)
//  3) hold the finish thumb until it confirms (2 s) -> Momo's guess and the Top-3 appear
//  4) Terima (rank 1) -> the object is offered to the world
// Telemetry: DOM only. Screenshots go to FLOW_OUT (default: docs/execution/evidence/finish-flow-<run>).
import fs from "node:fs";
import path from "node:path";
import { ROOT, startStaticServer, launch, gitInfo, onboardToLevelsFast, enterLevel, holdFinishDrawing, pickCandidate, sleep, writeJson } from "./lib/harness.mjs";

const RUN = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = process.env.FLOW_OUT || path.join(ROOT, "docs/execution/evidence", `finish-flow-${RUN}`);
fs.mkdirSync(OUT, { recursive: true });
const checks = [], steps = [];
const log = m => { steps.push({ t: new Date().toISOString(), m }); console.log(m); };
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`); };

const { server, base } = await startStaticServer();
const { browser, context, page, errors } = await launch({});
const shot = n => page.screenshot({ path: path.join(OUT, `${n}.png`) }).catch(() => {});
const heading = () => page.getByRole("heading", { name: /tebakan momo/i });
const guessVisible = async () => heading().isVisible().catch(() => false);
let failure = null;

try {
  log(`run-start ${JSON.stringify(gitInfo())}`);
  await onboardToLevelsFast(page, base, log);
  await enterLevel(page, 1, log);
  const finish = page.locator("[data-testid=btn-finish-drawing]");
  check("before any ink there is no finish thumb", (await finish.count()) === 0, await finish.count());

  // 1) a little drawing: one short stroke across the canvas centre
  const canvas = page.locator("[data-testid=draw-canvas]");
  const box = await canvas.boundingBox();
  const cx = box.x + box.width * 0.4, cy = box.y + box.height * 0.5;
  await page.mouse.move(cx - 60, cy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(cx - 60 + i * 10, cy + (i % 2 ? 6 : -6)); await sleep(40); }
  await page.mouse.up();
  await sleep(200);
  await shot("01-little-drawing");
  await finish.waitFor({ state: "visible", timeout: 5000 });
  check("with ink the finish thumb appears (btn-finish-drawing)", await finish.isVisible());
  const mode = await finish.getAttribute("data-mode");
  check("this run is fallback (mouse) mode, as the sandbox has no camera", mode === "fallback", mode);
  // Regression: the global camera card (fixed, bottom-left) used to sit on top of this ring and swallow the press.
  const topAtCentre = await page.evaluate(() => {
    const el = document.querySelector("[data-testid=btn-finish-drawing]");
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { ok: !!top && (el === top || el.contains(top)), top: top?.dataset?.testid ?? top?.className ?? null };
  });
  check("nothing covers the finish thumb at its centre", topAtCentre.ok, topAtCentre.top);

  // 2) stay still 5 s: no guess
  await sleep(5000);
  check("still for 5 s: Momo does NOT guess (no 'Tebakan Momo')", !(await guessVisible()));
  check("still for 5 s: no Top-3 candidate buttons", (await page.locator("[data-testid=btn-accept]").count()) === 0);
  await shot("02-still-5s-no-guess");

  // 3) a short tap on the finish thumb (700 ms) is not a thumbs-up
  const b = await finish.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(36, b.height / 3));
  await page.mouse.down();
  await sleep(700);
  await page.mouse.up();
  await sleep(600);
  check("a 700 ms press on the finish thumb does NOT trigger a guess", !(await guessVisible()));
  await shot("03-short-press-no-guess");

  // 4) hold until it confirms (2 s): Momo guesses, Top-3 appears
  const t0 = Date.now();
  const hold = await holdFinishDrawing(page);
  const heldMs = Date.now() - t0;
  log(`finish thumb held: ${JSON.stringify(hold)} in ${heldMs} ms`);
  await heading().waitFor({ state: "visible", timeout: 15000 });
  check("after holding the finish thumb Momo's guess appears ('Tebakan Momo')", await guessVisible());
  const cands = await page.locator("[data-testid=btn-accept], [data-testid^=btn-correct-]").count();
  check("Top-3 shows three candidate buttons", cands === 3, cands);
  check("the hold took at least 2 s (not a tap)", heldMs >= 2000, heldMs);
  await shot("04-after-hold-top3");

  // 5) Terima (rank 1)
  const picked = await pickCandidate(page, 1);
  log(`picked: ${picked}`);
  await page.locator("[data-testid=enter-world-popup]").waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  check("Terima offers the object to the world ('Masukkan ke dunia')", await page.getByTestId("enter-world-popup").isVisible());
  await shot("05-decision-accept");
} catch (e) {
  failure = String(e?.stack || e);
  log(`FAILURE ${failure}`);
  await shot("zz-failure");
}

await context.close(); await browser.close(); server.close();
const critical = errors.filter(e => !/favicon|Download the React DevTools/i.test(e.text));
check("no console/page errors", critical.length === 0, critical.slice(0, 3));
const pass = !failure && checks.every(c => c.ok);
writeJson(path.join(OUT, "evidence.json"), { run: RUN, result: pass ? "PASS" : "FAIL", failure, git: gitInfo(), checks, steps });
console.log(`RESULT ${pass ? "PASS" : "FAIL"} checks=${checks.filter(c => c.ok).length}/${checks.length} out=${OUT}`);
process.exit(pass ? 0 : 1);

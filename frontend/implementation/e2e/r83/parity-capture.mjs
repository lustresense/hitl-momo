#!/usr/bin/env node
/**
 * Parity reference capture script for Sandbox r8.3 (PLAN §9.2).
 *
 * Opens proto-html/r83/ pages via file:// in headless Chromium (playwright-core),
 * drives states using trusted mouse/DOM triggers matching the sandbox, enforces
 * PLAN §9.2 determinism:
 *   - awaits document.fonts.ready (Bowlby One + Hanken Grotesk)
 *   - freezes GSAP globalTimeline and Web/CSS Animations at a deterministic time T
 *   - masks camera PIP and video regions (#cam-pip, .cam-box, video, #camera.pip, #camera.on .video-wrap)
 * captures 1280x720 and 1920x1080 PNGs, writes manifest.json, and closes browser cleanly.
 *
 * Usage:
 *   node e2e/r83/parity-capture.mjs --states=cover-sleep,cover-gate,cover-ayo
 *   node e2e/r83/parity-capture.mjs --states=all --viewports=1280x720,1920x1080
 *   node e2e/r83/parity-capture.mjs --list-states
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, "../..");
const DEFAULT_SANDBOX_DIR = path.join(APP_DIR, "proto-html", "r83");
const DEFAULT_OUT_DIR = path.join(APP_DIR, "docs", "migration-r83", "parity", "sandbox-ref");

// Selectors masked on every screenshot per PLAN §9.2 & privacy rules.
const CAMERA_MASK_SELECTOR = [
  "#cam-pip",
  ".cam-box",
  "video",
  "#camera.pip",
  "#camera.on .video-wrap",
  "[data-r83-camera-mask]",
].join(", ");

const CAMERA_MASK_COLOR = "#1e2126";

function parseArgs(argv) {
  const opts = {
    states: ["cover-sleep", "cover-gate", "cover-ayo"],
    viewports: [
      { label: "1280x720", width: 1280, height: 720 },
      { label: "1920x1080", width: 1920, height: 1080 },
    ],
    outDir: DEFAULT_OUT_DIR,
    sandboxDir: DEFAULT_SANDBOX_DIR,
    freezeMs: 0,
    hideSkipbar: false,
    listStates: false,
  };

  for (const arg of argv) {
    if (arg === "--list-states") {
      opts.listStates = true;
    } else if (arg === "--hide-skipbar") {
      opts.hideSkipbar = true;
    } else if (arg.startsWith("--states=")) {
      const raw = arg.slice("--states=".length).trim();
      opts.states = raw === "all" ? Object.keys(STATE_HANDLERS) : raw.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg.startsWith("--viewports=")) {
      const raw = arg.slice("--viewports=".length).trim();
      opts.viewports = raw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .map((label) => {
          const m = /^(\d+)x(\d+)$/i.exec(label);
          if (!m) throw new Error(`Invalid viewport "${label}". Expected WxH (e.g. 1280x720).`);
          return { label: `${m[1]}x${m[2]}`, width: Number(m[1]), height: Number(m[2]) };
        });
    } else if (arg.startsWith("--out=")) {
      opts.outDir = path.resolve(APP_DIR, arg.slice("--out=".length).trim());
    } else if (arg.startsWith("--sandbox-dir=")) {
      opts.sandboxDir = path.resolve(APP_DIR, arg.slice("--sandbox-dir=".length).trim());
    } else if (arg.startsWith("--freeze-ms=")) {
      const n = Number(arg.slice("--freeze-ms=".length).trim());
      if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid --freeze-ms value: ${arg}`);
      opts.freezeMs = n;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: node e2e/r83/parity-capture.mjs [options]",
          "  --states=<list|all>         Comma-separated state IDs (default: cover-sleep,cover-gate,cover-ayo)",
          "  --viewports=<WxH,...>       Viewports (default: 1280x720,1920x1080)",
          "  --out=<dir>                 Output directory (default: docs/migration-r83/parity/sandbox-ref)",
          "  --sandbox-dir=<dir>         Sandbox root (default: proto-html/r83)",
          "  --freeze-ms=<ms>            Deterministic animation seek time in ms (default: 0)",
          "  --hide-skipbar              Hide sandbox #skipbar and #hand-legend before capture",
          "  --list-states               Print registered state IDs and exit",
        ].join("\n")
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return opts;
}

/**
 * Resolve Chromium executable:
 *   1. process.env.CHROMIUM_PATH (matching e2e/lib/harness.mjs & RUN_GUIDE.md)
 *   2. /opt/pw-browsers/chromium (Linux container fallback)
 *   3. playwright-core bundled executablePath() if installed on disk
 *   4. Local ms-playwright cache scan (handles mismatched @playwright/test vs playwright-core revisions)
 */
function resolveChromiumExecutable() {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }
  if (fs.existsSync("/opt/pw-browsers/chromium")) {
    return "/opt/pw-browsers/chromium";
  }
  try {
    const defaultExe = chromium.executablePath();
    if (defaultExe && fs.existsSync(defaultExe)) return defaultExe;
  } catch {
    /* continue to cache scan */
  }

  const cacheRoots = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== "0") {
    cacheRoots.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  }
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    cacheRoots.push(path.join(process.env.LOCALAPPDATA, "ms-playwright"));
  } else {
    cacheRoots.push(path.join(os.homedir(), ".cache", "ms-playwright"));
  }

  const candidates = [];
  for (const root of cacheRoots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      const m = /^chromium-(\d+)$/.exec(entry);
      if (!m) continue;
      const rev = Number(m[1]);
      const paths = [
        path.join(root, entry, "chrome-win64", "chrome.exe"),
        path.join(root, entry, "chrome-win", "chrome.exe"),
        path.join(root, entry, "chrome-linux", "chrome"),
        path.join(root, entry, "chrome-linux64", "chrome"),
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) candidates.push({ rev, path: p });
      }
    }
  }
  candidates.sort((a, b) => b.rev - a.rev);
  return candidates[0]?.path;
}

function sandboxUrl(sandboxDir, relPath, query = "") {
  const abs = path.join(sandboxDir, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Sandbox file not found: ${abs}`);
  }
  const url = pathToFileURL(abs).href;
  return query ? `${url}?${query}` : url;
}

async function waitFontsAndReveal(page) {
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  });
  await page
    .waitForFunction(() => !document.documentElement.classList.contains("bootwait"), null, { timeout: 5000 })
    .catch(() => {});
  // Two animation frames so placeHero/placeGate/layout settle after font metrics load.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );
}

/**
 * PLAN §9.2 determinism:
 *   1. document.fonts.ready
 *   2. gsap.globalTimeline.pause() + seek(T)
 *   3. document.getAnimations().forEach(a => { a.pause(); a.currentTime = T })
 *   4. Pause CSS animation play-state & hide dev chrome if requested
 */
async function freezePageForCapture(page, freezeMs, hideSkipbar) {
  await page.evaluate(
    async ({ tMs, hideDev }) => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      const tSec = tMs / 1000;
      if (window.gsap && window.gsap.globalTimeline) {
        window.gsap.globalTimeline.pause();
        window.gsap.globalTimeline.seek(tSec);
        if (window.gsap.ticker && typeof window.gsap.ticker.sleep === "function") {
          window.gsap.ticker.sleep();
        }
      }
      if (typeof document.getAnimations === "function") {
        for (const anim of document.getAnimations({ subtree: true })) {
          try {
            anim.pause();
            anim.currentTime = tMs;
          } catch {
            /* ignore finished or scroll-linked animations */
          }
        }
      }
      let styleEl = document.getElementById("__r83-parity-freeze-style");
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "__r83-parity-freeze-style";
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = [
        "*, *::before, *::after { animation-play-state: paused !important; transition: none !important; caret-color: transparent !important; }",
        hideDev ? "#skipbar, #hand-legend { visibility: hidden !important; }" : "",
      ].join("\n");
    },
    { tMs: freezeMs, hideDev: hideSkipbar }
  );
  // Let the browser paint the frozen state.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
}

async function openCover(page, sandboxDir) {
  await page.goto(sandboxUrl(sandboxDir, "onboarding/cam/index.html", "from=boot"), {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await waitFontsAndReveal(page);
  await page.waitForSelector("#gate.show", { state: "visible", timeout: 10000 });
  await page.evaluate(() => {
    if (typeof window.__placeHero === "function") window.__placeHero();
    if (typeof window.__placeGate === "function") window.__placeGate();
  });
  await sleep(150);
}

/**
 * State preparation handlers for sandbox r8.3.
 * Driven with trusted mouse/DOM actions matching the sandbox's own controls.
 */
const STATE_HANDLERS = {
  "cover-sleep": async (page, sandboxDir) => {
    await openCover(page, sandboxDir);
  },

  "cover-gate": async (page, sandboxDir) => {
    await openCover(page, sandboxDir);
    await page.locator("label.gate-check").click();
    await page.locator("#gate-go").click();
    await page.waitForFunction(() => document.getElementById("gate")?.dataset.state === "2", null, { timeout: 5000 });
    await sleep(200);
  },

  "cover-ayo": async (page, sandboxDir) => {
    await openCover(page, sandboxDir);
    await page.locator("label.gate-check").click();
    await page.locator("#gate-go").click();
    await page.locator("#cam-action").click();
    await page.waitForFunction(
      () => ["chat", "ready"].includes(window.__cv?.getPhase?.() || ""),
      null,
      { timeout: 25000 }
    );
    // Wait for shade (1000 ms), spot (1000 ms), and bubble (540 ms) entrance animations to commit inline styles.
    await page.waitForFunction(
      () => {
        const b = document.getElementById("bubble");
        const s = document.getElementById("shade");
        return (
          b &&
          s &&
          Number(getComputedStyle(b).opacity) >= 0.99 &&
          Number(getComputedStyle(s).opacity) >= 0.9
        );
      },
      null,
      { timeout: 5000 }
    );
    await page.evaluate(() => {
      if (window.__cv?.getPhase?.() === "chat" && window.__coverPreview?.skipDialogue) {
        window.__coverPreview.skipDialogue();
      }
    });
    await page.waitForFunction(() => window.__cv?.getPhase?.() === "ready", null, { timeout: 10000 });
    await page.waitForSelector("#confirm", { state: "visible", timeout: 10000 });
    // Dismiss transient hand legend so screenshot stays clean and deterministic.
    await page.evaluate(() => document.getElementById("hand-legend")?.classList.remove("on"));
    await sleep(250);
  },

  "cover-name-listen": async (page, sandboxDir) => {
    await STATE_HANDLERS["cover-ayo"](page, sandboxDir);
    await page.evaluate(() => {
      window.__cv?.ffwdTo?.(["inside"]);
      window.__cv?.openBookNow?.();
    });
    await page.waitForFunction(() => window.__cv?.getPhase?.() === "inside", null, { timeout: 25000 });
    await page.waitForSelector("#name-card.ready", { state: "visible", timeout: 10000 });
    // Enter visual listening state (walkie-talkie wave active).
    await page.evaluate(() => {
      const card = document.getElementById("name-card");
      const wave = document.getElementById("sound-wave");
      const ib = document.getElementById("book-inside-bubble");
      if (card) card.classList.add("is-listening");
      if (wave) wave.classList.add("is-active");
      if (ib) ib.textContent = "Aku dengerin… sebut namamu, ya. Cubitnya sudah boleh dilepas.";
      document.getElementById("hand-legend")?.classList.remove("on");
    });
    await sleep(200);
  },

  "cover-name-confirm": async (page, sandboxDir) => {
    await STATE_HANDLERS["cover-ayo"](page, sandboxDir);
    await page.evaluate(() => {
      window.__cv?.ffwdTo?.(["inside"]);
      window.__cv?.openBookNow?.();
    });
    await page.waitForFunction(() => window.__cv?.getPhase?.() === "inside", null, { timeout: 25000 });
    await page.waitForSelector("#name-card.ready", { state: "visible", timeout: 10000 });
    await page.evaluate(() => {
      window.__nameFlow?.heard?.("Rani", false);
      document.getElementById("hand-legend")?.classList.remove("on");
    });
    await page.waitForSelector("#name-confirm.on", { state: "visible", timeout: 5000 });
    // Hover near "Ya, itu namaku" so rule B highlights the right ring deterministically.
    const box = await page.locator("#name-yes").boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(200);
  },

  "kartu-1": async (page, sandboxDir) => {
    const st = encodeURIComponent(JSON.stringify({ name: "Rani", unlocked: 1, done: [] }));
    await page.goto(sandboxUrl(sandboxDir, "p2-kartu/index.html", `s=${st}`), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await waitFontsAndReveal(page);
    await page.waitForSelector(".tut-card", { state: "visible", timeout: 15000 });
    await sleep(2500);
    await page.evaluate(() => document.getElementById("hand-legend")?.classList.remove("on"));
  },

  "levels-idle": async (page, sandboxDir) => {
    const st = encodeURIComponent(JSON.stringify({ name: "Rani", unlocked: 1, done: [] }));
    await page.goto(sandboxUrl(sandboxDir, "p3-pilih-bab/index.html", `s=${st}`), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await waitFontsAndReveal(page);
    await page.waitForSelector(".bm-ribbon", { state: "visible", timeout: 15000 });
    await sleep(1200);
    const box = await page.locator(".bm-ribbon").first().boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.evaluate(() => document.getElementById("hand-legend")?.classList.remove("on"));
    await sleep(250);
  },

  "canvas-empty": async (page, sandboxDir) => {
    const st = encodeURIComponent(JSON.stringify({ name: "Rani", unlocked: 1, done: [] }));
    await page.goto(sandboxUrl(sandboxDir, "canvas1/index.html", `s=${st}`), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await waitFontsAndReveal(page);
    await page.waitForSelector("canvas", { state: "visible", timeout: 15000 });
    await sleep(1200);
    await page.evaluate(() => document.getElementById("hand-legend")?.classList.remove("on"));
  },

  "world-intro": async (page, sandboxDir) => {
    const st = encodeURIComponent(JSON.stringify({ name: "Rani", unlocked: 1, done: [] }));
    await page.goto(sandboxUrl(sandboxDir, "level1/index.html", `s=${st}`), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await waitFontsAndReveal(page);
    await sleep(1400);
    await page.evaluate(() => document.getElementById("hand-legend")?.classList.remove("on"));
  },

  "ending-init": async (page, sandboxDir) => {
    const st = encodeURIComponent(JSON.stringify({ name: "Rani", unlocked: 3, done: [1, 2, 3] }));
    await page.goto(sandboxUrl(sandboxDir, "p6-penutup/index.html", `s=${st}`), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await waitFontsAndReveal(page);
    await sleep(1500);
    await page.evaluate(() => document.getElementById("hand-legend")?.classList.remove("on"));
  },
};

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.listStates) {
    console.log(Object.keys(STATE_HANDLERS).join("\n"));
    return;
  }

  for (const s of opts.states) {
    if (!Object.prototype.hasOwnProperty.call(STATE_HANDLERS, s)) {
      throw new Error(`Unknown state "${s}". Available: ${Object.keys(STATE_HANDLERS).join(", ")}`);
    }
  }

  const exe = resolveChromiumExecutable();
  if (!exe) {
    throw new Error(
      "Chromium executable not found. Set CHROMIUM_PATH or install Playwright Chromium."
    );
  }

  fs.mkdirSync(opts.outDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: exe,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });

  const records = [];
  let hadFailure = false;

  try {
    for (const vp of opts.viewports) {
      for (const stateId of opts.states) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 1,
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (err) => errors.push({ type: "pageerror", text: String(err) }));
        page.on("console", (msg) => {
          if (msg.type() === "error" && !/^INFO: /.test(msg.text())) {
            errors.push({ type: "console", text: msg.text() });
          }
        });

        const fileName = `${stateId}__${vp.label}.png`;
        const outFile = path.join(opts.outDir, fileName);

        try {
          await STATE_HANDLERS[stateId](page, opts.sandboxDir);
          await freezePageForCapture(page, opts.freezeMs, opts.hideSkipbar);

          const maskLocator = page.locator(CAMERA_MASK_SELECTOR);
          const maskedCount = await maskLocator.evaluateAll((els) =>
            els.filter((el) => {
              const r = el.getBoundingClientRect();
              const cs = getComputedStyle(el);
              return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0;
            }).length
          );

          await page.screenshot({
            path: outFile,
            fullPage: false,
            mask: [maskLocator],
            maskColor: CAMERA_MASK_COLOR,
            animations: "allow",
          });

          const bytes = fs.statSync(outFile).size;
          const ok = errors.length === 0 && bytes > 0;
          if (!ok) hadFailure = true;

          records.push({
            state: stateId,
            viewport: vp.label,
            file: path.relative(APP_DIR, outFile).replace(/\\/g, "/"),
            bytes,
            maskedCount,
            errors,
            ok,
          });
          console.log(
            `${ok ? "PASS" : "FAIL"}  ${stateId}  ${vp.label}  ${bytes} B  masked=${maskedCount}  errors=${errors.length}`
          );
        } catch (err) {
          hadFailure = true;
          records.push({
            state: stateId,
            viewport: vp.label,
            file: path.relative(APP_DIR, outFile).replace(/\\/g, "/"),
            bytes: 0,
            maskedCount: 0,
            errors: [...errors, { type: "exception", text: String(err) }],
            ok: false,
          });
          console.error(`FAIL  ${stateId}  ${vp.label}  ${String(err)}`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const manifestPath = path.join(opts.outDir, "manifest.json");
  const manifest = {
    capturedAt: new Date().toISOString(),
    sandboxDir: path.relative(APP_DIR, opts.sandboxDir).replace(/\\/g, "/"),
    chromiumPath: exe,
    freezeMs: opts.freezeMs,
    hideSkipbar: opts.hideSkipbar,
    maskSelector: CAMERA_MASK_SELECTOR,
    maskColor: CAMERA_MASK_COLOR,
    records,
    ok: !hadFailure,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`Manifest written: ${path.relative(APP_DIR, manifestPath).replace(/\\/g, "/")}`);
  process.exit(hadFailure ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * R22B B8 Live Browser QA, Fault-Injection, B4.3 Confidence Benchmark & B2.6 ?rawrec=1 Overhead Audit.
 *
 * Serves `r22b-handstate/frontend/implementation/out` strictly on an ephemeral 127.0.0.1 port
 * inside this script process (NO deploy, NO tunnel, closes server immediately on exit).
 *
 * Verifies:
 *  1. Zero hydration/page errors across `/nui-lab`, `/nui-lab/gesture`, `/nui-lab/canvas`,
 *     `/nui-lab/canvas?preset=ok-pinch-only`, `/nui-lab/canvas?capture=1&rawrec=1&camdev=1`.
 *  2. Version badge (`data-testid="nui-lab-version-badge"`) displays `r22b`.
 *  3. B4.3 Confidence benchmark: default (`0.6/0.45/0.45`) vs low (`?mdc=0.5&mpc=0.35&mtc=0.35`),
 *     confirming `runtimeSetOptionsCalls === 0`, `mpRawHandCount`, `mpHandednessScores`,
 *     `clippedPct`, `handRoiLumaP50`, `schemaVersion === "nui-lab-bench-export/2.1"`, and `mpMs p50/p95`.
 *  4. B2.6 `?rawrec=1` overhead benchmark: measures `mpMs p50/p95` while local MediaRecorder is active.
 *  5. B8.3 / B2.1 Fault injection: verifies normal 15 FPS worker streaming does NOT flash stale banner,
 *     stalling worker responses > 500 ms displays "Kamera tersendat" WITHOUT clearing skeleton overlay
 *     pixels, and resuming responses clears the banner cleanly.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join } from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const SANDBOX = "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const OUT_DIR = "/srv/sketchbook/mediapipe-optimize/r22b-handstate/frontend/implementation/out";
const Y4M_15FPS = "/tmp/r22_real_hand_15fps.y4m";
const AUDIT_OUT = "/srv/sketchbook/mediapipe-optimize/research-can/r22b/results/r22b_live_qa_and_perf_audit.json";
const LIVE_EXPORT_OUT = "/home/deano/.gemini/antigravity-cli/brain/0d54e0c9-5239-431c-8318-eead3c4f9fe9/scratch/r22b_live_default_export.json";
const ANALYZE_R22B = "/srv/sketchbook/mediapipe-optimize/research-can/r22b/scripts/analyze_r22b.py";

process.env.PLAYWRIGHT_BROWSERS_PATH = `${SANDBOX}/pw`;
const req = createRequire(`${SANDBOX}/browser/package.json`);
const { chromium } = req("playwright");

const MIME_MAP = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".task": "application/octet-stream",
  ".bin": "application/octet-stream",
};
const GZIP_EXTS = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".wasm"]);

function resolveOutPath(urlRaw) {
  let reqPath = String(urlRaw || "/").split("?")[0];
  if (reqPath.endsWith("/") && reqPath.length > 1) reqPath = reqPath.slice(0, -1);
  if (reqPath === "" || reqPath === "/") reqPath = "/index.html";
  for (const c of [join(OUT_DIR, reqPath), join(OUT_DIR, `${reqPath}.html`), join(OUT_DIR, reqPath, "index.html")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function startLocalServer() {
  const server = createServer((reqHttp, resHttp) => {
    const cleanPath = String(reqHttp.url || "/").split("?")[0];
    const finalPath = resolveOutPath(cleanPath);
    if (!finalPath) {
      resHttp.writeHead(404, { "Content-Type": "text/plain" });
      resHttp.end(`Not Found: ${cleanPath}`);
      return;
    }
    const ext = extname(finalPath);
    const mime = MIME_MAP[ext] || "application/octet-stream";
    const raw = readFileSync(finalPath);
    const ae = String(reqHttp.headers["accept-encoding"] || "");
    const headers = { "Content-Type": mime, "Cache-Control": "public, max-age=3600" };
    let body = raw;
    if (GZIP_EXTS.has(ext) && ae.includes("gzip")) {
      body = zlib.gzipSync(raw, { level: 6 });
      headers["Content-Encoding"] = "gzip";
    }
    resHttp.writeHead(200, headers);
    resHttp.end(body);
  });
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((c) => server.close(c)),
      });
    });
    server.on("error", reject);
  });
}

function pct(arr, q) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.min(s.length - 1, lo + 1);
  return Math.round((s[lo] + (s[hi] - s[lo]) * (pos - lo)) * 100) / 100;
}

async function launchCpuContext(profileDir) {
  const args = [
    "--disable-gpu",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${Y4M_15FPS}`,
    "--no-sandbox",
  ];
  return chromium.launchPersistentContext(profileDir, {
    headless: true,
    args,
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
}

async function grantConsentAndExport(page, url, opts = {}) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  // Grant one-time consent via BenchSessionBar checkbox (clicking unmounts the checkbox cleanly)
  const consentBox = page.getByTestId("bench-bar-consent");
  if ((await consentBox.count()) > 0) {
    await consentBox.click();
    await page.waitForTimeout(200);
  }

  // Click Nyalakan kamera
  await page.getByRole("button", { name: /Nyalakan kamera/i }).click();
  // Wait for model ready & worker frames
  await page.waitForFunction(
    () => {
      const badge = document.querySelector('[data-testid="frame-sync-badge"]');
      const fid = Number(badge?.getAttribute("data-processed-frame-id") || "0");
      return fid >= 5;
    },
    null,
    { timeout: 25000 },
  );

  // Optional: enable ?rawrec=1 recording
  let rawRecStarted = false;
  let rawRecDownloadBytes = null;
  if (opts.enableRawRec) {
    const rawCb = page.getByTestId("rawrec-consent-checkbox");
    await rawCb.click();
    const rawBtn = page.getByTestId("rawrec-toggle-btn");
    await rawBtn.click();
    rawRecStarted = true;
  }

  // Run steady-state capture for ~6.5 seconds
  const runMs = opts.runMs ?? 6500;
  await page.waitForTimeout(runMs);

  if (opts.enableRawRec && rawRecStarted) {
    const [webmDl] = await Promise.all([
      page.waitForEvent("download", { timeout: 10000 }).catch(() => null),
      page.getByTestId("rawrec-toggle-btn").click(),
    ]);
    if (webmDl) {
      const p = await webmDl.path();
      if (p && existsSync(p)) rawRecDownloadBytes = statSync(p).size;
    }
    await page.waitForTimeout(300);
  }

  // Stop camera cleanly
  await page.getByRole("button", { name: /Matikan kamera/i }).click();
  await page.waitForTimeout(600);

  // Export JSON download via bench-bar-export
  const exportBtn = page.getByTestId("bench-bar-export");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), exportBtn.click()]);
  const dlPath = await download.path();
  const rawJsonText = readFileSync(dlPath, "utf8");
  const parsed = JSON.parse(rawJsonText);

  const sess = parsed.sessions?.[0];
  const trial = sess?.trials?.[0];
  const frames = sess?.frames || [];
  const mpMs = frames.map((f) => f.timing?.mpMs).filter((v) => typeof v === "number");
  const pipeMs = frames.map((f) => f.timing?.pipelineMs).filter((v) => typeof v === "number");
  const handFrames = frames.filter((f) => f.hands > 0 || f.det === "HAND").length;
  const maxRuntimeSetOptions = Math.max(0, ...frames.map((f) => Number(f.runtimeSetOptionsCalls || 0)));
  const rawHandCounts = frames.map((f) => f.mpRawHandCount).filter((v) => typeof v === "number");
  const handednessNonEmpty = frames.filter((f) => Array.isArray(f.mpHandednessScores) && f.mpHandednessScores.length > 0).length;
  const clippedSamples = frames.map((f) => f.clippedPct).filter((v) => typeof v === "number");
  const roiP50Samples = frames.map((f) => f.handRoiLumaP50).filter((v) => typeof v === "number");

  return {
    url,
    rawJsonText,
    pageErrors,
    consoleErrors,
    schema: parsed.schema,
    schemaVersion: parsed.schemaVersion,
    detectorConfig: trial?.meta?.detectorConfig ?? null,
    presetId: trial?.meta?.presetId ?? null,
    reacquirePinchPolicy: trial?.meta?.reacquirePinchPolicy ?? null,
    rawRecMeta: trial?.meta?.rawRecMeta ?? null,
    rawRecDownloadBytes,
    frames: frames.length,
    handFrames,
    mpMsP50: pct(mpMs, 0.5),
    mpMsP95: pct(mpMs, 0.95),
    pipelineMsP50: pct(pipeMs, 0.5),
    pipelineMsP95: pct(pipeMs, 0.95),
    runtimeSetOptionsCalls: maxRuntimeSetOptions,
    hasMpRawHandCount: rawHandCounts.length > 0,
    handednessScoreFrames: handednessNonEmpty,
    clippedPctP50: pct(clippedSamples, 0.5),
    handRoiLumaP50Median: pct(roiP50Samples, 0.5),
  };
}

async function runFaultInjectionStaleTest(baseUrl) {
  const profileDir = mkdtempSync("/tmp/r22b_pw_fault_");
  const ctx = await launchCpuContext(profileDir);
  try {
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    // Wrap Worker so test can pause & buffer worker->main RESULT messages (simulating a real CPU stall) and release on resume!
    await page.addInitScript(() => {
      window.__r22bStallWorker = false;
      window.__r22bQueuedResults = [];
      window.__r22bFlushStalledResults = () => {
        window.__r22bStallWorker = false;
        const q = window.__r22bQueuedResults.splice(0);
        for (const fn of q) fn();
      };
      const OrigWorker = window.Worker;
      window.Worker = class WrappedWorker extends OrigWorker {
        constructor(...args) {
          super(...args);
          const self = this;
          let userHandler = null;
          Object.defineProperty(self, "onmessage", {
            get: () => userHandler,
            set: (fn) => {
              userHandler = fn;
              super.onmessage = (ev) => {
                if (window.__r22bStallWorker && ev?.data?.type === "RESULT") {
                  window.__r22bQueuedResults.push(() => {
                    if (userHandler) userHandler.call(self, ev);
                  });
                  return;
                }
                if (userHandler) userHandler.call(self, ev);
              };
            },
          });
        }
      };
    });

    await page.goto(`${baseUrl}/nui-lab/canvas`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Nyalakan kamera/i }).click();
    await page.waitForFunction(
      () => Number(document.querySelector('[data-testid="frame-sync-badge"]')?.getAttribute("data-processed-frame-id") || "0") >= 8,
      null,
      { timeout: 25000 },
    );
    await page.waitForTimeout(800);

    const readOverlayState = async () =>
      page.evaluate(() => {
        const badge = document.querySelector('[data-testid="stale-frame-badge"]');
        const overlay = document.querySelector("canvas.nui-lab__overlay");
        let nonZeroAlpha = 0;
        if (overlay instanceof HTMLCanvasElement && overlay.width > 0 && overlay.height > 0) {
          const c2d = overlay.getContext("2d");
          if (c2d) {
            const data = c2d.getImageData(0, 0, overlay.width, overlay.height).data;
            for (let i = 3; i < data.length; i += 4) {
              if (data[i] > 0) nonZeroAlpha++;
            }
          }
        }
        return {
          bannerVisible: Boolean(badge),
          bannerText: badge?.textContent?.trim() || null,
          bannerStalled: badge?.getAttribute("data-stalled") === "true",
          overlayDataStale: overlay?.getAttribute("data-stale") === "true",
          overlayNonZeroAlphaPixels: nonZeroAlpha,
        };
      });

    const beforeStall = await readOverlayState();

    // Inject 750 ms worker stall
    await page.evaluate(() => {
      window.__r22bStallWorker = true;
    });
    await page.waitForTimeout(750);
    const duringStall = await readOverlayState();

    // Resume worker results (flush stalled response) and confirm recovery
    await page.evaluate(() => {
      window.__r22bFlushStalledResults();
    });
    await page.waitForTimeout(750);
    const afterRecovery = await readOverlayState();

    await page.getByRole("button", { name: /Matikan kamera/i }).click();
    return {
      pageErrors,
      beforeStall,
      duringStall,
      afterRecovery,
      pass:
        pageErrors.length === 0 &&
        beforeStall.bannerVisible === false &&
        beforeStall.overlayNonZeroAlphaPixels > 0 &&
        duringStall.bannerVisible === true &&
        duringStall.bannerStalled === true &&
        String(duringStall.bannerText).includes("Kamera tersendat") &&
        duringStall.overlayNonZeroAlphaPixels > 0 && // CRITICAL B2.1: Skeleton NOT cleared!
        afterRecovery.bannerVisible === false,
    };
  } finally {
    await ctx.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
}

async function main() {
  if (!existsSync(OUT_DIR)) throw new Error(`Missing build output: ${OUT_DIR}`);
  if (!existsSync(Y4M_15FPS)) throw new Error(`Missing fake webcam file: ${Y4M_15FPS}`);

  const srv = await startLocalServer();
  const report = {
    schema: "r22b-live-qa-audit/1",
    timestampIso: new Date().toISOString(),
    fakeCamFile: Y4M_15FPS,
    routesAndHydration: [],
    confidenceBenchmark: {},
    rawRecOverheadBenchmark: {},
    faultInjectionB21: {},
    analyzerLiveCheck: {},
  };

  try {
    // 1. Routes, Hydration & UI Flags audit
    {
      const pdir = mkdtempSync("/tmp/r22b_pw_routes_");
      const ctx = await launchCpuContext(pdir);
      try {
        const routes = [
          "/nui-lab",
          "/nui-lab/gesture",
          "/nui-lab/canvas",
          "/nui-lab/canvas?preset=ok-pinch-only",
          "/nui-lab/canvas?capture=1&rawrec=1&camdev=1",
        ];
        for (const r of routes) {
          const page = await ctx.newPage();
          const pageErrors = [];
          const hydrationErrors = [];
          page.on("pageerror", (e) => pageErrors.push(String(e)));
          page.on("console", (msg) => {
            if (msg.type() === "error" && /hydrat|418|423|425/i.test(msg.text())) {
              hydrationErrors.push(msg.text());
            }
          });
          await page.goto(`${srv.url}${r}`, { waitUntil: "networkidle" });
          await page.waitForTimeout(300);
          const checks = await page.evaluate(() => ({
            versionBadge: document.querySelector('[data-testid="nui-lab-version-badge"]')?.textContent?.trim() || null,
            presetValue: document.querySelector('[data-testid="canvas-preset-selector"]')?.value || null,
            hasCompositionalHud: Boolean(document.querySelector('[data-testid="lab-compositional-hud"]')),
            hasCapturePanel: Boolean(document.querySelector('[data-testid="guided-capture-panel"]')),
            hasRawRecPanel: Boolean(document.querySelector('[data-testid="rawrec-panel"]')),
            hasCamDevPanel: Boolean(document.querySelector('[data-testid="camdev-panel"]')),
          }));
          report.routesAndHydration.push({ route: r, pageErrors, hydrationErrors, checks });
          await page.close();
        }
      } finally {
        await ctx.close();
        rmSync(pdir, { recursive: true, force: true });
      }
    }

    // 2. B4.3 Default confidence (0.6/0.45/0.45) benchmark
    {
      const pdir = mkdtempSync("/tmp/r22b_pw_default_");
      const ctx = await launchCpuContext(pdir);
      try {
        const page = await ctx.newPage();
        const res = await grantConsentAndExport(page, `${srv.url}/nui-lab/canvas`, { runMs: 6500 });
        writeFileSync(LIVE_EXPORT_OUT, res.rawJsonText, "utf8");
        const { rawJsonText: _omit, ...summary } = res;
        report.confidenceBenchmark.default_060_045_045 = summary;
      } finally {
        await ctx.close();
        rmSync(pdir, { recursive: true, force: true });
      }
    }

    // 3. B4.3 Low confidence (?mdc=0.5&mpc=0.35&mtc=0.35) benchmark
    {
      const pdir = mkdtempSync("/tmp/r22b_pw_lowconf_");
      const ctx = await launchCpuContext(pdir);
      try {
        const page = await ctx.newPage();
        const res = await grantConsentAndExport(page, `${srv.url}/nui-lab/canvas?mdc=0.5&mpc=0.35&mtc=0.35`, { runMs: 6500 });
        const { rawJsonText: _omit, ...summary } = res;
        report.confidenceBenchmark.low_050_035_035 = summary;
      } finally {
        await ctx.close();
        rmSync(pdir, { recursive: true, force: true });
      }
    }

    // 4. B2.6 ?rawrec=1 CPU overhead benchmark
    {
      const pdir = mkdtempSync("/tmp/r22b_pw_rawrec_");
      const ctx = await launchCpuContext(pdir);
      try {
        const page = await ctx.newPage();
        const res = await grantConsentAndExport(page, `${srv.url}/nui-lab/canvas?rawrec=1`, {
          runMs: 6500,
          enableRawRec: true,
        });
        const { rawJsonText: _omit, ...summary } = res;
        report.rawRecOverheadBenchmark = {
          withRawRec: summary,
          deltaMpMsP50:
            summary.mpMsP50 !== null && report.confidenceBenchmark.default_060_045_045.mpMsP50 !== null
              ? Math.round((summary.mpMsP50 - report.confidenceBenchmark.default_060_045_045.mpMsP50) * 100) / 100
              : null,
          deltaMpMsP95:
            summary.mpMsP95 !== null && report.confidenceBenchmark.default_060_045_045.mpMsP95 !== null
              ? Math.round((summary.mpMsP95 - report.confidenceBenchmark.default_060_045_045.mpMsP95) * 100) / 100
              : null,
        };
      } finally {
        await ctx.close();
        rmSync(pdir, { recursive: true, force: true });
      }
    }

    // 5. B8.3 / B2.1 Fault injection stale banner & overlay preservation
    report.faultInjectionB21 = await runFaultInjectionStaleTest(srv.url);

    // 6. Run analyze_r22b.py on the real live browser export
    const pyOut = execFileSync("python3", ["-I", ANALYZE_R22B, LIVE_EXPORT_OUT, "--json"], { encoding: "utf8" });
    report.analyzerLiveCheck = JSON.parse(pyOut);

    mkdirSync("/srv/sketchbook/mediapipe-optimize/research-can/r22b/results", { recursive: true });
    writeFileSync(AUDIT_OUT, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await srv.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

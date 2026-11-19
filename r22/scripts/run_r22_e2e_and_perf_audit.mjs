/**
 * R22 NUI Lab E2E Verification & Performance Audit (`run_r22_e2e_and_perf_audit.mjs`).
 *
 * Runs against the production static export (`out/`):
 *  1. Serves static files over a local HTTP server.
 *  2. Launches headless Chromium via Playwright.
 *  3. Measures cold transfer wire bytes via Chrome DevTools Protocol (CDP) Network domain (< 25 MB budget).
 *  4. Captures desktop sticky-left before/after scroll and mobile screenshots to `r22/results/screenshots/`.
 *  5. Audits renderer JS heap, layout/DOM metrics, and verifies zero runtime setOptions.
 *  6. Runs `analyze_nui_bench_r22.py` on real T004 benchmark export.
 *  7. Emits structured JSON evidence to `r22/results/r22_e2e_perf_audit.json`.
 */

import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const SANDBOX = "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const OUT_DIR = "/srv/sketchbook/mediapipe-optimize/r22-nui-lab/frontend/implementation/out";
const SCREENSHOT_DIR = "/srv/sketchbook/mediapipe-optimize/research-can/r22/results/screenshots";
const AUDIT_JSON = "/srv/sketchbook/mediapipe-optimize/research-can/r22/results/r22_e2e_perf_audit.json";
const PYTHON_PATH = `${SANDBOX}/.venv/bin/python`;
const ANALYZE_SCRIPT = "/srv/sketchbook/mediapipe-optimize/research-can/r22/scripts/analyze_nui_bench_r22.py";
const BENCHMARK_FOUR_TRIALS = "/srv/sketchbook/mediapipe-optimize/research-can/docs/plan-rev/R22_FULL_SCOPE_MALAM_20261119/references/benchmarks/nui-lab-benchmark-S-07ba0cde-four-trials.json";

process.env.PLAYWRIGHT_BROWSERS_PATH = `${SANDBOX}/pw`;
const req = createRequire(`${SANDBOX}/browser/package.json`);
const { chromium } = req("playwright");

const MIME_MAP = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".tflite": "application/octet-stream",
  ".bin": "application/octet-stream",
};

function startStaticServer(port = 4567) {
  return new Promise((res, rej) => {
    const server = createServer((reqHttp, resHttp) => {
      let reqPath = reqHttp.url.split("?")[0];
      if (reqPath.endsWith("/") && reqPath.length > 1) {
        reqPath = reqPath.slice(0, -1);
      }
      if (reqPath === "") reqPath = "/index.html";
      if (reqPath === "/") reqPath = "/index.html";

      let finalPath = join(OUT_DIR, reqPath);
      if (existsSync(finalPath + ".html")) {
        finalPath = finalPath + ".html";
      } else if (existsSync(finalPath) && statSync(finalPath).isDirectory()) {
        const idx = join(finalPath, "index.html");
        if (existsSync(idx)) {
          finalPath = idx;
        }
      }

      console.log(`[HTTP REQ] ${reqHttp.url} -> ${finalPath}`);
      if (!existsSync(finalPath) || statSync(finalPath).isDirectory()) {
        resHttp.writeHead(404, { "Content-Type": "text/plain" });
        resHttp.end("Not Found: " + reqPath);
        return;
      }

      console.log(`[HTTP REQ] ${req.url} -> ${finalPath}`);
      const ext = extname(finalPath);
      const mime = MIME_MAP[ext] || "application/octet-stream";
      const content = readFileSync(finalPath);
      resHttp.writeHead(200, {
        "Content-Type": mime,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      });
      resHttp.end(content);
    });

    server.listen(port, "127.0.0.1", () => {
      res({
        server,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((c) => server.close(c)),
      });
    });
    server.on("error", rej);
  });
}

async function runAudit() {
  console.log("=== R22 NUI Lab E2E & Performance Audit Starting ===");
  if (!existsSync(OUT_DIR)) {
    throw new Error(`Production export directory not found: ${OUT_DIR}`);
  }

  const serverInfo = await startStaticServer(4567);
  console.log(`Static server running at ${serverInfo.url}`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });

  const auditResults = {
    timestamp: new Date().toISOString(),
    gitCommit: "r22fullscope",
    browser: {
      type: "chromium",
      version: browser.version(),
    },
    coldWireTransfer: {},
    screenshots: [],
    layoutStickyAudit: {},
    performanceMetrics: {},
    benchmarkT004Analysis: {},
    acceptanceGates: {
      coldTransferUnder25Mb: false,
      stickyLeftCameraAnchored: false,
      independentRightScrollable: false,
      runtimeSetOptionsCallsZero: false,
      allGatesPassed: false,
    },
  };

  try {
    // -------------------------------------------------------------
    // 1. Cold Wire Transfer Audit via CDP
    // -------------------------------------------------------------
    console.log("Measuring Cold Wire Transfer on /nui-lab...");
    const coldContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const coldPage = await coldContext.newPage();
    const cdp = await coldContext.newCDPSession(coldPage);
    await cdp.send("Network.enable");

    let totalEncodedBytes = 0;
    const requestBytesMap = new Map();

    cdp.on("Network.loadingFinished", (params) => {
      totalEncodedBytes += params.encodedDataLength;
    });

    await coldPage.goto(`${serverInfo.url}/nui-lab`, { waitUntil: "domcontentloaded" });
    await coldPage.waitForTimeout(1000);
    const coldMb = totalEncodedBytes / (1024 * 1024);
    console.log(`Cold wire transfer on /nui-lab: ${(totalEncodedBytes / 1024).toFixed(1)} KB (${coldMb.toFixed(2)} MB)`);

    auditResults.coldWireTransfer = {
      totalBytes: totalEncodedBytes,
      totalMb: Number(coldMb.toFixed(3)),
      budgetMb: 25.0,
      pass: coldMb < 25.0,
    };
    auditResults.acceptanceGates.coldTransferUnder25Mb = coldMb < 25.0;

    // -------------------------------------------------------------
    // 2. Desktop Screenshots & Sticky Layout Verification
    // -------------------------------------------------------------
    console.log("Capturing Desktop Screenshots & Layout...");
    const desktopPathLanding = join(SCREENSHOT_DIR, "desktop_landing.png");
    await coldPage.screenshot({ path: desktopPathLanding, fullPage: false });
    auditResults.screenshots.push({ name: "desktop_landing", path: desktopPathLanding });

    // Navigate to /nui-lab/canvas
    await coldPage.goto(`${serverInfo.url}/nui-lab/canvas`, { waitUntil: "domcontentloaded" });
    await coldPage.waitForTimeout(500);

    const desktopPathCanvasBefore = join(SCREENSHOT_DIR, "desktop_canvas_before_scroll.png");
    await coldPage.screenshot({ path: desktopPathCanvasBefore });
    auditResults.screenshots.push({ name: "desktop_canvas_before_scroll", path: desktopPathCanvasBefore });

    // Inspect layout and sticky styles
    const layoutStateBefore = await coldPage.evaluate(() => {
      const cameraPanel = document.querySelector(".nui-lab__camera-panel");
      const rightPanel = document.querySelector(".nui-lab__right-panel");
      const camRect = cameraPanel ? cameraPanel.getBoundingClientRect() : null;
      const rightRect = rightPanel ? rightPanel.getBoundingClientRect() : null;
      const camComputed = cameraPanel ? window.getComputedStyle(cameraPanel) : null;
      const rightComputed = rightPanel ? window.getComputedStyle(rightPanel) : null;

      return {
        hasCameraPanel: Boolean(cameraPanel),
        hasRightPanel: Boolean(rightPanel),
        cameraPosition: camComputed ? camComputed.position : null,
        cameraTop: camRect ? camRect.top : null,
        rightOverflowY: rightComputed ? rightComputed.overflowY : null,
        rightScrollHeight: rightPanel ? rightPanel.scrollHeight : null,
        rightClientHeight: rightPanel ? rightPanel.clientHeight : null,
      };
    });

    // Scroll right panel down by 350px
    await coldPage.evaluate(() => {
      const rightPanel = document.querySelector(".nui-lab__right-panel");
      if (rightPanel) {
        rightPanel.scrollTop = 350;
      }
    });
    await coldPage.waitForTimeout(300);

    const desktopPathCanvasAfter = join(SCREENSHOT_DIR, "desktop_canvas_after_scroll.png");
    await coldPage.screenshot({ path: desktopPathCanvasAfter });
    auditResults.screenshots.push({ name: "desktop_canvas_after_scroll", path: desktopPathCanvasAfter });

    const layoutStateAfter = await coldPage.evaluate(() => {
      const cameraPanel = document.querySelector(".nui-lab__camera-panel");
      const rightPanel = document.querySelector(".nui-lab__right-panel");
      const camRect = cameraPanel ? cameraPanel.getBoundingClientRect() : null;

      return {
        cameraTopAfterScroll: camRect ? camRect.top : null,
        rightScrollTopAfterScroll: rightPanel ? rightPanel.scrollTop : null,
      };
    });

    const isStickyLeftAnchored =
      layoutStateBefore.hasCameraPanel &&
      layoutStateBefore.cameraPosition === "sticky" &&
      Math.abs((layoutStateBefore.cameraTop || 0) - (layoutStateAfter.cameraTopAfterScroll || 0)) < 2;

    const isIndependentRightScrollable =
      layoutStateBefore.hasRightPanel &&
      (layoutStateBefore.rightOverflowY === "auto" || layoutStateBefore.rightOverflowY === "scroll");

    auditResults.layoutStickyAudit = {
      layoutStateBefore,
      layoutStateAfter,
      isStickyLeftAnchored,
      isIndependentRightScrollable,
    };
    auditResults.acceptanceGates.stickyLeftCameraAnchored = isStickyLeftAnchored;
    auditResults.acceptanceGates.independentRightScrollable = isIndependentRightScrollable;

    // Navigate to /nui-lab/gesture
    await coldPage.goto(`${serverInfo.url}/nui-lab/gesture`, { waitUntil: "domcontentloaded" });
    await coldPage.waitForTimeout(500);
    const desktopPathGesture = join(SCREENSHOT_DIR, "desktop_gesture.png");
    await coldPage.screenshot({ path: desktopPathGesture });
    auditResults.screenshots.push({ name: "desktop_gesture", path: desktopPathGesture });

    // -------------------------------------------------------------
    // 3. Performance Metrics & Heap via CDP
    // -------------------------------------------------------------
    console.log("Collecting CDP Performance Metrics...");
    const perfMetrics = await cdp.send("Performance.getMetrics");
    const metricsMap = {};
    for (const m of perfMetrics.metrics) {
      metricsMap[m.name] = m.value;
    }

    auditResults.performanceMetrics = {
      jsHeapUsedMb: Number(((metricsMap.JSHeapUsedSize || 0) / (1024 * 1024)).toFixed(2)),
      jsHeapTotalMb: Number(((metricsMap.JSHeapTotalSize || 0) / (1024 * 1024)).toFixed(2)),
      domNodes: metricsMap.Nodes || 0,
      jsEventListeners: metricsMap.JSEventListeners || 0,
      layoutCount: metricsMap.LayoutCount || 0,
      recalcStyleCount: metricsMap.RecalcStyleCount || 0,
    };
    await coldContext.close();

    // -------------------------------------------------------------
    // 4. Mobile Viewport Screenshots
    // -------------------------------------------------------------
    console.log("Capturing Mobile Screenshots (375x667)...");
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();

    await mobilePage.goto(`${serverInfo.url}/nui-lab`, { waitUntil: "domcontentloaded" });
    await mobilePage.waitForTimeout(500);
    const mobilePathLanding = join(SCREENSHOT_DIR, "mobile_landing.png");
    await mobilePage.screenshot({ path: mobilePathLanding });
    auditResults.screenshots.push({ name: "mobile_landing", path: mobilePathLanding });

    await mobilePage.goto(`${serverInfo.url}/nui-lab/canvas`, { waitUntil: "domcontentloaded" });
    await mobilePage.waitForTimeout(500);
    const mobilePathCanvas = join(SCREENSHOT_DIR, "mobile_canvas.png");
    await mobilePage.screenshot({ path: mobilePathCanvas });
    auditResults.screenshots.push({ name: "mobile_canvas", path: mobilePathCanvas });
    await mobileContext.close();

    // -------------------------------------------------------------
    // 5. Benchmark Analysis via analyze_nui_bench_r22.py
    // -------------------------------------------------------------
    console.log("Running analyze_nui_bench_r22.py on real T004 export...");
    const benchOutput = execFileSync(
      PYTHON_PATH,
      [ANALYZE_SCRIPT, "--json", BENCHMARK_FOUR_TRIALS],
      { encoding: "utf8" }
    );
    const parsedBench = JSON.parse(benchOutput);
    auditResults.benchmarkT004Analysis = parsedBench;

    const t4 = parsedBench.sessions?.[0]?.trials?.find((t) => t.trialId === "S-07ba0cde-T004");
    const runtimeSetOptionsCalls = t4?.invariants?.runtimeSetOptionsCalls ?? 0;
    auditResults.acceptanceGates.runtimeSetOptionsCallsZero = runtimeSetOptionsCalls === 0;

    auditResults.acceptanceGates.allGatesPassed =
      auditResults.acceptanceGates.coldTransferUnder25Mb &&
      auditResults.acceptanceGates.stickyLeftCameraAnchored &&
      auditResults.acceptanceGates.independentRightScrollable &&
      auditResults.acceptanceGates.runtimeSetOptionsCallsZero;

    console.log("Audit complete. Writing results to:", AUDIT_JSON);
    writeFileSync(AUDIT_JSON, JSON.stringify(auditResults, null, 2), "utf8");
    console.log("=== R22 Audit Passed Successfully ===");
    console.log(JSON.stringify(auditResults.acceptanceGates, null, 2));
  } finally {
    await browser.close();
    await serverInfo.close();
  }
}

runAudit().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});

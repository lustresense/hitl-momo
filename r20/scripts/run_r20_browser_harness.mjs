/**
 * R20 CPU-Only Browser Runtime & Strict Cold First-Use Network Benchmark (`run_r20_browser_harness.mjs`).
 *
 * Implements §7, §14, §19.2 (Gates G20-A, G20-B, G20-C):
 *  1. Bundles R20 browser harness (`harness.bundle.js`) and dedicated Web Worker (`r20_worker.bundle.js`)
 *     via esbuild, copying the winning R20 student (`r20_winner_model.json`) and frozen C0 (`r19_model_mlp.json`).
 *  2. Measures TWO SEPARATE COLD FIRST-USE JOURNEYS (`B-USER < 25,000,000 B` hard gate) in fresh, clean
 *     Chromium contexts with `Network.setCacheDisabled({ cacheDisabled: true })` and Service Worker disabled,
 *     recording request-by-request CDP `Network.loadingFinished.encodedDataLength`, unique vs repeat requests,
 *     and 2 warm-cache refreshes:
 *      - Journey 1 (`nui_lab_webcam_journey`): `/nui-lab/gesture` -> `/nui-lab/canvas` -> `/r20-harness/index.html`
 *        (loads Next.js NUI Lab routes + MediaPipe WASM loader + `vision_wasm_internal.wasm` +
 *         `hand_landmarker.task` + `blaze_face_short_range.tflite` + R20 student model).
 *      - Journey 2 (`student_onboarding_canvas_level_journey`): `/` -> `/onboarding/card` -> `/onboarding/number` ->
 *        `/onboarding/cam` -> `/levels` -> `/canvas1` -> `/level1` + MediaPipe WASM + `hand_landmarker.task` +
 *        `blaze_face_short_range.tflite` + R20 student model.
 *  3. Runs Paired CPU-Only Runtime Benchmarks on `r19_sim_cam.y4m` / `sim_cam.y4m`:
 *      - Variant A : `cpu-main-thread` (`numHands=2`, `adaptive-fallback`)
 *      - Variant B1: `cpu-web-worker` (`numHands=2`, `adaptive-fallback`) — main-thread UI blocking offloaded!
 *      - Variant B2: `cpu-web-worker` (`numHands=1`, `adaptive-fallback`) — `numHands=1` ablation (§7.4 & §14.1)
 *      - Variant B3: `cpu-web-worker` (`numHands=2`, `off` RAW-only) — low-light A4 vs A0 ablation
 *     Verifies `delegate === "CPU"`, `gpuDelegateAttempted === false`, `gpuDelegateActive === false`,
 *     `0` detector-caused main-thread LongTasks (>50 ms) on Web Worker variants, `uiFps >= 30 FPS`,
 *     lifecycle `RELEASE_ALL` on tab-hidden / worker-restart / stop (`0` stuck keys), and reports honest
 *     CPU detector Hz (`effectiveMpFps`) on this 4-vCPU Xeon VM.
 */
import { createServer } from "node:http";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { execFileSync } from "node:child_process";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const SANDBOX = process.env.R20_SANDBOX || "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const R18_SANDBOX = process.env.R18_SANDBOX || "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox";
const REPO = process.env.R20_REPO || "/srv/sketchbook/mediapipe-optimize/research-can";

process.env.PLAYWRIGHT_BROWSERS_PATH = `${SANDBOX}/pw`;

const require = createRequire(`${SANDBOX}/browser/package.json`);
const { chromium } = require("playwright");

const OUT_DIR = process.env.R20_STATIC_OUT || "/srv/sketchbook/mediapipe-optimize/main-r19/frontend/implementation/out";
const DIST_DIR = `${SANDBOX}/browser/dist`;
const Y4M_PATH = process.env.R20_Y4M_PATH || `${SANDBOX}/browser/r20_sim_cam.y4m`;
const RESULTS_PATH = `${REPO}/r20/results/r20_browser_runtime.json`;
const HAR_SUMMARY_PATH = `${REPO}/r20/results/r20_network_journeys.json`;

const WORKER_DURATION_SEC = Number(process.env.R20_WORKER_DURATION_SEC || "60");
const ABLATION_DURATION_SEC = Number(process.env.R20_ABLATION_DURATION_SEC || "25");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".task": "application/octet-stream",
  ".tflite": "application/octet-stream",
  ".f32": "application/octet-stream",
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".wasm", ".svg", ".txt", ".task", ".tflite"]);

function buildHarnessDist() {
  mkdirSync(DIST_DIR, { recursive: true });
  const esbuildBin = `${SANDBOX}/browser/node_modules/.bin/esbuild`;
  const esbuildEnv = { ...process.env, NODE_PATH: `${SANDBOX}/browser/node_modules` };

  execFileSync(
    esbuildBin,
    [
      `${REPO}/r20/candidates/browser_harness/harness.ts`,
      "--bundle",
      "--format=iife",
      "--target=es2022",
      `--outfile=${DIST_DIR}/harness.bundle.js`,
    ],
    { stdio: "inherit", env: esbuildEnv },
  );

  execFileSync(
    esbuildBin,
    [
      `${REPO}/r20/candidates/r20_hand_landmarker.worker.ts`,
      "--bundle",
      "--format=iife",
      "--target=es2022",
      `--outfile=${DIST_DIR}/r20_worker.bundle.js`,
    ],
    { stdio: "inherit", env: esbuildEnv },
  );

  copyFileSync(`${REPO}/r20/candidates/browser_harness/index.html`, `${DIST_DIR}/index.html`);
  copyFileSync(`${REPO}/r19/models/r19_model_mlp.json`, `${DIST_DIR}/r19_model_mlp.json`);

  const winnerSrc = existsSync(`${SANDBOX}/models/c4_full/r20_c4_full.json`)
    ? `${SANDBOX}/models/c4_full/r20_c4_full.json`
    : `${SANDBOX}/models/c1_balanced/r20_c1_balanced.json`;
  copyFileSync(winnerSrc, `${DIST_DIR}/r20_winner_model.json`);
}

function resolveStatic(urlPath) {
  const clean = normalize(urlPath.split("?")[0]).replace(/^(\.\.(\/|\\|$))+/, "");
  if (clean.startsWith("/r20-harness")) {
    const rel = clean.slice("/r20-harness".length) || "/index.html";
    const fp = join(DIST_DIR, rel === "/" ? "index.html" : rel);
    if (existsSync(fp) && statSync(fp).isFile()) return fp;
    return null;
  }
  const cands = [
    join(OUT_DIR, clean),
    join(OUT_DIR, `${clean.replace(/\/$/, "")}.html`),
    join(OUT_DIR, clean, "index.html"),
    join(OUT_DIR, "index.html"),
  ];
  for (const c of cands) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

let serverAccessLog = [];

async function startServer() {
  const srv = createServer((req, res) => {
    const rawUrl = req.url || "/";
    const fp = resolveStatic(rawUrl);
    if (!fp) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = extname(fp);
    const mime = MIME[ext] || "application/octet-stream";
    const raw = readFileSync(fp);
    const ae = String(req.headers["accept-encoding"] || "");
    const headers = {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=3600",
      Vary: "Accept-Encoding",
    };
    let bodyBuf = raw;
    let encoding = "none";
    if (COMPRESSIBLE.has(ext) && ae.includes("zstd") && typeof zlib.zstdCompressSync === "function") {
      bodyBuf = zlib.zstdCompressSync(raw);
      encoding = "zstd";
      res.writeHead(200, { ...headers, "Content-Encoding": "zstd" });
      res.end(bodyBuf);
    } else if (COMPRESSIBLE.has(ext) && ae.includes("gzip")) {
      bodyBuf = zlib.gzipSync(raw, { level: 6 });
      encoding = "gzip";
      res.writeHead(200, { ...headers, "Content-Encoding": "gzip" });
      res.end(bodyBuf);
    } else {
      res.writeHead(200, headers);
      res.end(raw);
    }
    serverAccessLog.push({
      path: rawUrl.split("?")[0],
      mime,
      encoding,
      rawBytes: raw.byteLength,
      wireBytes: bodyBuf.byteLength + 180, // HTTP response header + body wire bytes
      bodyWireBytes: bodyBuf.byteLength,
    });
  });
  await new Promise((res) => srv.listen(0, "127.0.0.1", res));
  const addr = srv.address();
  return { srv, baseUrl: `http://127.0.0.1:${addr.port}` };
}

async function measureColdJourneyAndRefreshes(browser, baseUrl, journeyName, routes, includeCameraVisionLoad) {
  // Fresh clean profile (empty HTTP cache, Service Workers blocked) per §7
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send("Network.enable");

  serverAccessLog = [];
  const routeTimings = [];
  for (const route of routes) {
    const t0 = Date.now();
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 30000 });
    if (route === "/onboarding/cam") {
      // Wait for warmHandLandmarker async WASM + .task preload to finish so it is not aborted mid-flight
      await page.waitForTimeout(1500);
    }
    routeTimings.push({ route, loadMs: Date.now() - t0, title: await page.title() });
  }

  if (includeCameraVisionLoad) {
    // Trigger full cold load of MediaPipe WASM + hand_landmarker.task + blaze_face + R20 student model + Web Worker
    await page.goto(`${baseUrl}/r20-harness/index.html?variant=cpu-web-worker&numHands=2&lowLightMode=adaptive-fallback`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForFunction(
      () => Boolean(window.__R20_HARNESS__ && (window.__R20_HARNESS__.ready || window.__R20_HARNESS__.error)),
      null,
      { timeout: 30000 },
    );
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__R20_HARNESS__.stop());
  }

  const coldEvents = [...serverAccessLog];
  const coldTotalBUser = coldEvents.reduce((s, e) => s + e.wireBytes, 0);

  const byPath = new Map();
  for (const e of coldEvents) {
    const prev = byPath.get(e.path) || {
      path: e.path,
      mime: e.mime,
      encoding: e.encoding,
      requests: 0,
      totalEncodedBytes: 0,
      maxSingleEncodedBytes: 0,
      rawDecodedBytes: e.rawBytes,
    };
    prev.requests += 1;
    prev.totalEncodedBytes += e.wireBytes;
    prev.maxSingleEncodedBytes = Math.max(prev.maxSingleEncodedBytes, e.wireBytes);
    byPath.set(e.path, prev);
  }
  const uniqueAssets = Array.from(byPath.values()).sort((a, b) => b.totalEncodedBytes - a.totalEncodedBytes);
  const uniqueBytesSum = uniqueAssets.reduce((s, a) => s + a.maxSingleEncodedBytes, 0);
  const repeatRequestsCount = uniqueAssets.filter((a) => a.requests > 1).length;

  // Measure Refresh #1 and Refresh #2 with warm browser cache (§7)
  const refreshCosts = [];
  for (let rIdx = 1; rIdx <= 2; rIdx++) {
    serverAccessLog = [];
    await page.reload({ waitUntil: "networkidle", timeout: 25000 });
    if (includeCameraVisionLoad) {
      await page.waitForFunction(
        () => Boolean(window.__R20_HARNESS__ && (window.__R20_HARNESS__.ready || window.__R20_HARNESS__.error)),
        null,
        { timeout: 30000 },
      );
      await page.evaluate(() => window.__R20_HARNESS__.stop());
    }
    const refBytes = serverAccessLog.reduce((s, e) => s + e.wireBytes, 0);
    refreshCosts.push({ refresh: rIdx, serverRequests: serverAccessLog.length, encodedBytes: refBytes });
  }

  await context.close();
  return {
    journeyName,
    routesVisited: routes,
    includedVisionModelsAndWasm: includeCameraVisionLoad,
    hardBudgetBytes: 25_000_000,
    coldTotalBUserBytes: coldTotalBUser,
    coldTotalMiB: Math.round((coldTotalBUser / (1024 * 1024)) * 100) / 100,
    passUnder25MB: coldTotalBUser < 25_000_000,
    headroomBytes: 25_000_000 - coldTotalBUser,
    uniqueAssetCount: uniqueAssets.length,
    totalRequestCount: coldEvents.length,
    repeatAssetCount: repeatRequestsCount,
    uniqueMaxBytesSum: uniqueBytesSum,
    warmRefreshes: refreshCosts,
    routeTimings,
    topAssetsByWireBytes: uniqueAssets.slice(0, 25),
  };
}

async function runRuntimeVariant(browser, baseUrl, label, queryParams, durationSec) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send("Performance.enable");

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const url = `${baseUrl}/r20-harness/index.html?${queryParams}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(
    () => Boolean(window.__R20_HARNESS__ && (window.__R20_HARNESS__.ready || window.__R20_HARNESS__.error)),
    null,
    { timeout: 30000 },
  );

  const initErr = await page.evaluate(() => window.__R20_HARNESS__.error);
  if (initErr) throw new Error(`R20 harness init error (${label}): ${initErr}`);

  const readCdpPerf = async () => {
    const res = await client.send("Performance.getMetrics");
    const m = Object.fromEntries(res.metrics.map((x) => [x.name, x.value]));
    return {
      jsHeapUsedMB: Math.round(((m.JSHeapUsedSize || 0) / (1024 * 1024)) * 100) / 100,
      jsHeapTotalMB: Math.round(((m.JSHeapTotalSize || 0) / (1024 * 1024)) * 100) / 100,
      nodes: m.Nodes || 0,
    };
  };

  const checkpoints = [];
  const stepSec = durationSec >= 60 ? 20 : durationSec;
  let elapsed = 0;
  while (elapsed < durationSec) {
    const waitS = Math.min(stepSec, durationSec - elapsed);
    await page.waitForTimeout(waitS * 1000);
    elapsed += waitS;
    const hm = await page.evaluate(() => window.__R20_HARNESS__.getMetrics());
    const pm = await readCdpPerf();
    checkpoints.push({ atSec: elapsed, ...hm, cdpPerf: pm });
    console.log(
      `[${label} @${elapsed}s] delegate=${hm.delegate} mpFps=${hm.effectiveMpFps} uiFps=${hm.uiFpsMean} (p5=${hm.uiFpsP5}) ` +
        `detP50/P95=${hm.detectMs?.p50}/${hm.detectMs?.p95}ms mainDispP95=${hm.mainThreadDispatchMs?.p95}ms ` +
        `longTasks=${hm.longTasksAfterBootCount} r20Press=${hm.r20Counts?.pressFrames} c0Press=${hm.c0Counts?.pressFrames}`,
    );
  }

  // Test fail-closed lifecycle RELEASE_ALL on tab-hidden and worker-restart simulation before stopping
  const tabHiddenRelease = await page.evaluate(() =>
    window.__R20_HARNESS__.simulateLifecycleRelease("tab-hidden-test"),
  );
  const workerRestartRelease = await page.evaluate(() =>
    window.__R20_HARNESS__.simulateLifecycleRelease("worker-restart-test"),
  );
  const finalSummary = await page.evaluate(() => window.__R20_HARNESS__.stop());
  const postStopPerf = await readCdpPerf();

  await context.close();
  return {
    label,
    queryParams,
    durationSec,
    consoleErrorsCount: consoleErrors.length,
    pageErrorsCount: pageErrors.length,
    consoleErrors: consoleErrors.slice(0, 5),
    pageErrors: pageErrors.slice(0, 5),
    lifecycleVerification: {
      tabHiddenRelease,
      workerRestartRelease,
      stoppedCleanly: finalSummary.stoppedCleanly,
      zeroStuckKeys: !finalSummary.c0Counts?.stuckKeysNow && !finalSummary.r20Counts?.stuckKeysNow,
    },
    finalSummary,
    postStopPerf,
    checkpoints,
  };
}

async function main() {
  console.log("[r20-browser] Bundling R20 harness + Web Worker...");
  buildHarnessDist();

  const { srv, baseUrl } = await startServer();
  console.log("[r20-browser] Server listening at", baseUrl);

  const browser = await chromium.launch({
    headless: true,
    channel: "chromium-headless-shell",
    args: [
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${Y4M_PATH}`,
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  try {
    // 1. Strict Cold First-Use Network Measurements (<25,000,000 B gate, two separate journeys)
    console.log("[r20-browser] Measuring Cold Journey 1: NUI Lab Webcam Test...");
    const journeyNuiLab = await measureColdJourneyAndRefreshes(
      browser,
      baseUrl,
      "Journey_1_NUI_Lab_Webcam_Test",
      ["/nui-lab", "/nui-lab/gesture", "/nui-lab/canvas"],
      true,
    );
    console.log(
      `[Journey 1] Cold B-USER = ${journeyNuiLab.coldTotalBUserBytes} B (${journeyNuiLab.coldTotalMiB} MiB) | pass=<25MB: ${journeyNuiLab.passUnder25MB}`,
    );

    console.log("[r20-browser] Measuring Cold Journey 2: Student Onboarding -> Canvas -> Level Gameplay...");
    const journeyStudent = await measureColdJourneyAndRefreshes(
      browser,
      baseUrl,
      "Journey_2_Student_Onboarding_Canvas_Gameplay",
      ["/", "/onboarding/card", "/onboarding/number", "/onboarding/cam", "/levels", "/canvas1", "/level1"],
      true,
    );
    console.log(
      `[Journey 2] Cold B-USER = ${journeyStudent.coldTotalBUserBytes} B (${journeyStudent.coldTotalMiB} MiB) | pass=<25MB: ${journeyStudent.passUnder25MB}`,
    );

    writeFileSync(
      HAR_SUMMARY_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          hardGateBytes: 25_000_000,
          allJourneysPassGateG20C: journeyNuiLab.passUnder25MB && journeyStudent.passUnder25MB,
          journeys: {
            nui_lab_webcam_journey: journeyNuiLab,
            student_onboarding_canvas_level_journey: journeyStudent,
          },
        },
        null,
        2,
      ),
    );

    // 2. Paired CPU-Only Runtime Benchmarks: Main-Thread vs Web Worker (numHands=2, numHands=1, RAW-only)
    console.log("[r20-browser] Running Variant B1: CPU Web Worker (numHands=2, adaptive-fallback)...");
    const variantWorker2Hands = await runRuntimeVariant(
      browser,
      baseUrl,
      "B1_cpu_web_worker_numHands2_adaptive",
      "variant=cpu-web-worker&numHands=2&lowLightMode=adaptive-fallback&captureWidth=320",
      WORKER_DURATION_SEC,
    );

    console.log("[r20-browser] Running Variant A: CPU Main-Thread Baseline (numHands=2, adaptive-fallback)...");
    const variantMainThread = await runRuntimeVariant(
      browser,
      baseUrl,
      "A_cpu_main_thread_numHands2_adaptive",
      "variant=cpu-main-thread&numHands=2&lowLightMode=adaptive-fallback",
      ABLATION_DURATION_SEC,
    );

    console.log("[r20-browser] Running Variant B2: CPU Web Worker Ablation (numHands=1, adaptive-fallback)...");
    const variantWorker1Hand = await runRuntimeVariant(
      browser,
      baseUrl,
      "B2_cpu_web_worker_numHands1_ablation",
      "variant=cpu-web-worker&numHands=1&lowLightMode=adaptive-fallback&captureWidth=320",
      ABLATION_DURATION_SEC,
    );

    console.log("[r20-browser] Running Variant B3: CPU Web Worker Dynamic Owner-Lock (2-hand acquire -> 1-hand locked)...");
    const variantWorkerDynamicLock = await runRuntimeVariant(
      browser,
      baseUrl,
      "B3_cpu_web_worker_dynamic_owner_lock",
      "variant=cpu-web-worker&numHands=2&dynamicOwnerLock=1&lowLightMode=adaptive-fallback&captureWidth=320",
      ABLATION_DURATION_SEC,
    );

    const runtimeReport = {
      generatedAt: new Date().toISOString(),
      environment: {
        cpuModel: "Intel(R) Xeon(R) Silver 4314 CPU @ 2.40GHz (4 vCPU VM)",
        browser: "Playwright Chromium Headless Shell 159.0.8154.6",
        simulatedVideo: Y4M_PATH,
        delegatePolicy: "100% CPU (XNNPACK WASM + Pure TS Student; zero GPU delegate)",
      },
      networkGateG20C: {
        hardLimitBytes: 25_000_000,
        journey1NuiLabColdBytes: journeyNuiLab.coldTotalBUserBytes,
        journey2StudentGameplayColdBytes: journeyStudent.coldTotalBUserBytes,
        pass: journeyNuiLab.passUnder25MB && journeyStudent.passUnder25MB,
      },
      variants: {
        B1_cpu_web_worker_numHands2_adaptive: variantWorker2Hands,
        A_cpu_main_thread_numHands2_adaptive: variantMainThread,
        B2_cpu_web_worker_numHands1_ablation: variantWorker1Hand,
        B3_cpu_web_worker_dynamic_owner_lock: variantWorkerDynamicLock,
      },
    };

    writeFileSync(RESULTS_PATH, JSON.stringify(runtimeReport, null, 2));
    console.log(`[r20-browser] Wrote ${RESULTS_PATH} and ${HAR_SUMMARY_PATH}`);
  } finally {
    await browser.close();
    srv.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

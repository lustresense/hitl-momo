/**
 * R22 NUI Lab Full-Journey E2E, CDP Network & Real Unique detectHz Audit (`run_r22_e2e_and_perf_audit.mjs`).
 *
 * Fixes all defects from the earlier landing-only script:
 *  1. Serves production static export (`out/`) with BOTH realistic production `gzip` AND raw uncompressed
 *     measurements, logging exact server bytes per path/encoding for reconciliation against CDP.
 *  2. Attaches CDP to BOTH the main page AND every Web Worker target (`Target.setAutoAttach flatten:false`)
 *     with `Network.setCacheDisabled({ cacheDisabled: true })` so MediaPipe WASM (`vision_wasm_internal.wasm`),
 *     `hand_landmarker.task`, `r20-c4-model.json`, worker JS, page JS/CSS/fonts/SVGs are ALL measured via real
 *     CDP `Network.loadingFinished.encodedDataLength`!
 *  3. Streams real hand video (`r20_sim_cam.y4m`) through Chromium fake webcam (`--use-file-for-fake-video-capture`)
 *     on `--disable-gpu` CPU-only mode:
 *      - Journey 1 (Cold Full NUI Lab Journey, gzip): `/nui-lab` -> grant consent -> `/nui-lab/canvas` ->
 *        click "Nyalakan kamera" -> wait for CPU worker + MediaPipe HandLandmarker + R20 C4 loaded & >= 6s
 *        of live unique-frame inference -> verify sticky left camera scroll -> capture screenshots ->
 *        navigate to `/nui-lab/gesture` -> click "Nyalakan kamera" -> run >= 5s of live inference ->
 *        inspect real exported IndexedDB JSON (`runtimeSetOptionsCalls`, `uniqueCaptureFps`, real `detectHz`,
 *        `mpMs p50/p95`, `framesSkippedDuplicate`, `handFrames`, `uiFps`, `contentSha256`)!
 *      - Journey 2 (Cold Full NUI Lab Journey, uncompressed / `Content-Encoding: identity`) for worst-case
 *        deployment wire measurement vs the 25,000,000 B hard budget!
 *      - Journey 3 (Mobile 375x667) responsive screenshots.
 *  4. Also measures live OS `/proc/<pid>/smaps_rollup` renderer RSS/PSS and CDP JS heap during active worker
 *     execution and after camera stop.
 *  5. Runs `analyze_nui_bench_r22.py` on both the Owner four-trials benchmark AND the newly generated live
 *     R22 browser export JSON.
 */

import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join } from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const SANDBOX = "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const OUT_DIR = "/srv/sketchbook/mediapipe-optimize/r22-nui-lab/frontend/implementation/out";
const Y4M_15FPS = "/tmp/r22_real_hand_15fps.y4m";
const Y4M_30FPS = "/tmp/r22_real_hand_30fps.y4m";
const SCREENSHOT_DIR = "/srv/sketchbook/mediapipe-optimize/research-can/r22/results/screenshots";
const AUDIT_JSON = "/srv/sketchbook/mediapipe-optimize/research-can/r22/results/r22_e2e_perf_audit.json";
const LIVE_EXPORT_JSON = "/srv/sketchbook/mediapipe-optimize/research-can/r22/results/r22_live_fake_cam_export.json";
const PYTHON_PATH = `${SANDBOX}/.venv/bin/python`;
const ANALYZE_SCRIPT = "/srv/sketchbook/mediapipe-optimize/research-can/r22/scripts/analyze_nui_bench_r22.py";
const BENCHMARK_FOUR_TRIALS =
  "/srv/sketchbook/mediapipe-optimize/research-can/docs/plan-rev/R22_FULL_SCOPE_MALAM_20261119/references/benchmarks/nui-lab-benchmark-S-07ba0cde-four-trials.json";

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
  ".tflite": "application/octet-stream",
  ".bin": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
};
const GZIP_EXTS = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".wasm", ".txt"]);

function resolveOutPath(urlRaw) {
  let reqPath = String(urlRaw || "/").split("?")[0];
  if (reqPath.endsWith("/") && reqPath.length > 1) reqPath = reqPath.slice(0, -1);
  if (reqPath === "" || reqPath === "/") reqPath = "/index.html";
  const candidates = [
    join(OUT_DIR, reqPath),
    join(OUT_DIR, `${reqPath}.html`),
    join(OUT_DIR, reqPath, "index.html"),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function startStaticServer(compressionMode = "gzip", cacheControl = "public, max-age=3600") {
  let accessLog = [];
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
    const headers = {
      "Content-Type": mime,
      "Cache-Control": cacheControl,
      Vary: "Accept-Encoding",
    };
    let body = raw;
    let encoding = "none";
    if (compressionMode === "gzip" && GZIP_EXTS.has(ext) && ae.includes("gzip")) {
      body = zlib.gzipSync(raw, { level: 6 });
      encoding = "gzip";
      headers["Content-Encoding"] = "gzip";
    }
    accessLog.push({
      path: cleanPath,
      ext,
      mime,
      encoding,
      rawBytes: raw.byteLength,
      bodyWireBytes: body.byteLength,
    });
    resHttp.writeHead(200, headers);
    resHttp.end(body);
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        resetLog: () => {
          accessLog = [];
        },
        getLog: () => [...accessLog],
        close: () => new Promise((c) => server.close(c)),
      });
    });
    server.on("error", reject);
  });
}

function readRendererMemMb(profileDir) {
  try {
    const out = execFileSync("ps", ["-eo", "pid,ppid,rss,args"], { encoding: "utf-8" });
    const rows = out
      .trim()
      .split("\n")
      .slice(1)
      .map((ln) => {
        const m = ln.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
        return m ? { pid: Number(m[1]), ppid: Number(m[2]), rssKb: Number(m[3]), args: m[4] } : null;
      })
      .filter(Boolean);
    const root = rows.find((r) => r.args.includes(profileDir));
    if (!root) return null;
    const owned = new Set([root.pid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of rows) {
        if (!owned.has(r.pid) && owned.has(r.ppid)) {
          owned.add(r.pid);
          changed = true;
        }
      }
    }
    const procs = [];
    for (const r of rows) {
      if (owned.has(r.pid) && r.args.includes("type=renderer")) {
        let pssKb = r.rssKb;
        let privDirtyKb = 0;
        try {
          const sr = readFileSync(`/proc/${r.pid}/smaps_rollup`, "utf-8");
          const pm = sr.match(/Pss:\s+(\d+)\s+kB/);
          if (pm) pssKb = Number(pm[1]);
          const dm = sr.match(/Private_Dirty:\s+(\d+)\s+kB/);
          if (dm) privDirtyKb = Number(dm[1]);
        } catch {
          /* ignore */
        }
        procs.push({
          pid: r.pid,
          rssMb: Math.round((r.rssKb / 1024) * 100) / 100,
          pssMb: Math.round((pssKb / 1024) * 100) / 100,
          privateDirtyMb: Math.round((privDirtyKb / 1024) * 100) / 100,
        });
      }
    }
    return {
      rendererCount: procs.length,
      totalRssMb: Math.round(procs.reduce((s, p) => s + p.rssMb, 0) * 100) / 100,
      totalPssMb: Math.round(procs.reduce((s, p) => s + p.pssMb, 0) * 100) / 100,
      totalPrivateDirtyMb: Math.round(procs.reduce((s, p) => s + p.privateDirtyMb, 0) * 100) / 100,
    };
  } catch {
    return null;
  }
}

async function attachCdpNetworkAllTargets(context, page, disableCache = false) {
  const pageCdp = await context.newCDPSession(page);
  await pageCdp.send("Network.enable");
  if (disableCache) {
    await pageCdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  }
  await pageCdp.send("Performance.enable");
  await pageCdp.send("Target.setAutoAttach", {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: false,
  });

  const pending = new Map();
  const cdpRecords = [];
  const attachedTargets = [];

  pageCdp.on("Network.requestWillBeSent", (ev) => {
    pending.set(`page:${ev.requestId}`, { url: ev.request?.url || "", target: "page" });
  });
  pageCdp.on("Network.loadingFinished", (ev) => {
    const rec = pending.get(`page:${ev.requestId}`);
    pending.delete(`page:${ev.requestId}`);
    if (!rec?.url || rec.url.startsWith("data:") || rec.url.startsWith("blob:")) return;
    cdpRecords.push({
      path: new URL(rec.url).pathname,
      target: "page",
      cdpEncodedBytes: ev.encodedDataLength || 0,
    });
  });

  pageCdp.on("Target.attachedToTarget", async (ev) => {
    const sid = ev.sessionId;
    const tType = ev.targetInfo?.type || "worker";
    const tUrl = ev.targetInfo?.url || "";
    attachedTargets.push({ type: tType, url: tUrl.slice(0, 120) });
    try {
      await pageCdp.send("Target.sendMessageToTarget", {
        sessionId: sid,
        message: JSON.stringify({ id: 1, method: "Network.enable", params: {} }),
      });
      if (disableCache) {
        await pageCdp.send("Target.sendMessageToTarget", {
          sessionId: sid,
          message: JSON.stringify({ id: 2, method: "Network.setCacheDisabled", params: { cacheDisabled: true } }),
        });
      }
    } catch {
      /* ignore */
    }
  });

  pageCdp.on("Target.receivedMessageFromTarget", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.message);
    } catch {
      return;
    }
    if (!msg.method) return;
    const p = msg.params || {};
    if (msg.method === "Network.requestWillBeSent") {
      pending.set(`${ev.sessionId}:${p.requestId}`, { url: p.request?.url || "", target: "worker" });
    } else if (msg.method === "Network.loadingFinished") {
      const rec = pending.get(`${ev.sessionId}:${p.requestId}`);
      pending.delete(`${ev.sessionId}:${p.requestId}`);
      if (!rec?.url || rec.url.startsWith("data:") || rec.url.startsWith("blob:")) return;
      cdpRecords.push({
        path: new URL(rec.url).pathname,
        target: "worker",
        cdpEncodedBytes: p.encodedDataLength || 0,
      });
    }
  });

  return { pageCdp, cdpRecords, attachedTargets };
}

function summarizeNetwork(cdpRecords, serverLog) {
  const cdpTotal = cdpRecords.reduce((s, r) => s + r.cdpEncodedBytes, 0);
  const cdpPageBytes = cdpRecords.filter((r) => r.target === "page").reduce((s, r) => s + r.cdpEncodedBytes, 0);
  const cdpWorkerBytes = cdpRecords.filter((r) => r.target === "worker").reduce((s, r) => s + r.cdpEncodedBytes, 0);
  const serverWireTotal = serverLog.reduce((s, r) => s + r.bodyWireBytes, 0);
  const serverRawTotal = serverLog.reduce((s, r) => s + r.rawBytes, 0);

  const byPathCdp = new Map();
  for (const r of cdpRecords) {
    const prev = byPathCdp.get(r.path) || { path: r.path, target: r.target, requests: 0, cdpEncodedBytes: 0 };
    prev.requests += 1;
    prev.cdpEncodedBytes += r.cdpEncodedBytes;
    byPathCdp.set(r.path, prev);
  }
  const byPathSrv = new Map();
  for (const r of serverLog) {
    const prev = byPathSrv.get(r.path) || {
      path: r.path,
      encoding: r.encoding,
      requests: 0,
      rawBytes: 0,
      bodyWireBytes: 0,
    };
    prev.requests += 1;
    prev.rawBytes += r.rawBytes;
    prev.bodyWireBytes += r.bodyWireBytes;
    byPathSrv.set(r.path, prev);
  }

  const allPaths = new Set([...byPathCdp.keys(), ...byPathSrv.keys()]);
  const assets = [...allPaths]
    .map((p) => ({
      path: p,
      cdpTarget: byPathCdp.get(p)?.target ?? "untracked-in-cdp",
      cdpRequests: byPathCdp.get(p)?.requests ?? 0,
      cdpEncodedBytes: byPathCdp.get(p)?.cdpEncodedBytes ?? 0,
      serverRequests: byPathSrv.get(p)?.requests ?? 0,
      serverEncoding: byPathSrv.get(p)?.encoding ?? "none",
      serverBodyWireBytes: byPathSrv.get(p)?.bodyWireBytes ?? 0,
      serverRawBytes: byPathSrv.get(p)?.rawBytes ?? 0,
    }))
    .sort((a, b) => Math.max(b.cdpEncodedBytes, b.serverBodyWireBytes) - Math.max(a.cdpEncodedBytes, a.serverBodyWireBytes));

  return {
    cdpTotalBytes: cdpTotal,
    cdpTotalMb: Number((cdpTotal / (1024 * 1024)).toFixed(3)),
    cdpPageBytes,
    cdpWorkerBytes,
    serverBodyWireBytes: serverWireTotal,
    serverBodyWireMb: Number((serverWireTotal / (1024 * 1024)).toFixed(3)),
    serverRawUncompressedBytes: serverRawTotal,
    serverRawUncompressedMb: Number((serverRawTotal / (1024 * 1024)).toFixed(3)),
    reconciliationDiffBytes: cdpTotal - serverWireTotal,
    hasWasmLoaded: assets.some((a) => a.path.endsWith(".wasm") && (a.cdpRequests > 0 || a.serverRequests > 0)),
    hasHandLandmarkerTaskLoaded: assets.some((a) => a.path.includes("hand_landmarker.task") && (a.cdpRequests > 0 || a.serverRequests > 0)),
    hasStudentModelLoaded: assets.some((a) => a.path.includes("r20-c4-model.json") && (a.cdpRequests > 0 || a.serverRequests > 0)),
    topAssets: assets.slice(0, 25),
  };
}

async function waitForActiveInference(page, minProcessedFrames, label, maxWaitMs = 25000) {
  await page.waitForSelector('[data-testid="r19-model-status"][data-state="ready"]', { timeout: 20000 });
  const tStart = Date.now();
  let firstProc = null;
  let firstProcT = null;
  let lastProc = 0;
  let lastCap = 0;

  while (Date.now() - tStart < maxWaitMs) {
    const info = await page.evaluate(() => {
      const sync = document.querySelector('[data-testid="frame-sync-badge"]');
      const kpis = document.querySelector('[data-testid="camera-perf-kpis"]')?.textContent || "";
      const err = document.querySelector('[data-testid="camera-error-status"]')?.textContent || "";
      return {
        cap: Number(sync?.getAttribute("data-capture-frame-id") || 0),
        proc: Number(sync?.getAttribute("data-processed-frame-id") || 0),
        ageMs: Number(sync?.getAttribute("data-frame-age-ms") || -1),
        kpis,
        err,
      };
    });
    if (info.proc > 0 && firstProc === null) {
      firstProc = info.proc;
      firstProcT = Date.now();
    }
    lastProc = info.proc;
    lastCap = info.cap;
    if (firstProc !== null && lastProc - firstProc >= minProcessedFrames && Date.now() - firstProcT >= 4500) {
      break;
    }
    await page.waitForTimeout(250);
  }
  const elapsedSec = firstProcT ? Math.max(0.001, (Date.now() - firstProcT) / 1000) : 0;
  const deltaCaptureIds = firstProc !== null ? Math.max(0, lastProc - firstProc) : 0;
  const captureIdRateHz = elapsedSec > 0 ? Number((deltaCaptureIds / elapsedSec).toFixed(2)) : 0;

  // Expand diagnostics and read live DOM KPIs (including REAL unique detectHz from worker/analyzer!)
  const domDiag = await page.evaluate(() => {
    const det = document.querySelector('[data-testid="nui-lab-diagnostics-details"]');
    if (det) det.setAttribute("open", "true");
    const pairs = {};
    document.querySelectorAll(".nui-lab__stat").forEach((el) => {
      const k = el.querySelector("dt")?.textContent?.trim();
      const v = el.querySelector("dd")?.textContent?.trim();
      if (k && v) pairs[k] = v;
    });
    return {
      lockStatus: document.querySelector('[data-testid="lab-lock-status"]')?.getAttribute("data-lock") || null,
      modelState: document.querySelector('[data-testid="r19-model-status"]')?.getAttribute("data-state") || null,
      stats: pairs,
    };
  });

  const parseNum = (s) => {
    const m = String(s || "").match(/([0-9]+(?:\.[0-9]+)?)/);
    return m ? Number(m[1]) : null;
  };
  const domDetectHz = parseNum(domDiag.stats["Deteksi (Hz)"]);
  const domUniqueCaptureFps = parseNum(domDiag.stats["FPS Kamera Unik"]);
  const domUiFps = parseNum(domDiag.stats["UI FPS"]);

  console.log(
    `[${label}] captureId=${lastCap} (captureRate=${captureIdRateHz} Hz, domUniqueCaptureFps=${domUniqueCaptureFps}) ` +
      `realDetectHz=${domDetectHz} Hz uiFps=${domUiFps} detP50/P95=${domDiag.stats["Waktu deteksi p50 / p95"]} ` +
      `lock=${domDiag.lockStatus} setOptionsRuntime=${domDiag.stats["setOptions() runtime"]}`,
  );
  return {
    firstProcessedCaptureFrameId: firstProc,
    lastProcessedCaptureFrameId: lastProc,
    lastCaptureFrameId: lastCap,
    measurementWindowSec: Number(elapsedSec.toFixed(2)),
    captureIdRateHz,
    domUniqueCaptureFps,
    domRealDetectHz: domDetectHz,
    domUiFps,
    domStats: domDiag.stats,
    lockStatus: domDiag.lockStatus,
  };
}

async function runFullColdJourney(
  compressionMode,
  captureScreenshotsAndExport,
  y4mPath = Y4M_15FPS,
  cacheControl = "public, max-age=3600",
  disableCache = false,
) {
  const server = await startStaticServer(compressionMode, cacheControl);
  const profileDir = mkdtempSync(`/tmp/r22_e2e_${compressionMode}_`);
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    serviceWorkers: "block",
    acceptDownloads: true,
    args: [
      "--disable-gpu",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-precise-memory-info",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-video-capture=${y4mPath}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const consoleErrors = [];
  const pageErrors = [];

  try {
    const page = context.pages()[0] || (await context.newPage());
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push({ url: page.url(), text: m.text() });
    });
    page.on("pageerror", (e) => pageErrors.push({ url: page.url(), error: String(e) }));

    const { pageCdp, cdpRecords, attachedTargets } = await attachCdpNetworkAllTargets(context, page, disableCache);

    // Step 1: Cold Landing (/nui-lab)
    await page.goto(`${server.url}/nui-lab`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(400);
    const phaseLanding = summarizeNetwork(cdpRecords, server.getLog());

    if (captureScreenshotsAndExport) {
      await page.screenshot({ path: join(SCREENSHOT_DIR, "desktop_landing.png") });
    }

    // Grant numeric telemetry consent once on landing
    await page.click('[data-testid="bench-consent"]');
    await page.waitForTimeout(200);

    // Step 2: Click Coba Canvas -> activate fake camera -> wait for full WASM + HandLandmarker + R20 C4 + inference
    await page.click('[data-testid="cta-try-canvas"]');
    await page.waitForURL("**/nui-lab/canvas**", { timeout: 15000 });
    await page.waitForSelector('button:has-text("Nyalakan kamera")', { timeout: 15000 });
    await page.click('button:has-text("Nyalakan kamera")');

    const canvasLive = await waitForActiveInference(page, 30, `canvas-${compressionMode}`, 30000);
    const phaseAfterCanvas = summarizeNetwork(cdpRecords, server.getLog());
    const memDuringCanvas = readRendererMemMb(profileDir);

    // Sticky-left camera layout check while camera is ACTUALLY LIVE
    let layoutStickyAudit = null;
    if (captureScreenshotsAndExport) {
      await page.screenshot({ path: join(SCREENSHOT_DIR, "desktop_canvas_before_scroll.png") });
      const before = await page.evaluate(() => {
        const cam = document.querySelector(".nui-lab__camera-panel");
        const right = document.querySelector(".nui-lab__right-panel");
        const camR = cam?.getBoundingClientRect();
        return {
          hasCameraPanel: Boolean(cam),
          hasRightPanel: Boolean(right),
          cameraPosition: cam ? getComputedStyle(cam).position : null,
          cameraTop: camR ? Number(camR.top.toFixed(2)) : null,
          rightOverflowY: right ? getComputedStyle(right).overflowY : null,
          rightScrollHeight: right ? right.scrollHeight : null,
          rightClientHeight: right ? right.clientHeight : null,
        };
      });
      await page.evaluate(() => {
        const right = document.querySelector(".nui-lab__right-panel");
        if (right) right.scrollTop = 350;
      });
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(SCREENSHOT_DIR, "desktop_canvas_after_scroll.png") });
      const after = await page.evaluate(() => {
        const cam = document.querySelector(".nui-lab__camera-panel");
        const right = document.querySelector(".nui-lab__right-panel");
        const camR = cam?.getBoundingClientRect();
        return {
          cameraTopAfterScroll: camR ? Number(camR.top.toFixed(2)) : null,
          rightScrollTopAfterScroll: right ? right.scrollTop : null,
        };
      });
      layoutStickyAudit = {
        before,
        after,
        isStickyLeftAnchored:
          before.hasCameraPanel &&
          before.cameraPosition === "sticky" &&
          Math.abs((before.cameraTop ?? 0) - (after.cameraTopAfterScroll ?? 0)) < 2,
        isIndependentRightScrollable:
          before.hasRightPanel &&
          (before.rightOverflowY === "auto" || before.rightOverflowY === "scroll") &&
          (after.rightScrollTopAfterScroll ?? 0) > 100,
      };
    }

    // Stop camera cleanly on Canvas before switching route
    await page.click('button:has-text("Matikan kamera")');
    await page.waitForTimeout(400);

    // Step 3: Navigate to /nui-lab/gesture -> activate fake camera -> run live inference
    await page.click('a[href="/nui-lab/gesture"]');
    await page.waitForURL("**/nui-lab/gesture**", { timeout: 15000 });
    await page.waitForSelector('button:has-text("Nyalakan kamera")', { timeout: 15000 });
    await page.click('button:has-text("Nyalakan kamera")');

    const gestureLive = await waitForActiveInference(page, 25, `gesture-${compressionMode}`, 30000);
    if (captureScreenshotsAndExport) {
      await page.screenshot({ path: join(SCREENSHOT_DIR, "desktop_gesture.png") });
    }
    const phaseAfterCanvasAndGesture = summarizeNetwork(cdpRecords, server.getLog());

    // Stop camera on Gesture
    await page.click('button:has-text("Matikan kamera")');
    await page.waitForTimeout(500);
    const memAfterStop = readRendererMemMb(profileDir);

    const perfMetrics = await pageCdp.send("Performance.getMetrics");
    const perfMap = Object.fromEntries(perfMetrics.metrics.map((m) => [m.name, m.value]));

    // Trigger real browser 1-click JSON export and inspect exported v2 benchmark JSON!
    let liveExportSummary = null;
    if (captureScreenshotsAndExport || y4mPath === Y4M_30FPS) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 15000 }),
        page.click('[data-testid="bench-bar-export"]'),
      ]);
      const dlPath = await download.path();
      const rawJson = readFileSync(dlPath, "utf8");
      if (captureScreenshotsAndExport) writeFileSync(LIVE_EXPORT_JSON, rawJson, "utf8");
      const parsed = JSON.parse(rawJson);
      const sess0 = parsed.sessions?.[0];
      liveExportSummary = {
        schema: parsed.schema,
        exportBytes: Buffer.byteLength(rawJson, "utf8"),
        contentSha256: parsed.contentSha256,
        sessionId: sess0?.meta?.sessionId,
        trialCount: sess0?.trials?.length ?? 0,
        trials: (sess0?.trials ?? []).map((t) => ({
          trialId: t.meta.trialId,
          route: t.meta.route,
          endReason: t.meta.endReason,
          frames: t.summary.frames,
          handFrames: t.summary.handFrames,
          detectorMissFrames: t.summary.detectorMissFrames,
          rawNoHandRate: t.summary.rawNoHandRate,
          activeWindowMissRate: t.summary.activeWindowMissRate,
          detectHzMean: t.summary.detectHzMean,
          uniqueCaptureFpsP50: t.summary.freshness?.uniqueCaptureFps?.p50 ?? null,
          duplicateFramesSkipped: t.summary.duplicateFrameSkippedCount ?? null,
          runtimeSetOptionsCalls: t.summary.runtimeSetOptionsCalls ?? null,
          mpMs: t.summary.mpMs,
          preMs: t.summary.preMs,
          pipelineMs: t.summary.pipelineMs,
          independentGroundTruthAvailable: t.summary.independentGroundTruthAvailable,
          falsePressFrames: t.summary.gesture?.falsePressFrames,
        })),
      };
    }

    return {
      compressionMode,
      attachedTargets,
      consoleErrors,
      pageErrors,
      networkPhases: {
        landingOnly: phaseLanding,
        afterCanvasWithCameraAndModels: phaseAfterCanvas,
        fullJourneyLandingCanvasGesture: phaseAfterCanvasAndGesture,
      },
      liveInference: {
        canvas: canvasLive,
        gesture: gestureLive,
      },
      layoutStickyAudit,
      memory: {
        duringCanvasWorkerActive: memDuringCanvas,
        afterCameraStop: memAfterStop,
        pageCdpJsHeapUsedMb: Number(((perfMap.JSHeapUsedSize || 0) / (1024 * 1024)).toFixed(2)),
        pageCdpJsHeapTotalMb: Number(((perfMap.JSHeapTotalSize || 0) / (1024 * 1024)).toFixed(2)),
        domNodes: perfMap.Nodes || 0,
      },
      liveExportSummary,
    };
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
    await server.close();
  }
}

async function captureMobileScreenshots() {
  const server = await startStaticServer("gzip");
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await mobileContext.newPage();
    await page.goto(`${server.url}/nui-lab`, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(SCREENSHOT_DIR, "mobile_landing.png") });
    const landingOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

    await page.goto(`${server.url}/nui-lab/canvas`, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(SCREENSHOT_DIR, "mobile_canvas.png") });
    const canvasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    await mobileContext.close();
    return { landingHorizontalOverflow: landingOverflow, canvasHorizontalOverflow: canvasOverflow };
  } finally {
    await browser.close();
    await server.close();
  }
}

async function runAudit() {
  console.log("=== R22 Full-Journey E2E, CDP Network & Real Unique detectHz Audit ===");
  if (!existsSync(OUT_DIR)) throw new Error(`Missing production export: ${OUT_DIR}`);
  if (!existsSync(Y4M_15FPS) || !existsSync(Y4M_30FPS)) {
    throw new Error(`Missing real-hand Y4M fake webcam videos: ${Y4M_15FPS} / ${Y4M_30FPS}`);
  }
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const gitCommit = execFileSync("git", ["-C", "/srv/sketchbook/mediapipe-optimize/r22-nui-lab", "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();

  console.log("--- 1. Cold Full Journey (gzip, standard HTTP cache from fresh empty profile, 15 FPS real-hand video) ---");
  const journeyGzip = await runFullColdJourney("gzip", true, Y4M_15FPS, "public, max-age=3600", false);

  console.log("--- 2. Cold Full Journey (uncompressed raw identity, standard HTTP cache from fresh empty profile, 15 FPS) ---");
  const journeyRaw = await runFullColdJourney("none", false, Y4M_15FPS, "public, max-age=3600", false);

  console.log("--- 3. Live 30 FPS Real-Hand Throughput Ceiling Check (gzip, fixed-2 CPU worker) ---");
  const journey30fps = await runFullColdJourney("gzip", false, Y4M_30FPS, "public, max-age=3600", false);

  console.log("--- 4. Mobile Responsive Screenshots (375x667) ---");
  const mobileAudit = await captureMobileScreenshots();

  console.log("--- 5. Running analyze_nui_bench_r22.py on live R22 export AND Owner four-trials ---");
  const liveAnalysis = JSON.parse(
    execFileSync(PYTHON_PATH, [ANALYZE_SCRIPT, "--json", LIVE_EXPORT_JSON], { encoding: "utf8" }),
  );
  const ownerFourTrialsAnalysis = JSON.parse(
    execFileSync(PYTHON_PATH, [ANALYZE_SCRIPT, "--json", BENCHMARK_FOUR_TRIALS], { encoding: "utf8" }),
  );

  const gzipFull = journeyGzip.networkPhases.fullJourneyLandingCanvasGesture;
  const rawFull = journeyRaw.networkPhases.fullJourneyLandingCanvasGesture;
  const liveTrials = journeyGzip.liveExportSummary?.trials ?? [];
  const liveTrials30 = journey30fps.liveExportSummary?.trials ?? [];
  const allLiveSetOptionsZero =
    liveTrials.length >= 2 && liveTrials.every((t) => t.runtimeSetOptionsCalls === 0);

  const t15Canvas = liveTrials.find((t) => t.route === "canvas");
  const t15Gesture = liveTrials.find((t) => t.route === "gesture");
  const t30Canvas = liveTrials30.find((t) => t.route === "canvas");
  const t30Gesture = liveTrials30.find((t) => t.route === "gesture");

  const auditResults = {
    schema: "r22-e2e-full-journey-audit/3",
    timestamp: new Date().toISOString(),
    gitCommit,
    gitBranch: "r22-nui-lab",
    fakeWebcamVideos: {
      cam15fps: { path: Y4M_15FPS, resolution: "640x360", fps: 15, sourceImage: "hg5g_0000.jpg (real hand)" },
      cam30fps: { path: Y4M_30FPS, resolution: "640x360", fps: 30, sourceImage: "hg5g_0000.jpg (real hand)" },
    },
    journeyGzip,
    journeyUncompressed: {
      networkPhases: journeyRaw.networkPhases,
      liveInference: journeyRaw.liveInference,
      consoleErrors: journeyRaw.consoleErrors,
      pageErrors: journeyRaw.pageErrors,
    },
    journey30fpsRealHand: {
      liveInference: journey30fps.liveInference,
      liveExportSummary: journey30fps.liveExportSummary,
      consoleErrors: journey30fps.consoleErrors,
      pageErrors: journey30fps.pageErrors,
    },
    mobileAudit,
    liveExportAnalyzerVerification: {
      checksumChecked: liveAnalysis.checksum?.checked ?? false,
      checksumOk: liveAnalysis.checksum?.ok ?? false,
      sessionCount: liveAnalysis.sessions?.length ?? 0,
    },
    ownerFourTrialsBaselineCount: ownerFourTrialsAnalysis.sessions?.[0]?.trials?.length ?? 0,
    acceptanceGates: {
      gzipColdFullJourneyCdpBytes: gzipFull.cdpTotalBytes,
      gzipColdFullJourneyServerWireBytes: gzipFull.serverBodyWireBytes,
      gzipColdFullJourneyUnder25MB:
        gzipFull.cdpTotalBytes < 25_000_000 &&
        gzipFull.serverBodyWireBytes < 25_000_000 &&
        gzipFull.hasWasmLoaded &&
        gzipFull.hasHandLandmarkerTaskLoaded &&
        gzipFull.hasStudentModelLoaded,
      uncompressedColdFullJourneyCdpBytes: rawFull.cdpTotalBytes,
      uncompressedColdFullJourneyServerWireBytes: rawFull.serverBodyWireBytes,
      uncompressedColdFullJourneyUnder25MB:
        rawFull.cdpTotalBytes < 25_000_000 && rawFull.serverBodyWireBytes < 25_000_000,
      allCoreAssetsVerifiedLoaded:
        gzipFull.hasWasmLoaded && gzipFull.hasHandLandmarkerTaskLoaded && gzipFull.hasStudentModelLoaded,
      stickyLeftCameraAnchored: Boolean(journeyGzip.layoutStickyAudit?.isStickyLeftAnchored),
      independentRightScrollable: Boolean(journeyGzip.layoutStickyAudit?.isIndependentRightScrollable),
      mobileZeroHorizontalOverflow:
        !mobileAudit.landingHorizontalOverflow && !mobileAudit.canvasHorizontalOverflow,
      liveRuntimeSetOptionsCallsZero: allLiveSetOptionsZero,
      liveCanvas15fpsRealDetectHzMean: t15Canvas?.detectHzMean ?? null,
      liveCanvas15fpsMpMsP50: t15Canvas?.mpMs?.p50 ?? null,
      liveCanvas15fpsMpMsP95: t15Canvas?.mpMs?.p95 ?? null,
      liveGesture15fpsRealDetectHzMean: t15Gesture?.detectHzMean ?? null,
      liveGesture15fpsMpMsP50: t15Gesture?.mpMs?.p50 ?? null,
      liveGesture15fpsMpMsP95: t15Gesture?.mpMs?.p95 ?? null,
      liveCanvas30fpsRealDetectHzMean: t30Canvas?.detectHzMean ?? null,
      liveCanvas30fpsMpMsP50: t30Canvas?.mpMs?.p50 ?? null,
      liveCanvas30fpsMpMsP95: t30Canvas?.mpMs?.p95 ?? null,
      liveGesture30fpsRealDetectHzMean: t30Gesture?.detectHzMean ?? null,
      liveGesture30fpsMpMsP50: t30Gesture?.mpMs?.p50 ?? null,
      liveGesture30fpsMpMsP95: t30Gesture?.mpMs?.p95 ?? null,
      realHandDetectedInLiveExport: liveTrials.length >= 2 && liveTrials.every((t) => t.handFrames > 0),
      liveExportChecksumOk: Boolean(liveAnalysis.checksum?.ok),
      pageErrorsCount: journeyGzip.pageErrors.length,
    },
  };

  writeFileSync(AUDIT_JSON, JSON.stringify(auditResults, null, 2), "utf8");
  console.log("=== Wrote full-journey audit JSON:", AUDIT_JSON);
  console.log(JSON.stringify(auditResults.acceptanceGates, null, 2));
}

runAudit().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});

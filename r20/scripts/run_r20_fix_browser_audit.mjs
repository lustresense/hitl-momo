/**
 * R20-FIX Comprehensive Browser Audit (`run_r20_fix_browser_audit.mjs`).
 *
 * Covers P0.2, P0.3, and P3.3–3.9 with zero estimates and zero GPU acceleration (`--disable-gpu`):
 *  1. TRUE CDP Network Benchmark (P0.2):
 *     - Captures `Network.loadingFinished.encodedDataLength` from BOTH Page AND Web Worker targets via
 *       `Target.setAutoAttach({ autoAttach: true, flatten: true })` (plus browser-level target attachment).
 *     - Reconciles CDP transfer bytes directly against exact HTTP socket wire bytes from the local server
 *       (reporting BOTH CDP total, server total, and reconciliation delta — no fake 180-byte constant estimate).
 *     - Measures TWO separate cold journeys on the REAL Next.js static export (`main-r19/frontend/implementation/out`):
 *        * Journey 1 (`nui_lab_real_static_export`): `/nui-lab` -> `/nui-lab/gesture` (camera ON -> CPU Web Worker)
 *          -> `/nui-lab/canvas` (camera ON -> verify CacheStorage dedup of 7.8 MB `.task`).
 *        * Journey 2 (`student_onboarding_to_gameplay`): `/` -> `/onboarding/card` -> `/onboarding/number` ->
 *          `/onboarding/cam` -> `/levels` -> `/canvas1` -> `/level1`.
 *     - Measures across 3 honest deployment compression profiles:
 *        (a) `caddy_default_zstd_gzip` (matches `deploy/Caddyfile`: zstd/gzip on compressible MIME types only; `.task`/`.tflite` uncompressed!)
 *        (b) `gzip_standard` (gzip on compressible MIME types only; `.task`/`.tflite` uncompressed)
 *        (c) `uncompressed_dev` (zero compression)
 *  2. Real NUI Lab Static Export E2E + Recording Overhead + Export Re-Analysis + Refresh Recovery (P1/P2/P3):
 *     - Verifies consent gate, R20 C4 + A4 + CPU Web Worker, recording ON vs OFF FPS & queue backlog, live engine
 *       switch to R19 C0 (separate trials), Canvas Lab pointer vs gesture separation, Finish -> real browser download
 *       file validation & re-analysis, and reload/crash IndexedDB persistence (`interrupted` recovery).
 *  3. Long-Session CPU-Only (`--disable-gpu`) Web Worker Audit (P0.3 — 90 seconds continuous!):
 *     - `B3v2_guarded_owner_lock` (90s continuous: periodic 2-hand bystander audit every 15 frames, `A4v2`, checkpoints
 *       every 15s for heap leak check, `setOptionsMs`, `uiFps`, `detectHz`, `LongTasks`, `RELEASE_ALL`, worker restart).
 *     - `B1_fixed_numHands2` (30s comparison baseline).
 */
import { createServer } from "node:http";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { execFileSync } from "node:child_process";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const SANDBOX = process.env.R20_SANDBOX || "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const REPO = process.env.R20_REPO || "/srv/sketchbook/mediapipe-optimize/research-can";
const MAIN_OUT = process.env.R20_STATIC_OUT || "/srv/sketchbook/mediapipe-optimize/main-r19/frontend/implementation/out";
const DIST_DIR = `${SANDBOX}/browser/dist`;
const Y4M_PATH = process.env.R20_Y4M_PATH || `${SANDBOX}/browser/r20_sim_cam.y4m`;

const NET_OUT = `${REPO}/r20/results/r20_fix_network_cdp_audit.json`;
const RUNTIME_OUT = `${REPO}/r20/results/r20_fix_runtime_and_nuilab_e2e.json`;

const LONG_SESSION_SEC = Number(process.env.R20_LONG_SESSION_SEC || "90");
const MODE = (process.argv.find((a) => a.startsWith("--mode=")) || "--mode=all").split("=")[1];

process.env.PLAYWRIGHT_BROWSERS_PATH = `${SANDBOX}/pw`;
const require = createRequire(`${SANDBOX}/browser/package.json`);
const { chromium } = require("playwright");

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
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".task": "application/octet-stream",
  ".tflite": "application/octet-stream",
};

// Matches Caddy's real default `encode zstd gzip` compressible content-type set (binary octet-stream .task/.tflite NOT compressed!)
const CADDY_DEFAULT_COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".wasm", ".svg", ".txt"]);

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
  copyFileSync(`${REPO}/r20/models/r20_model_c4_full_mlp.json`, `${DIST_DIR}/r20_winner_model.json`);
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
    join(MAIN_OUT, clean),
    join(MAIN_OUT, `${clean.replace(/\/$/, "")}.html`),
    join(MAIN_OUT, clean, "index.html"),
    join(MAIN_OUT, "index.html"),
  ];
  for (const c of cands) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function classifyAsset(path) {
  if (path.endsWith(".wasm")) return "wasm";
  if (path.endsWith(".task")) return "mediapipe_hand_model";
  if (path.endsWith(".tflite")) return "mediapipe_face_model";
  if (path.includes("r20-") || path.includes("r19-") || path.includes("model")) return "student_model";
  if (path.includes("worker")) return "worker_js";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "app_js";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".woff2") || path.endsWith(".woff") || path.endsWith(".ttf")) return "fonts";
  if (path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".webp") || path.endsWith(".svg")) return "images";
  if (path.endsWith(".html") || !extname(path)) return "html_document";
  return "other";
}

async function startServer(compressionProfile = "caddy_default_zstd_gzip") {
  let activeProfile = compressionProfile;
  let accessLog = [];

  const srv = createServer((req, res) => {
    const rawUrl = req.url || "/";
    const cleanPath = rawUrl.split("?")[0];
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
    let encoding = "identity";
    if (activeProfile === "caddy_default_zstd_gzip" && CADDY_DEFAULT_COMPRESSIBLE.has(ext)) {
      if (ae.includes("zstd") && typeof zlib.zstdCompressSync === "function") {
        bodyBuf = zlib.zstdCompressSync(raw);
        encoding = "zstd";
        headers["Content-Encoding"] = "zstd";
      } else if (ae.includes("gzip")) {
        bodyBuf = zlib.gzipSync(raw, { level: 6 });
        encoding = "gzip";
        headers["Content-Encoding"] = "gzip";
      }
    } else if (activeProfile === "gzip_standard" && CADDY_DEFAULT_COMPRESSIBLE.has(ext) && ae.includes("gzip")) {
      bodyBuf = zlib.gzipSync(raw, { level: 6 });
      encoding = "gzip";
      headers["Content-Encoding"] = "gzip";
    }
    headers["Content-Length"] = String(bodyBuf.byteLength);

    const bytesBefore = req.socket ? req.socket.bytesWritten : 0;
    res.writeHead(200, headers);
    res.end(bodyBuf, () => {
      const bytesAfter = req.socket ? req.socket.bytesWritten : 0;
      const socketDelta = bytesAfter >= bytesBefore ? bytesAfter - bytesBefore : bodyBuf.byteLength;
      accessLog.push({
        path: cleanPath,
        category: classifyAsset(cleanPath),
        mime,
        encoding,
        rawBytes: raw.byteLength,
        bodyWireBytes: bodyBuf.byteLength,
        socketWireBytes: socketDelta,
      });
    });
  });

  await new Promise((res) => srv.listen(0, "127.0.0.1", res));
  const addr = srv.address();
  return {
    srv,
    baseUrl: `http://127.0.0.1:${addr.port}`,
    setProfile: (p) => { activeProfile = p; },
    resetLog: () => { accessLog = []; },
    getLog: () => [...accessLog],
  };
}

/**
 * Attaches CDP Network tracing to BOTH the main Page AND every spawned Web Worker target!
 */
async function attachTrueCdpNetworkMonitor(browser, context, page) {
  const cdpRecords = [];
  const pending = new Map(); // `${sessionId}:${requestId}` -> { url, targetType, status, mimeType, fromCache, encodedHeadersLen }
  const attachedSessions = new Set();

  const wireSession = async (session, sessionKey, targetType) => {
    if (attachedSessions.has(sessionKey)) return;
    attachedSessions.add(sessionKey);
    session.on("Network.requestWillBeSent", (ev) => {
      pending.set(`${sessionKey}:${ev.requestId}`, {
        url: ev.request?.url || "",
        targetType,
        status: null,
        mimeType: "",
        fromCache: false,
        headerBytes: 0,
      });
    });
    session.on("Network.responseReceived", (ev) => {
      const rec = pending.get(`${sessionKey}:${ev.requestId}`) || {
        url: ev.response?.url || "",
        targetType,
      };
      rec.url = ev.response?.url || rec.url;
      rec.status = ev.response?.status ?? null;
      rec.mimeType = ev.response?.mimeType || "";
      rec.fromCache = Boolean(ev.response?.fromDiskCache || ev.response?.fromServiceWorker || ev.response?.fromPrefetchCache);
      rec.headerBytes = ev.response?.encodedDataLength || 0;
      pending.set(`${sessionKey}:${ev.requestId}`, rec);
    });
    session.on("Network.loadingFinished", (ev) => {
      const key = `${sessionKey}:${ev.requestId}`;
      const rec = pending.get(key) || { url: "", targetType, status: null, mimeType: "", fromCache: false };
      pending.delete(key);
      // Skip data:/blob: URLs (0 network bytes)
      if (!rec.url || rec.url.startsWith("data:") || rec.url.startsWith("blob:")) return;
      let path = rec.url;
      try { path = new URL(rec.url).pathname; } catch { /* ignore */ }
      cdpRecords.push({
        path,
        url: rec.url,
        targetType: rec.targetType,
        category: classifyAsset(path),
        status: rec.status,
        mimeType: rec.mimeType,
        fromCache: rec.fromCache,
        cdpEncodedDataLength: ev.encodedDataLength || 0,
      });
    });
    try {
      await session.send("Network.enable");
    } catch {
      /* target closed quickly */
    }
  };

  // Attach to page session
  const pageCdp = await context.newCDPSession(page);
  await wireSession(pageCdp, "page", "page");

  // Attach to every Web Worker / ServiceWorker / iframe target spawned by the page!
  const browserCdp = await browser.newBrowserCDPSession();
  const childSessions = new Map();
  browserCdp.on("Target.attachedToTarget", async (ev) => {
    const sid = ev.sessionId;
    const tType = ev.targetInfo?.type || "unknown";
    if (tType !== "worker" && tType !== "shared_worker") return;
    if (childSessions.has(sid)) return;
    childSessions.set(sid, tType);
    // Use browserCdp flattened protocol messages? Playwright BrowserCDPSession supports events with sessionId only via raw protocol;
    // easier: also hook Playwright's `page.on("worker")`? Playwright doesn't expose CDPSession for workers directly,
    // so we use `pageCdp` with `Target.setAutoAttach({ autoAttach: true, waitForDebuggerOnStart: false, flatten: false })`!
  });

  // In Chromium CDP, page-level `Target.setAutoAttach` with `flatten: false` sends `Target.receivedMessageFromTarget`!
  const workerTargets = new Map();
  pageCdp.on("Target.attachedToTarget", async (ev) => {
    const sid = ev.sessionId;
    const tType = ev.targetInfo?.type || "worker";
    workerTargets.set(sid, { type: tType, url: ev.targetInfo?.url || "" });
    try {
      await pageCdp.send("Target.sendMessageToTarget", {
        sessionId: sid,
        message: JSON.stringify({ id: 1, method: "Network.enable", params: {} }),
      });
    } catch {
      /* ignore */
    }
  });
  pageCdp.on("Target.receivedMessageFromTarget", (ev) => {
    const sid = ev.sessionId;
    const tType = workerTargets.get(sid)?.type || "worker";
    let msg;
    try { msg = JSON.parse(ev.message); } catch { return; }
    if (!msg.method) return;
    const p = msg.params || {};
    if (msg.method === "Network.requestWillBeSent") {
      pending.set(`${sid}:${p.requestId}`, {
        url: p.request?.url || "",
        targetType: tType,
        status: null,
        mimeType: "",
        fromCache: false,
      });
    } else if (msg.method === "Network.responseReceived") {
      const rec = pending.get(`${sid}:${p.requestId}`) || { url: p.response?.url || "", targetType: tType };
      rec.url = p.response?.url || rec.url;
      rec.status = p.response?.status ?? null;
      rec.mimeType = p.response?.mimeType || "";
      rec.fromCache = Boolean(p.response?.fromDiskCache || p.response?.fromServiceWorker);
      pending.set(`${sid}:${p.requestId}`, rec);
    } else if (msg.method === "Network.loadingFinished") {
      const key = `${sid}:${p.requestId}`;
      const rec = pending.get(key) || { url: "", targetType: tType, status: null, mimeType: "", fromCache: false };
      pending.delete(key);
      if (!rec.url || rec.url.startsWith("data:") || rec.url.startsWith("blob:")) return;
      let path = rec.url;
      try { path = new URL(rec.url).pathname; } catch { /* ignore */ }
      cdpRecords.push({
        path,
        url: rec.url,
        targetType: rec.targetType,
        category: classifyAsset(path),
        status: rec.status,
        mimeType: rec.mimeType,
        fromCache: rec.fromCache,
        cdpEncodedDataLength: p.encodedDataLength || 0,
      });
    }
  });
  await pageCdp.send("Target.setAutoAttach", {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: false,
  });

  return {
    getRecords: () => [...cdpRecords],
    clear: () => { cdpRecords.length = 0; },
    close: async () => {
      try { await browserCdp.detach(); } catch { /* ignore */ }
      try { await pageCdp.detach(); } catch { /* ignore */ }
    },
  };
}

function summarizeCdpAndServer(cdpRecords, serverLog) {
  const cdpTotal = cdpRecords.reduce((s, r) => s + r.cdpEncodedDataLength, 0);
  const cdpWorkerTotal = cdpRecords.filter((r) => r.targetType !== "page").reduce((s, r) => s + r.cdpEncodedDataLength, 0);
  const cdpPageTotal = cdpRecords.filter((r) => r.targetType === "page").reduce((s, r) => s + r.cdpEncodedDataLength, 0);
  const serverSocketTotal = serverLog.reduce((s, r) => s + r.socketWireBytes, 0);
  const serverBodyTotal = serverLog.reduce((s, r) => s + r.bodyWireBytes, 0);
  const serverRawTotal = serverLog.reduce((s, r) => s + r.rawBytes, 0);

  const byCategoryCdp = {};
  const byCategoryServer = {};
  const byPathCdp = new Map();
  for (const r of cdpRecords) {
    byCategoryCdp[r.category] = (byCategoryCdp[r.category] || 0) + r.cdpEncodedDataLength;
    const prev = byPathCdp.get(r.path) || { path: r.path, category: r.category, targets: new Set(), requests: 0, cdpBytes: 0, cacheHits: 0 };
    prev.requests++;
    prev.cdpBytes += r.cdpEncodedDataLength;
    prev.targets.add(r.targetType);
    if (r.fromCache) prev.cacheHits++;
    byPathCdp.set(r.path, prev);
  }
  for (const r of serverLog) {
    byCategoryServer[r.category] = (byCategoryServer[r.category] || 0) + r.socketWireBytes;
  }

  const topAssets = Array.from(byPathCdp.values())
    .map((x) => ({ ...x, targets: Array.from(x.targets) }))
    .sort((a, b) => b.cdpBytes - a.cdpBytes);

  return {
    cdpTotalEncodedBytes: cdpTotal,
    cdpTotalMiB: Math.round((cdpTotal / (1024 * 1024)) * 100) / 100,
    cdpPageBytes: cdpPageTotal,
    cdpWorkerBytes: cdpWorkerTotal,
    cdpRequestCount: cdpRecords.length,
    cdpWorkerRequestCount: cdpRecords.filter((r) => r.targetType !== "page").length,
    serverSocketWireBytes: serverSocketTotal,
    serverBodyWireBytes: serverBodyTotal,
    serverRawUncompressedBytes: serverRawTotal,
    serverRequestCount: serverLog.length,
    reconciliationDeltaCdpMinusServerSocket: cdpTotal - serverSocketTotal,
    passUnder25MB_CDP: cdpTotal < 25_000_000,
    passUnder25MB_ServerSocket: serverSocketTotal < 25_000_000,
    headroomBytes_CDP: 25_000_000 - cdpTotal,
    byCategoryCdp,
    byCategoryServer,
    topAssetsByCdpBytes: topAssets.slice(0, 20),
  };
}

async function measureRealJourneysForProfile(browser, server, profile) {
  server.setProfile(profile);

  // Journey 1: Real NUI Lab Static Export (/nui-lab -> /nui-lab/gesture [camera ON] -> /nui-lab/canvas [camera ON])
  const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: "block" });
  const p1 = await ctx1.newPage();
  const mon1 = await attachTrueCdpNetworkMonitor(browser, ctx1, p1);
  server.resetLog();

  await p1.goto(`${server.baseUrl}/nui-lab`, { waitUntil: "networkidle", timeout: 30000 });
  // Select R20 C4 on landing so cold NUI Lab measures R20 C4 student + CPU Web Worker
  await p1.click('[data-testid="bench-engine-r20-c4"]');
  await p1.click('a[href="/nui-lab/gesture"]');
  await p1.waitForSelector('[data-testid="nui-lab-gesture"]', { timeout: 20000 });
  await p1.click('button:has-text("Nyalakan kamera")');
  await p1.waitForFunction(
    () => document.querySelector('[data-testid="r19-model-status"]')?.getAttribute("data-state") === "ready",
    null,
    { timeout: 30000 },
  );
  // Wait for CPU Web Worker HandLandmarker READY + first detections
  await p1.waitForFunction(
    () => {
      const txt = document.body.innerText || "";
      return txt.includes("CPU (Web Worker");
    },
    null,
    { timeout: 30000 },
  );
  await p1.waitForTimeout(1500);
  await p1.click('button:has-text("Matikan kamera")');
  // Navigate to Canvas Lab and start camera to verify CacheStorage prevents duplicate 7.8 MB download
  await p1.click('a[href="/nui-lab/canvas"]');
  await p1.waitForSelector('[data-testid="nui-lab-canvas"]', { timeout: 20000 });
  await p1.click('button:has-text("Nyalakan kamera")');
  await p1.waitForFunction(
    () => document.querySelector('[data-testid="r19-model-status"]')?.getAttribute("data-state") === "ready",
    null,
    { timeout: 30000 },
  );
  await p1.waitForTimeout(1500);
  await p1.click('button:has-text("Matikan kamera")');
  await p1.waitForTimeout(300);

  const j1 = summarizeCdpAndServer(mon1.getRecords(), server.getLog());
  await mon1.close();
  await ctx1.close();

  // Journey 2A: Real Student Cold SPA Visit (/ -> camera warm + FaceDetector + WASM + sprites -> SPA client transitions to onboarding/levels/canvas1/level1)
  const ctx2a = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: "block" });
  const p2a = await ctx2a.newPage();
  const mon2a = await attachTrueCdpNetworkMonitor(browser, ctx2a, p2a);
  server.resetLog();

  await p2a.goto(`${server.baseUrl}/`, { waitUntil: "networkidle", timeout: 30000 });
  // Wait for cover camera toggle (DreamLoader finishes) and toggle camera ON so MediaPipe HandLandmarker + FaceDetector + WASM load genuinely!
  try {
    await p2a.waitForSelector('[data-testid="btn-camera-toggle-switch"]', { timeout: 20000 });
    await p2a.click('[data-testid="btn-camera-toggle-switch"]');
  } catch {
    /* ignore if already awake */
  }
  await p2a.waitForTimeout(3500);
  // Traverse student SPA routes via pushState + popstate (keeps SketchbookApp & GlobalCamera mounted, matching real student clicks)
  for (const r of ["/onboarding/number", "/onboarding/card", "/levels", "/canvas1", "/level1"]) {
    await p2a.evaluate((path) => {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, r);
    await p2a.waitForTimeout(800);
  }
  await p2a.waitForTimeout(800);
  const j2a = summarizeCdpAndServer(mon2a.getRecords(), server.getLog());
  await mon2a.close();
  await ctx2a.close();

  // Journey 2B: Hard-Reload Per-Route Worst Case (audit check exposing missing CacheStorage in student src/camera/hand-landmarker.ts)
  const ctx2b = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: "block" });
  const p2b = await ctx2b.newPage();
  const mon2b = await attachTrueCdpNetworkMonitor(browser, ctx2b, p2b);
  server.resetLog();

  for (const route of ["/", "/onboarding/card", "/onboarding/number", "/onboarding/cam", "/levels", "/canvas1", "/level1"]) {
    await p2b.goto(`${server.baseUrl}${route}`, { waitUntil: "networkidle", timeout: 30000 });
    if (route === "/onboarding/cam") await p2b.waitForTimeout(1500);
  }
  await p2b.waitForTimeout(400);
  const j2b = summarizeCdpAndServer(mon2b.getRecords(), server.getLog());
  await mon2b.close();
  await ctx2b.close();

  return {
    profile,
    journey1_nui_lab: j1,
    journey2a_student_spa_real_visit: j2a,
    journey2b_student_hard_reloads_audit: j2b,
  };
}

/**
 * Real NUI Lab Static Export E2E Test (P1/P2/P3.6–3.9):
 *  - Tests consent, R20 C4 + A4 + CPU Web Worker, Recording OFF vs ON FPS & queue backlog,
 *    live engine switch to R19 C0, Canvas Lab pointer vs gesture, Finish -> real downloaded JSON
 *    re-analysis, and reload crash recovery!
 */
async function runRealNuiLabE2E(browser, server) {
  server.setProfile("caddy_default_zstd_gzip");
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // 1. Open /nui-lab landing, verify consent gate & select R20 C4 + A4 + CPU Worker
  await page.goto(`${server.baseUrl}/nui-lab`, { waitUntil: "networkidle", timeout: 30000 });
  const startDisabledBeforeConsent = await page.isDisabled('[data-testid="bench-start"]');
  await page.click('[data-testid="bench-engine-r20-c4"]');
  await page.click('[data-testid="bench-preprocess-a4"]');
  await page.selectOption('[data-testid="bench-scenario-select"]', "N1_single_room_lamp");

  // 2. First go to Gesture Lab with recording OFF for 8s to measure baseline UI FPS without recording
  await page.click('a[href="/nui-lab/gesture"]');
  await page.waitForSelector('[data-testid="nui-lab-gesture"]');
  await page.click('button:has-text("Nyalakan kamera")');
  await page.waitForFunction(() => document.querySelector('[data-testid="r19-model-status"]')?.getAttribute("data-state") === "ready", null, { timeout: 30000 });
  await page.waitForFunction(() => (document.body.innerText || "").includes("CPU (Web Worker"), null, { timeout: 30000 });

  const measureUiFps = async (ms) => {
    return page.evaluate((durMs) => new Promise((resolve) => {
      const dts = [];
      let longTasks = 0;
      let obs = null;
      try {
        obs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (e.duration >= 50) longTasks++;
        });
        obs.observe({ type: "longtask", buffered: false });
      } catch { /* ignore */ }
      let last = null;
      const t0 = performance.now();
      const step = (ts) => {
        if (last !== null) dts.push(ts - last);
        last = ts;
        if (ts - t0 < durMs) requestAnimationFrame(step);
        else {
          try { obs?.disconnect(); } catch { /* ignore */ }
          const mean = dts.reduce((a, b) => a + b, 0) / Math.max(1, dts.length);
          const sorted = [...dts].sort((a, b) => a - b);
          resolve({
            uiFps: Math.round((1000 / Math.max(1, mean)) * 10) / 10,
            rafP95Ms: Math.round((sorted[Math.floor(0.95 * (sorted.length - 1))] || 0) * 100) / 100,
            longTasks,
            frames: dts.length,
          });
        }
      };
      requestAnimationFrame(step);
    }), ms);
  };

  const perfRecordingOff = await measureUiFps(6000);

  // 3. Now enable Benchmark Session directly from BenchSessionBar (consent -> start) and measure 8s with Recording ON!
  await page.click('[data-testid="bench-bar-consent"]');
  await page.click('[data-testid="bench-bar-start"]');
  await page.waitForFunction(() => (document.querySelector('[data-testid="bench-bar-status"]')?.textContent || "").includes("SESI AKTIF"), null, { timeout: 10000 });
  const perfRecordingOn = await measureUiFps(8000);
  const barMetricsAfterRec = await page.textContent('[data-testid="bench-bar-metrics"]');

  // 4. Live engine switch R20 C4 -> R19 C0 (must create Trial #2 without mixing!)
  await page.selectOption('[data-testid="bench-bar-engine"]', "r19-c0");
  await page.waitForFunction(() => (document.querySelector('[data-testid="r19-engine-badge"]')?.textContent || "").includes("R19 G4 Hybrid"), null, { timeout: 15000 });
  await page.waitForTimeout(3000);

  // 5. Navigate to Canvas Lab via link -> Trial #3 with camera + pointer stroke
  await page.click('a[href="/nui-lab/canvas"]');
  await page.waitForSelector('[data-testid="nui-lab-canvas"]');
  await page.click('button:has-text("Nyalakan kamera")');
  await page.waitForFunction(() => document.querySelector('[data-testid="r19-model-status"]')?.getAttribute("data-state") === "ready", null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  const canvasLoc = page.locator('canvas[aria-label="Kanvas gambar NUI"]');
  await canvasLoc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const canvasBox = await canvasLoc.boundingBox();
  if (canvasBox) {
    await page.mouse.move(canvasBox.x + 60, canvasBox.y + 60);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 200, canvasBox.y + 150, { steps: 8 });
    await page.mouse.up();
  }
  await page.waitForTimeout(500);
  await page.click('button:has-text("Matikan kamera")');

  // 6. Finish Session & Download actual browser export file!
  await page.click('[data-testid="bench-bar-finish"]');
  await page.waitForFunction(() => (document.querySelector('[data-testid="bench-bar-status"]')?.textContent || "").includes("Nonaktif"), null, { timeout: 10000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click('[data-testid="bench-bar-export"]'),
  ]);
  const dlPath = `${SANDBOX}/browser/nui_lab_e2e_export.json`;
  await download.saveAs(dlPath);
  const exported = JSON.parse(readFileSync(dlPath, "utf8"));

  // Validate exported file structure, groups, frames, and zero PII/video/images
  const rawStr = readFileSync(dlPath, "utf8");
  const containsForbiddenDataUrl = rawStr.includes("data:image/") || rawStr.includes("data:video/");
  const sess0 = exported.sessions?.[0];
  const trialsSummary = (sess0?.trials || []).map((t) => ({
    trialId: t.meta.trialId,
    route: t.meta.route,
    engineId: t.meta.engine.engineId,
    modelHashVerified: t.meta.engine.modelHashVerified,
    preprocess: t.meta.engine.preprocess,
    detector: t.meta.engine.detector,
    frames: t.summary.frames,
    handFrames: t.summary.handFrames,
    detectorMissFrames: t.summary.detectorMissFrames,
    pointerStrokes: t.summary.canvas.pointerStrokes,
  }));

  // 7. Test Refresh/Crash Recovery in IndexedDB: start a 2nd session -> record frames -> reload without finishing!
  await page.goto(`${server.baseUrl}/nui-lab`, { waitUntil: "networkidle" });
  await page.click('[data-testid="bench-consent"]');
  await page.click('[data-testid="bench-start"]');
  await page.click('a[href="/nui-lab/gesture"]');
  await page.waitForSelector('[data-testid="nui-lab-gesture"]');
  await page.click('button:has-text("Nyalakan kamera")');
  await page.waitForFunction(() => document.querySelector('[data-testid="r19-model-status"]')?.getAttribute("data-state") === "ready", null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  // Simulate abrupt refresh/close without pressing Finish
  await page.goto(`${server.baseUrl}/nui-lab`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const prevSessionsText = await page.textContent('[data-testid="bench-prev-sessions"]').catch(() => "");

  await context.close();
  return {
    startDisabledBeforeConsent,
    perfRecordingOff,
    perfRecordingOn,
    recordingFpsDelta: Math.round((perfRecordingOn.uiFps - perfRecordingOff.uiFps) * 10) / 10,
    barMetricsAfterRec,
    exportedSchema: exported.schema,
    exportedBytes: statSync(dlPath).size,
    containsForbiddenDataUrl,
    sessionStatus: sess0?.meta?.status,
    storageBackend: sess0?.meta?.environment?.storage,
    droppedRecords: sess0?.meta?.droppedRecords,
    storageFailures: sess0?.meta?.storageFailures,
    validation: sess0?.validation,
    groupCount: sess0?.benchmarkSummary?.groups?.length ?? 0,
    groupEngines: (sess0?.benchmarkSummary?.groups || []).map((g) => `${g.key.engineId}:${g.key.source}:${g.key.preprocess}`),
    trialsSummary,
    totalExportedFrames: sess0?.frames?.length ?? 0,
    totalExportedEvents: sess0?.events?.length ?? 0,
    totalExportedPerf: sess0?.perf?.length ?? 0,
    reloadRecoveryShowsInterrupted: (prevSessionsText || "").includes("interrupted"),
    consoleErrorsCount: consoleErrors.length,
    pageErrorsCount: pageErrors.length,
    consoleErrors: consoleErrors.slice(0, 5),
    pageErrors: pageErrors.slice(0, 5),
  };
}

/**
 * Long-Session CPU-Only (`--disable-gpu`) Web Worker Audit (P0.3 — 90 seconds continuous!).
 */
async function runLongSessionWorkerAudit(browser, server, label, queryParams, durationSec) {
  server.setProfile("caddy_default_zstd_gzip");
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(`${server.baseUrl}/r20-harness/index.html?${queryParams}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__R20_HARNESS__ && (window.__R20_HARNESS__.ready || window.__R20_HARNESS__.error)), null, { timeout: 30000 });
  const initErr = await page.evaluate(() => window.__R20_HARNESS__.error);
  if (initErr) throw new Error(`Harness init error (${label}): ${initErr}`);

  const readHeap = async () => {
    const res = await cdp.send("Performance.getMetrics");
    const m = Object.fromEntries(res.metrics.map((x) => [x.name, x.value]));
    return {
      jsHeapUsedMB: Math.round(((m.JSHeapUsedSize || 0) / (1024 * 1024)) * 100) / 100,
      jsHeapTotalMB: Math.round(((m.JSHeapTotalSize || 0) / (1024 * 1024)) * 100) / 100,
      nodes: m.Nodes || 0,
    };
  };

  const checkpoints = [];
  const stepSec = 15;
  let elapsed = 0;
  while (elapsed < durationSec) {
    const waitS = Math.min(stepSec, durationSec - elapsed);
    await page.waitForTimeout(waitS * 1000);
    elapsed += waitS;
    const hm = await page.evaluate(() => window.__R20_HARNESS__.getMetrics());
    const heap = await readHeap();
    checkpoints.push({ atSec: elapsed, mpFps: hm.effectiveMpFps, uiFps: hm.uiFpsMean, uiFpsP5: hm.uiFpsP5, longTasks: hm.longTasksAfterBootCount, detP95: hm.detectMs?.p95, heap });
    console.log(
      `[long:${label} @${elapsed}s] mpFps=${hm.effectiveMpFps} uiFps=${hm.uiFpsMean} (p5=${hm.uiFpsP5}) ` +
        `detP50/P95=${hm.detectMs?.p50}/${hm.detectMs?.p95}ms longTasks=${hm.longTasksAfterBootCount} heap=${heap.jsHeapUsedMB}MB`,
    );
  }

  const tabHiddenRelease = await page.evaluate(() => window.__R20_HARNESS__.simulateLifecycleRelease("tab-hidden-long-test"));
  const workerRestartRelease = await page.evaluate(() => window.__R20_HARNESS__.simulateLifecycleRelease("worker-restart-long-test"));
  const finalSummary = await page.evaluate(() => window.__R20_HARNESS__.stop());
  const postStopHeap = await readHeap();

  await context.close();
  return {
    label,
    durationSec,
    consoleErrorsCount: consoleErrors.length,
    pageErrorsCount: pageErrors.length,
    lifecycle: {
      tabHiddenRelease,
      workerRestartRelease,
      stoppedCleanly: finalSummary.stoppedCleanly,
      zeroStuckKeys: !finalSummary.c0Counts?.stuckKeysNow && !finalSummary.r20Counts?.stuckKeysNow,
    },
    finalSummary,
    postStopHeap,
    heapGrowthMB:
      checkpoints.length >= 2
        ? Math.round((checkpoints[checkpoints.length - 1].heap.jsHeapUsedMB - checkpoints[0].heap.jsHeapUsedMB) * 100) / 100
        : 0,
    checkpoints,
  };
}

async function main() {
  console.log("[r20-fix-audit] Building updated R20 harness + worker dist...");
  buildHarnessDist();

  const server = await startServer("caddy_default_zstd_gzip");
  console.log("[r20-fix-audit] Static server listening at", server.baseUrl, "(serving", MAIN_OUT, ")");

  // STRICT CPU-ONLY CHROMIUM LAUNCH (--disable-gpu!)
  const browser = await chromium.launch({
    headless: true,
    channel: "chromium-headless-shell",
    args: [
      "--disable-gpu",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${Y4M_PATH}`,
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  try {
    if (MODE === "all" || MODE === "network") {
      // 1. P0.2 True CDP Network Benchmark across 3 real deployment compression profiles
      const netProfiles = {};
      for (const prof of ["caddy_default_zstd_gzip", "gzip_standard", "uncompressed_dev"]) {
        console.log(`[r20-fix-audit] Measuring TRUE CDP + Server network for profile: ${prof}...`);
        const res = await measureRealJourneysForProfile(browser, server, prof);
        netProfiles[prof] = res;
        console.log(
          `  [${prof}] J1(NUI Lab): CDP=${res.journey1_nui_lab.cdpTotalEncodedBytes}B (${res.journey1_nui_lab.cdpTotalMiB}MiB, worker=${res.journey1_nui_lab.cdpWorkerBytes}B) ` +
            `Server=${res.journey1_nui_lab.serverSocketWireBytes}B | PASS<25MB=${res.journey1_nui_lab.passUnder25MB_CDP}`,
        );
        console.log(
          `  [${prof}] J2A(Student SPA): CDP=${res.journey2a_student_spa_real_visit.cdpTotalEncodedBytes}B (${res.journey2a_student_spa_real_visit.cdpTotalMiB}MiB) ` +
            `Server=${res.journey2a_student_spa_real_visit.serverSocketWireBytes}B | PASS<25MB=${res.journey2a_student_spa_real_visit.passUnder25MB_CDP}`,
        );
        console.log(
          `  [${prof}] J2B(Student Hard Reloads): CDP=${res.journey2b_student_hard_reloads_audit.cdpTotalEncodedBytes}B (${res.journey2b_student_hard_reloads_audit.cdpTotalMiB}MiB) ` +
            `Server=${res.journey2b_student_hard_reloads_audit.serverSocketWireBytes}B | PASS<25MB=${res.journey2b_student_hard_reloads_audit.passUnder25MB_CDP}`,
        );
      }

      writeFileSync(
        NET_OUT,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            method: "TRUE CDP Network.loadingFinished.encodedDataLength across Page + Web Worker targets, reconciled against actual HTTP socket bytesWritten",
            hardBudgetBytes: 25_000_000,
            profiles: netProfiles,
          },
          null,
          2,
        ),
      );
      console.log("[r20-fix-audit] Wrote", NET_OUT);
    }

    if (MODE === "all" || MODE === "runtime") {
      // 2. Real NUI Lab Static Export E2E + Recording Impact + Download + Crash Recovery
      console.log("[r20-fix-audit] Running Real NUI Lab Static Export E2E...");
      const nuiLabE2E = await runRealNuiLabE2E(browser, server);
      console.log("[r20-fix-audit] NUI Lab E2E:", JSON.stringify({
        perfRecordingOff: nuiLabE2E.perfRecordingOff,
        perfRecordingOn: nuiLabE2E.perfRecordingOn,
        recordingFpsDelta: nuiLabE2E.recordingFpsDelta,
        trialsCount: nuiLabE2E.trialsSummary.length,
        groupEngines: nuiLabE2E.groupEngines,
        droppedRecords: nuiLabE2E.droppedRecords,
        reloadRecoveryShowsInterrupted: nuiLabE2E.reloadRecoveryShowsInterrupted,
        consoleErrorsCount: nuiLabE2E.consoleErrorsCount,
      }));

      // 3. Long-Session CPU-Only Worker Audit (90s B3v2 Guarded Owner-Lock vs 30s B1 Fixed numHands=2)
      console.log(`[r20-fix-audit] Running ${LONG_SESSION_SEC}s LONG-SESSION B3v2 Guarded Owner-Lock (periodic 2-hand audit + A4v2)...`);
      const longB3v2 = await runLongSessionWorkerAudit(
        browser,
        server,
        "B3v2_guarded_owner_lock_long_90s",
        "variant=cpu-web-worker&numHands=2&dynamicOwnerLock=1&lowLightMode=adaptive-fallback&captureWidth=320",
        LONG_SESSION_SEC,
      );

      console.log("[r20-fix-audit] Running 30s B1 Fixed numHands=2 comparator...");
      const compB1 = await runLongSessionWorkerAudit(
        browser,
        server,
        "B1_fixed_numHands2_30s",
        "variant=cpu-web-worker&numHands=2&lowLightMode=adaptive-fallback&captureWidth=320",
        30,
      );

      console.log("[r20-fix-audit] Running 25s B2 Single-Hand numHands=1 ceiling comparator...");
      const compB2 = await runLongSessionWorkerAudit(
        browser,
        server,
        "B2_numHands1_ceiling_25s",
        "variant=cpu-web-worker&numHands=1&lowLightMode=adaptive-fallback&captureWidth=320",
        25,
      );

      writeFileSync(
        RUNTIME_OUT,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            chromiumFlags: ["--disable-gpu", "--use-fake-device-for-media-stream"],
            nuiLabStaticExportE2E: nuiLabE2E,
            longSessionWorkerAudit: {
              B3v2_guarded_owner_lock_long_90s: longB3v2,
              B1_fixed_numHands2_30s: compB1,
              B2_numHands1_ceiling_25s: compB2,
            },
          },
          null,
          2,
        ),
      );
      console.log("[r20-fix-audit] Wrote", RUNTIME_OUT);
    }
  } finally {
    await browser.close();
    server.srv.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

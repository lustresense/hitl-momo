#!/usr/bin/env node
/**
 * R23B-HF3 Headless Browser Verification (Step 9):
 * 1. Normal fake camera (/nui-lab/canvas):
 *    - Verifies session meta contains actual resolution & frameRate, exposureCapabilities,
 *      exposureControlStatus, autoPreprocessStatus, and app.version === "0.29.3-alpha+r23b-monui7-hf3".
 * 2. Darkened fake video (--use-file-for-fake-video-capture):
 *    - Generates a compact 640x480@30fps dark Y4M video (luma ~ 0.07-0.11 < 0.15, > 0).
 *    - Verifies PREPROCESS_AUTO_ON event fires, frames report preprocessPass === "A4_denoise_reinhard320",
 *      and session meta reports autoPreprocessStatus.active === true.
 * - Saves evidence to /srv/sketchbook/research-can/r23/results/HF3_browser_check.json.
 */
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join } from "node:path";

const SANDBOX = "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const OUT_DIR = "/home/deano/monui7-local/work/frontend/implementation/out";
const REPORT_PATH = "/srv/sketchbook/research-can/r23/results/HF3_browser_check.json";
const DARK_Y4M_PATH = "/tmp/hf3_dark_test.y4m";
const EXPECTED_VERSION = "0.29.3-alpha+r23b-monui7-hf3";

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
  ".wasm": "application/wasm",
  ".task": "application/octet-stream",
  ".onnx": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
};

function generateDarkY4m(path, width = 640, height = 480, fps = 30, frames = 12) {
  // Y=30 yields RGB~16 (luma 0.064) in BT.601 limited-range and RGB=30 (luma 0.118) in full-range:
  // safely > 0 (not black) and strictly < 0.15 (triggers HF3 auto-preprocess A4v2) in either decoder.
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F${fps}:1 Ip A1:1 C420jpeg\n`, "ascii");
  const frameHeader = Buffer.from("FRAME\n", "ascii");
  const ySize = width * height;
  const uvSize = (width / 2) * (height / 2);
  const chunks = [header];
  for (let f = 0; f < frames; f++) {
    const yPlane = Buffer.alloc(ySize, 30);
    // Add subtle moving vertical bar (Y=36) so frames are distinct (uniqueCaptureFps > 0)
    const barX = (f * 40) % (width - 20);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = barX; x < barX + 20; x++) {
        yPlane[row + x] = 36;
      }
    }
    const uPlane = Buffer.alloc(uvSize, 128);
    const vPlane = Buffer.alloc(uvSize, 128);
    chunks.push(frameHeader, yPlane, uPlane, vPlane);
  }
  writeFileSync(path, Buffer.concat(chunks));
}

function resolvePath(urlRaw) {
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

function startServer(port = 45680) {
  return new Promise((resolve) => {
    const server = createServer((reqHttp, resHttp) => {
      const cleanPath = String(reqHttp.url || "/").split("?")[0];
      const filePath = resolvePath(cleanPath);
      if (!filePath) {
        resHttp.writeHead(404, { "Content-Type": "text/plain" });
        resHttp.end("Not Found");
        return;
      }
      const mime = MIME_MAP[extname(filePath)] || "application/octet-stream";
      resHttp.writeHead(200, { "Content-Type": mime });
      resHttp.end(readFileSync(filePath));
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function runCameraCaptureSession(extraArgs, targetUrl, waitMs = 6000) {
  const browser = await chromium.launch({
    executablePath: "/srv/sketchbook/mediapipe-optimize/r20-sandbox/pw/chromium-1255/chrome-linux64/chrome",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      ...extraArgs,
    ],
  });

  try {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      const payload = {
        numericRecording: true,
        videoOrImages: false,
        upload: false,
        version: "bench-consent/1",
        grantedAtMinuteIso: new Date().toISOString(),
      };
      localStorage.setItem("nui-lab-bench-consent/1", JSON.stringify(payload));
    });

    const page = await context.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));

    await page.goto(targetUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    const cameraBtn = await page.waitForSelector('button:has-text("Nyalakan kamera")', { timeout: 10000 });
    await cameraBtn.click();

    await page.waitForTimeout(waitMs);

    try {
      const stopBtn = await page.$('button:has-text("Matikan kamera")');
      if (stopBtn) await stopBtn.click();
    } catch {
      /* ignore */
    }
    await page.waitForTimeout(1000);

    const exportResult = await page.evaluate(async () => {
      const mgr = window.__benchMgr;
      if (!mgr) return { error: "No __benchMgr found on window" };
      try {
        await mgr.flush();
        const blob = await mgr.exportAll();
        const text = await blob.text();
        return { success: true, json: JSON.parse(text) };
      } catch (e) {
        return { error: String(e) };
      }
    });

    await context.close();
    if (!exportResult.success) {
      throw new Error(`Export failed: ${exportResult.error}`);
    }
    const sessions = exportResult.json.sessions || [];
    const latest = sessions[sessions.length - 1];
    return {
      errors,
      app: exportResult.json.app,
      meta: latest?.meta ?? null,
      events: latest?.events ?? [],
      frames: latest?.frames ?? [],
    };
  } finally {
    await browser.close();
  }
}

async function run() {
  console.log("[HF3] Generating dark Y4M fixture:", DARK_Y4M_PATH);
  generateDarkY4m(DARK_Y4M_PATH, 640, 480, 30, 12);

  console.log("[HF3] Starting static server from:", OUT_DIR);
  const server = await startServer(45680);

  try {
    // 1. Default fake camera check (meta has actual resolution & frameRate)
    console.log("[HF3] Running Check 1: Default fake camera...");
    const normalRes = await runCameraCaptureSession(
      [],
      "http://127.0.0.1:45680/nui-lab/canvas",
      5000,
    );

    // 2. Darkened fake video check (auto-brightener A4v2 activates after >= 1s)
    console.log("[HF3] Running Check 2: Darkened fake video (Y4M)...");
    const darkRes = await runCameraCaptureSession(
      [`--use-file-for-fake-video-capture=${DARK_Y4M_PATH}`],
      "http://127.0.0.1:45680/nui-lab/canvas",
      6500,
    );

    const normalActual = normalRes.meta?.cameraActual ?? null;
    const normalPass =
      Boolean(normalActual) &&
      typeof normalActual.width === "number" &&
      normalActual.width > 0 &&
      typeof normalActual.height === "number" &&
      normalActual.height > 0 &&
      typeof normalActual.frameRate === "number" &&
      normalActual.frameRate > 0 &&
      normalRes.meta?.app?.version === EXPECTED_VERSION &&
      Boolean(normalRes.meta?.exposureControlStatus) &&
      Boolean(normalRes.meta?.autoPreprocessStatus) &&
      normalRes.frames.length > 0;

    const darkPreOnEvents = darkRes.events.filter((e) => e.type === "PREPROCESS_AUTO_ON");
    const darkA4Frames = darkRes.frames.filter((f) => f.preprocessPass === "A4_denoise_reinhard320");
    const darkLumaValues = darkRes.frames
      .map((f) => f.lumaP50)
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    const darkLumaP50Median =
      darkLumaValues.length > 0
        ? [...darkLumaValues].sort((a, b) => a - b)[Math.floor(darkLumaValues.length / 2)]
        : null;
    const darkActual = darkRes.meta?.cameraActual ?? null;
    const darkPass =
      Boolean(darkActual) &&
      darkActual.width === 640 &&
      darkActual.height === 480 &&
      typeof darkActual.frameRate === "number" &&
      darkActual.frameRate > 0 &&
      darkPreOnEvents.length >= 1 &&
      darkA4Frames.length >= 1 &&
      darkRes.meta?.autoPreprocessStatus?.active === true &&
      darkRes.meta?.autoPreprocessStatus?.onCount >= 1 &&
      darkLumaP50Median !== null &&
      darkLumaP50Median > 0 &&
      darkLumaP50Median < 0.15;

    const overallPass = normalPass && darkPass;

    const report = {
      task: "HF3_browser_check",
      timestamp: new Date().toISOString(),
      status: overallPass ? "PASS" : "FAIL",
      expectedAppVersion: EXPECTED_VERSION,
      normalFakeCameraCheck: {
        pass: normalPass,
        pageErrors: normalRes.errors,
        appVersion: normalRes.meta?.app?.version ?? null,
        totalFrames: normalRes.frames.length,
        cameraActual: normalActual,
        cameraCapabilities: normalRes.meta?.cameraCapabilities ?? null,
        exposureControlStatus: normalRes.meta?.exposureControlStatus ?? null,
        autoPreprocessStatus: normalRes.meta?.autoPreprocessStatus ?? null,
      },
      darkenedFakeVideoCheck: {
        pass: darkPass,
        pageErrors: darkRes.errors,
        totalFrames: darkRes.frames.length,
        cameraActual: darkActual,
        darkLumaP50Median,
        preprocessAutoOnEventsCount: darkPreOnEvents.length,
        firstPreprocessAutoOnEvent: darkPreOnEvents[0] ?? null,
        framesWithA4Preprocess: darkA4Frames.length,
        sampleA4Frame: darkA4Frames[0]
          ? {
              fid: darkA4Frames[0].fid,
              t: darkA4Frames[0].t,
              lumaP50: darkA4Frames[0].lumaP50,
              preprocessPass: darkA4Frames[0].preprocessPass,
              videoFrameWidth: darkA4Frames[0].videoFrameWidth,
              videoFrameHeight: darkA4Frames[0].videoFrameHeight,
              cameraReportedFps: darkA4Frames[0].cameraReportedFps,
            }
          : null,
        autoPreprocessStatus: darkRes.meta?.autoPreprocessStatus ?? null,
      },
    };

    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
    console.log("[HF3] Evidence saved ->", REPORT_PATH);
    console.log("[HF3] Verdict:", report.status, JSON.stringify({ normalPass, darkPass }));
    if (!overallPass) {
      console.error(JSON.stringify(report, null, 2));
      process.exit(1);
    }
  } finally {
    server.close();
    if (existsSync(DARK_Y4M_PATH)) {
      try {
        unlinkSync(DARK_Y4M_PATH);
      } catch {
        /* ignore */
      }
    }
  }
}

run().catch((err) => {
  console.error("[HF3 Fatal Error]", err);
  process.exit(1);
});

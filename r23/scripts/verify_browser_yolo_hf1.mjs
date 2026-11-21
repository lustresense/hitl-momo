#!/usr/bin/env node
/**
 * Bug 3 Verification: Verify YOLO runs in headless Chromium browser
 * - Static build served on localhost
 * - Headless Chromium with fake camera (--use-fake-device-for-media-stream)
 * - Proves: ONNX request 200, ORT session created log, exported session has >= 1 frame with yoloRan=true
 * - Saves result to r23/results/HF1_browser_yolo_check.json
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join } from "node:path";

const SANDBOX = "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const OUT_DIR = "/home/deano/monui7-local/work/frontend/implementation/out";
const REPORT_PATH = "/srv/sketchbook/research-can/r23/results/HF1_browser_yolo_check.json";

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

function startServer(port = 45678) {
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

    server.listen(port, "127.0.0.1", () => {
      resolve(server);
    });
  });
}

async function run() {
  console.log("[Bug 3] Starting static server from:", OUT_DIR);
  const server = await startServer(45678);

  console.log("[Bug 3] Launching Chromium headless with fake media stream...");
  const browser = await chromium.launch({
    executablePath: "/srv/sketchbook/mediapipe-optimize/r20-sandbox/pw/chromium-1255/chrome-linux64/chrome",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

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

  const page = await context.newPage({
    viewport: { width: 1280, height: 800 },
  });

  let onnxRequest200 = false;
  let onnxUrl = null;
  let onnxStatus = null;
  const requests = [];

  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("monui7-hand-yolo26n-320.onnx")) {
      onnxUrl = url;
      onnxStatus = res.status();
      if (res.status() === 200) onnxRequest200 = true;
      console.log(`[Bug 3 HTTP Response] ${res.status()} ${url}`);
    }
  });

  page.on("request", (r) => {
    requests.push({ url: r.url(), method: r.method() });
  });

  const consoleLogs = [];
  let ortSessionCreatedLog = false;
  page.on("console", (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (text.includes("[monui7-yolo] Sesi onnxruntime-web berhasil dibuat.")) {
      ortSessionCreatedLog = true;
      console.log(`[Bug 3 Console Log MATCH] ${text}`);
    }
  });

  console.log("[Bug 3] Navigating to http://127.0.0.1:45678/nui-lab/canvas...");
  await page.goto("http://127.0.0.1:45678/nui-lab/canvas", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  console.log("[Bug 3] Starting camera with fake media stream...");
  const cameraBtn = await page.waitForSelector('button:has-text("Nyalakan kamera")', { timeout: 10000 });
  await cameraBtn.click();

  console.log("[Bug 3] Waiting 8 seconds for fake frames & rescue YOLO processing...");
  await page.waitForTimeout(8000);

  console.log("[Bug 3] Stopping camera...");
  try {
    const stopBtn = await page.$('button:has-text("Matikan kamera")');
    if (stopBtn) await stopBtn.click();
  } catch (e) {
    console.warn("[Bug 3] Could not click stop camera button:", e);
  }
  await page.waitForTimeout(1500);

  console.log("[Bug 3] Exporting session data from page...");
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

  if (!exportResult.success) {
    throw new Error(`Export failed in browser: ${exportResult.error}`);
  }

  const exportJson = exportResult.json;
  const sessions = exportJson.sessions || [];
  const latestSession = sessions[sessions.length - 1];
  const frames = latestSession?.frames || [];
  const yoloFrames = frames.filter((f) => f.yoloRan === true);

  console.log(`[Bug 3 Result] Total sessions: ${sessions.length}`);
  console.log(`[Bug 3 Result] Total frames: ${frames.length}`);
  console.log(`[Bug 3 Result] Frames with yoloRan=true: ${yoloFrames.length}`);
  console.log(`[Bug 3 Result] ONNX request 200: ${onnxRequest200} (status: ${onnxStatus})`);
  console.log(`[Bug 3 Result] ORT session created log: ${ortSessionCreatedLog}`);

  const sampleYoloFrame = yoloFrames[0] || null;

  const report = {
    task: "HF1_BUG3_browser_yolo_check",
    timestamp: new Date().toISOString(),
    status:
      onnxRequest200 && ortSessionCreatedLog && yoloFrames.length >= 1
        ? "PASS"
        : "FAIL",
    checks: {
      onnxRequest200: {
        pass: onnxRequest200,
        status: onnxStatus,
        url: onnxUrl,
      },
      ortSessionCreatedLog: {
        pass: ortSessionCreatedLog,
        logMatching: consoleLogs.find((l) =>
          l.text.includes("[monui7-yolo] Sesi onnxruntime-web berhasil dibuat."),
        )?.text ?? null,
      },
      exportedSessionHasYoloRanFrame: {
        pass: yoloFrames.length >= 1,
        totalFrames: frames.length,
        framesWithYoloRan: yoloFrames.length,
        sampleFrame: sampleYoloFrame
          ? {
              fid: sampleYoloFrame.fid,
              t: sampleYoloFrame.t,
              rescueState: sampleYoloFrame.rescueState,
              yoloRan: sampleYoloFrame.yoloRan,
              yoloMs: sampleYoloFrame.yoloMs,
              yoloScore: sampleYoloFrame.yoloScore,
              cropTried: sampleYoloFrame.cropTried,
              cropSuccess: sampleYoloFrame.cropSuccess,
              positionOnly: sampleYoloFrame.positionOnly,
              guideState: sampleYoloFrame.guideState,
            }
          : null,
      },
      sessionMetadata: {
        sessionId: latestSession?.meta?.sessionId ?? null,
        yoloModelSha256: latestSession?.meta?.yoloModelSha256 ?? null,
        yoloEnabled: latestSession?.meta?.yoloEnabled ?? null,
        yoloRateHz: latestSession?.meta?.yoloRateHz ?? null,
        monuiVersion: latestSession?.meta?.monuiVersion ?? null,
      },
    },
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log("[Bug 3] Evidence saved to:", REPORT_PATH);
  console.log("[Bug 3] Verdict:", report.status);

  await browser.close();
  server.close();

  if (report.status !== "PASS") {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("[Bug 3 Fatal Error]", err);
  process.exit(1);
});

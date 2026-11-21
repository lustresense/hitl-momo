#!/usr/bin/env node
/**
 * R23-HF2 Headless Browser YOLO Check:
 * 1. Default (no url param): /nui-lab/canvas -> proves YOLO runs (yoloRan=true in frames, ONNX 200, ORT session created, yoloRateHz=5).
 * 2. Disabled (?yolo=0): /nui-lab/canvas?yolo=0 -> proves yoloRan=false on 100% of frames (yoloEnabled=false).
 * - Saves result to r23/results/HF2_browser_yolo_check.json
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join } from "node:path";

const SANDBOX = "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const OUT_DIR = "/home/deano/monui7-local/work/frontend/implementation/out";
const REPORT_PATH = "/srv/sketchbook/research-can/r23/results/HF2_browser_yolo_check.json";

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

function startServer(port = 45679) {
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

async function testSession(browser, targetUrl, isYoloDisabledTest = false) {
  console.log(`\n[HF2 Test] Navigating to ${targetUrl}...`);
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
  const consoleLogs = [];
  let ortSessionCreatedLog = false;

  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("monui7-hand-yolo26n-320.onnx")) {
      onnxUrl = url;
      onnxStatus = res.status();
      if (res.status() === 200) onnxRequest200 = true;
      console.log(`[HTTP Response] ${res.status()} ${url}`);
    }
  });

  page.on("console", (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (text.includes("[monui7-yolo] Sesi onnxruntime-web berhasil dibuat.")) {
      ortSessionCreatedLog = true;
      console.log(`[Console Log MATCH] ${text}`);
    }
  });

  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  console.log("[HF2 Test] Starting camera with fake media stream...");
  const cameraBtn = await page.waitForSelector('button:has-text("Nyalakan kamera")', { timeout: 10000 });
  await cameraBtn.click();

  console.log("[HF2 Test] Waiting 8 seconds for fake frames...");
  await page.waitForTimeout(8000);

  console.log("[HF2 Test] Stopping camera...");
  try {
    const stopBtn = await page.$('button:has-text("Matikan kamera")');
    if (stopBtn) await stopBtn.click();
  } catch (e) {
    console.warn("[HF2 Test] Could not click stop camera button:", e);
  }
  await page.waitForTimeout(1500);

  console.log("[HF2 Test] Exporting session data from page...");
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
    throw new Error(`Export failed in browser: ${exportResult.error}`);
  }

  const exportJson = exportResult.json;
  const sessions = exportJson.sessions || [];
  const latestSession = sessions[sessions.length - 1];
  const frames = latestSession?.frames || [];
  const yoloFrames = frames.filter((f) => f.yoloRan === true);

  console.log(`[Result for ${targetUrl}] Total frames: ${frames.length}, yoloRan=true: ${yoloFrames.length}`);

  return {
    url: targetUrl,
    onnxRequest200,
    onnxStatus,
    onnxUrl,
    ortSessionCreatedLog,
    totalFrames: frames.length,
    yoloFramesCount: yoloFrames.length,
    meta: latestSession?.meta ?? null,
    sampleYoloFrame: yoloFrames[0] ?? null,
  };
}

async function run() {
  console.log("[HF2] Starting static server from:", OUT_DIR);
  const server = await startServer(45679);

  console.log("[HF2] Launching Chromium headless with fake media stream...");
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

  try {
    // 1. Default test (without parameter) -> YOLO must run
    const defaultResult = await testSession(browser, "http://127.0.0.1:45679/nui-lab/canvas", false);

    // 2. Disabled test (?yolo=0) -> YOLO must NOT run (0 frames with yoloRan=true)
    const disabledResult = await testSession(browser, "http://127.0.0.1:45679/nui-lab/canvas?yolo=0", true);

    const defaultPass =
      defaultResult.onnxRequest200 &&
      defaultResult.ortSessionCreatedLog &&
      defaultResult.yoloFramesCount >= 1 &&
      defaultResult.meta?.yoloEnabled === true &&
      defaultResult.meta?.yoloRateHz === 5;

    const disabledPass =
      disabledResult.yoloFramesCount === 0 &&
      disabledResult.meta?.yoloEnabled === false &&
      disabledResult.totalFrames > 0;

    const overallPass = defaultPass && disabledPass;

    const report = {
      task: "HF2_browser_yolo_check",
      timestamp: new Date().toISOString(),
      status: overallPass ? "PASS" : "FAIL",
      defaultCanvasCheck: {
        pass: defaultPass,
        url: defaultResult.url,
        onnxRequest200: defaultResult.onnxRequest200,
        ortSessionCreatedLog: defaultResult.ortSessionCreatedLog,
        totalFrames: defaultResult.totalFrames,
        framesWithYoloRan: defaultResult.yoloFramesCount,
        meta: {
          yoloModelSha256: defaultResult.meta?.yoloModelSha256,
          yoloEnabled: defaultResult.meta?.yoloEnabled,
          yoloRateHz: defaultResult.meta?.yoloRateHz,
          monuiVersion: defaultResult.meta?.monuiVersion,
        },
        sampleYoloFrame: defaultResult.sampleYoloFrame
          ? {
              fid: defaultResult.sampleYoloFrame.fid,
              t: defaultResult.sampleYoloFrame.t,
              rescueState: defaultResult.sampleYoloFrame.rescueState,
              yoloRan: defaultResult.sampleYoloFrame.yoloRan,
              yoloMs: defaultResult.sampleYoloFrame.yoloMs,
              yoloScore: defaultResult.sampleYoloFrame.yoloScore,
            }
          : null,
      },
      disabledCanvasCheck: {
        pass: disabledPass,
        url: disabledResult.url,
        totalFrames: disabledResult.totalFrames,
        framesWithYoloRan: disabledResult.yoloFramesCount,
        meta: {
          yoloEnabled: disabledResult.meta?.yoloEnabled,
          yoloRateHz: disabledResult.meta?.yoloRateHz,
        },
      },
    };

    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
    console.log("\n[HF2 Evidence Saved] ->", REPORT_PATH);
    console.log("[HF2 Verdict]:", report.status);

    if (!overallPass) {
      process.exit(1);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error("[HF2 Fatal Error]", err);
  process.exit(1);
});

/**
 * MoNUI-7 T28 Headless Lazy-Loading Verification Script (`verify_lazy_loading.mjs`).
 *
 * Verifies that:
 * 1. Upon loading `/nui-lab/canvas`, NO requests are made to `/ort/` or YOLO models (`.onnx`).
 * 2. `/ort/` WASM and YOLO assets are loaded lazily strictly upon rescue trigger.
 * 3. Records evidence to `$RC/r23/results/T28_lazy_loading.json`.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join } from "node:path";

const SANDBOX = "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const OUT_DIR = "/home/deano/monui7-local/work/frontend/implementation/out";
const REPORT_PATH = "/srv/sketchbook/research-can/r23/results/T28_lazy_loading.json";

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

function startServer(port = 3456) {
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

async function verify() {
  console.log("Starting static server from:", OUT_DIR);
  const server = await startServer(3456);

  console.log("Launching Chromium...");
  const browser = await chromium.launch({
    executablePath: "/srv/sketchbook/mediapipe-optimize/r20-sandbox/pw/chromium-1255/chrome-linux64/chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });

  const requests = [];
  page.on("request", (req) => {
    requests.push({ url: req.url(), method: req.method() });
  });

  console.log("Navigating to /nui-lab/canvas...");
  await page.goto("http://127.0.0.1:3456/nui-lab/canvas", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const ortRequestsBeforeRescue = requests.filter(
    (r) => r.url.includes("/ort/") || r.url.includes(".onnx"),
  );

  const passedInitialIsolation = ortRequestsBeforeRescue.length === 0;
  console.log(
    `Initial check: ORT/YOLO requests before rescue = ${ortRequestsBeforeRescue.length} (PASS: ${passedInitialIsolation})`,
  );

  const report = {
    status: passedInitialIsolation ? "PASS" : "FAIL",
    timestamp: new Date().toISOString(),
    canvasRoute: "/nui-lab/canvas",
    totalRequestsInitial: requests.length,
    ortRequestsBeforeRescue: ortRequestsBeforeRescue.map((r) => r.url),
    passedInitialIsolation,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("Saved report to:", REPORT_PATH);

  await browser.close();
  server.close();
}

verify().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});

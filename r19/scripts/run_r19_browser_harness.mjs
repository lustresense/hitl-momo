import { createServer } from "node:http";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const R18_SANDBOX = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox";
process.env.PLAYWRIGHT_BROWSERS_PATH ||= `${R18_SANDBOX}/.pw-browsers`;
process.env.TMPDIR ||= `${R18_SANDBOX}/.tmp`;

const require = createRequire(`${R18_SANDBOX}/repo/frontend/implementation/package.json`);
const { chromium } = require("playwright");
const OUT_DIR = `${R18_SANDBOX}/repo/frontend/implementation/out`;
const DIST_DIR = process.env.R19_HARNESS_DIST || "/srv/sketchbook/mediapipe-optimize/r19-sandbox/browser/dist";
const Y4M_PATH = process.env.R19_Y4M_PATH || `${R18_SANDBOX}/harness-dist/sim_cam.y4m`;
const RESULTS_PATH = process.env.R19_BROWSER_OUT || "/srv/sketchbook/mediapipe-optimize/r19-sandbox/browser/r19_browser_runtime.json";
const DURATION_SEC = Number(process.env.R19_DURATION_SEC || "180");

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
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".wasm", ".svg", ".txt"]);

function resolveStatic(urlPath) {
  const clean = normalize(urlPath.split("?")[0]).replace(/^(\.\.(\/|\\|$))+/, "");
  if (clean.startsWith("/r19-harness")) {
    const rel = clean.slice("/r19-harness".length) || "/index.html";
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

async function startServer() {
  const srv = createServer((req, res) => {
    const fp = resolveStatic(req.url || "/");
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
    if (COMPRESSIBLE.has(ext) && ae.includes("zstd") && typeof zlib.zstdCompressSync === "function") {
      res.writeHead(200, { ...headers, "Content-Encoding": "zstd" });
      res.end(zlib.zstdCompressSync(raw));
    } else if (COMPRESSIBLE.has(ext) && ae.includes("gzip")) {
      res.writeHead(200, { ...headers, "Content-Encoding": "gzip" });
      res.end(zlib.gzipSync(raw, { level: 6 }));
    } else {
      res.writeHead(200, headers);
      res.end(raw);
    }
  });
  await new Promise((res) => srv.listen(0, "127.0.0.1", res));
  const addr = srv.address();
  return { srv, baseUrl: `http://127.0.0.1:${addr.port}` };
}

async function main() {
  process.env.PLAYWRIGHT_BROWSERS_PATH = `${R18_SANDBOX}/.pw-browsers`;
  process.env.TMPDIR = `${R18_SANDBOX}/.tmp`;

  const { srv, baseUrl } = await startServer();
  console.log("[r19-harness-server] listening at", baseUrl, "durationSec=", DURATION_SEC);

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
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Performance.enable");

    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    const reqUrls = new Map();
    const resByUrl = new Map();
    client.on("Network.requestWillBeSent", (ev) => reqUrls.set(ev.requestId, ev.request.url));
    client.on("Network.responseReceived", (ev) => {
      const prev = resByUrl.get(ev.response.url) || {
        mime: ev.response.mimeType,
        encoding: ev.response.headers["content-encoding"] || "none",
        wire: 0,
      };
      prev.mime = ev.response.mimeType;
      prev.encoding = ev.response.headers["content-encoding"] || "none";
      resByUrl.set(ev.response.url, prev);
    });
    client.on("Network.loadingFinished", (ev) => {
      const url = reqUrls.get(ev.requestId);
      if (!url) return;
      const cur = resByUrl.get(url) || { mime: "unknown", encoding: "none", wire: 0 };
      cur.wire = Math.max(cur.wire, ev.encodedDataLength || 0);
      resByUrl.set(url, cur);
    });

    const routeStats = [];
    for (const route of ["/", "/onboarding/card", "/onboarding/number", "/onboarding/cam", "/levels", "/canvas1", "/level1", "/canvas2", "/level2", "/canvas3", "/level3"]) {
      const t0 = Date.now();
      await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 25000 });
      routeStats.push({ route, loadMs: Date.now() - t0, title: await page.title() });
    }

    const appOnlyWireBytes = Array.from(resByUrl.entries())
      .filter(([u]) => !u.includes("/r19-harness/"))
      .reduce((s, [, v]) => s + v.wire, 0);

    await page.goto(`${baseUrl}/r19-harness/index.html`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForFunction(
      () => Boolean(window.__R19_HARNESS__ && (window.__R19_HARNESS__.ready || window.__R19_HARNESS__.error)),
      null,
      { timeout: 30000 },
    );

    const initErr = await page.evaluate(() => window.__R19_HARNESS__.error);
    if (initErr) throw new Error(`R19 harness init error: ${initErr}`);

    await page.waitForTimeout(3000);

    const uniqueWireEntries = Array.from(resByUrl.entries())
      .map(([url, info]) => ({ path: url.replace(baseUrl, ""), ...info }))
      .sort((a, b) => b.wire - a.wire);
    const totalWireBytes = uniqueWireEntries.reduce((s, e) => s + e.wire, 0);

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
    const targetsSec = DURATION_SEC >= 180 ? [20, 60, 120, 180] : [DURATION_SEC];
    let prevTarget = 3;
    for (const sec of targetsSec) {
      const waitMs = Math.max(0, (sec - prevTarget) * 1000);
      if (waitMs > 0) await page.waitForTimeout(waitMs);
      prevTarget = sec;
      const hm = await page.evaluate(() => window.__R19_HARNESS__.getMetrics());
      const pm = await readCdpPerf();
      const cp = { targetSec: sec, ...hm, cdpPerf: pm };
      checkpoints.push(cp);
      console.log(
        `[r19 cp ${sec}s] frames=${cp.mpFramesProcessed} mpFps=${cp.effectiveMpFps} detP95=${cp.detectMs?.p95}ms r19P95=${cp.r19Ms?.p95}ms heap=${pm.jsHeapUsedMB}MB counts=${JSON.stringify(cp.counts)}`,
      );
    }

    const stopped = await page.evaluate(() => window.__R19_HARNESS__.stop());
    await page.waitForTimeout(500);
    const postStopPerf = await readCdpPerf();

    const modelEntry = uniqueWireEntries.find((e) => e.path.endsWith("/r19_model_mlp.json")) || null;
    const report = {
      evidence_class: "BROWSER_SIMULATED_VIDEO",
      physical_webcam_status: "NOT_TESTED",
      video_input: {
        path: Y4M_PATH,
        composition: process.env.R19_Y4M_DESC || "Simulated fake-video-capture .y4m feed",
      },
      transfer_budget_b_user: {
        limit_bytes: 25 * 1024 * 1024,
        app_routes_visited: routeStats,
        app_routes_unique_wire_bytes: appOnlyWireBytes,
        r19_model_wire_bytes: modelEntry?.wire ?? null,
        total_first_use_plus_nui_wire_bytes: totalWireBytes,
        total_first_use_plus_nui_wire_mb: Math.round((totalWireBytes / (1024 * 1024)) * 1000) / 1000,
        under_25mb_pass: totalWireBytes < 25 * 1024 * 1024,
        top_15_wire_assets: uniqueWireEntries.slice(0, 15),
      },
      sustained_checkpoints: checkpoints,
      final_after_stop: {
        ...stopped,
        postStopCdpPerf: postStopPerf,
      },
      console_errors: consoleErrors,
      page_errors: pageErrors,
    };

    writeFileSync(RESULTS_PATH, JSON.stringify(report, null, 2));
    console.log("=== R19 BROWSER HARNESS COMPLETE ===");
    console.log("Total cold wire transfer (MB):", report.transfer_budget_b_user.total_first_use_plus_nui_wire_mb, "under_25mb_pass:", report.transfer_budget_b_user.under_25mb_pass);
    console.log("Stopped cleanly:", stopped.stoppedCleanly, "errors:", consoleErrors.length, pageErrors.length);
  } finally {
    await browser.close();
    srv.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

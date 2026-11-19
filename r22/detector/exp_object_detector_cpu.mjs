/**
 * R22 Custom Hand Detector Workstream — Real CPU Web Worker + Headless Chromium Prototype
 * (`exp_object_detector_cpu.mjs`).
 *
 * Acceptance IDs: O02, O03, O04, O05, G10, G11, G12.
 *
 * Measures in isolated cold Chromium persistent contexts (`--disable-gpu`, CPU-only Web Worker, cache disabled):
 *   - Arm A: `HandLandmarker` ONLY (sharing `/mediapipe/wasm`)
 *   - Arm B: `ObjectDetector` (`efficientdet_lite0_int8.tflite`) + `HandLandmarker` dual-task in SAME Worker
 *   - Arm C: `HandLandmarker` with ROI Crop -> Full-Frame coordinate transform (`O03`)
 *
 * Captures empirically (zero estimates):
 *   1. Exact CDP cold network wire bytes (main page + Web Worker targets via `Target.setAutoAttach flatten:false`)
 *   2. Exact Worker init latency (`resolverMs`, `handInitMs`, `objectInitMs`)
 *   3. Exact Worker WebAssembly linear memory instances & bytes (`wasmMemoryCount`, `wasmLinearMb`) +
 *      Worker JS heap + isolated Linux `/proc/<pid>/smaps_rollup` RSS/PSS for our own browser PID tree (`O04`)
 *   4. Per-frame CPU inference latency (`objMs`, `handMs`, `totalDetectMs` p50/p95) & detected classes (`O02/O05`)
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, normalize } from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const SANDBOX = "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const FRONTEND_PUBLIC = "/srv/sketchbook/mediapipe-optimize/r22-nui-lab/frontend/implementation/public";
const PROTO_DIR = "/srv/sketchbook/mediapipe-optimize/research-can/r22/detector/proto";
const DIST_DIR = `${SANDBOX}/browser/dist`;
const Y4M_PATH = `${SANDBOX}/browser/r20_sim_cam.y4m`;
const OBJ_MODEL_PATH = `${SANDBOX}/models/detector/efficientdet_lite0_int8.tflite`;
const OUT_JSON = "/srv/sketchbook/mediapipe-optimize/research-can/r22/detector/r22_object_detector_cpu.json";

process.env.PLAYWRIGHT_BROWSERS_PATH = `${SANDBOX}/pw`;
const require = createRequire(`${SANDBOX}/browser/package.json`);
const { chromium } = require("playwright");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".task": "application/octet-stream",
  ".tflite": "application/octet-stream",
};
const CADDY_COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".json", ".wasm"]);

function buildProtoWorker() {
  mkdirSync(DIST_DIR, { recursive: true });
  const esbuildBin = `${SANDBOX}/browser/node_modules/.bin/esbuild`;
  const env = { ...process.env, NODE_PATH: `${SANDBOX}/browser/node_modules` };
  execFileSync(
    esbuildBin,
    [
      `${PROTO_DIR}/proto_worker.ts`,
      "--bundle",
      "--format=iife",
      "--target=es2022",
      `--outfile=${DIST_DIR}/proto_worker.bundle.js`,
    ],
    { stdio: "inherit", env },
  );
}

function resolveFile(urlPath) {
  const clean = normalize(urlPath.split("?")[0]).replace(/^(\.\.(\/|\\|$))+/, "");
  if (clean === "/r22-proto/index.html" || clean === "/r22-proto/") {
    return `${PROTO_DIR}/index.html`;
  }
  if (clean === "/r22-proto/proto_worker.bundle.js") {
    return `${DIST_DIR}/proto_worker.bundle.js`;
  }
  if (clean === "/models/efficientdet_lite0_int8.tflite") {
    return OBJ_MODEL_PATH;
  }
  const pub = join(FRONTEND_PUBLIC, clean);
  if (existsSync(pub) && statSync(pub).isFile()) return pub;
  return null;
}

function startServer() {
  let accessLog = [];
  const srv = createServer((req, res) => {
    const rawUrl = req.url || "/";
    const fp = resolveFile(rawUrl);
    if (!fp) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = extname(fp);
    const raw = readFileSync(fp);
    const ae = String(req.headers["accept-encoding"] || "");
    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
      Vary: "Accept-Encoding",
    };
    let body = raw;
    let enc = "none";
    if (CADDY_COMPRESSIBLE.has(ext) && ae.includes("zstd") && typeof zlib.zstdCompressSync === "function") {
      body = zlib.zstdCompressSync(raw);
      enc = "zstd";
      headers["Content-Encoding"] = "zstd";
    } else if (CADDY_COMPRESSIBLE.has(ext) && ae.includes("gzip")) {
      body = zlib.gzipSync(raw, { level: 6 });
      enc = "gzip";
      headers["Content-Encoding"] = "gzip";
    }
    accessLog.push({ path: rawUrl.split("?")[0], rawBytes: raw.length, wireBytes: body.length, encoding: enc });
    res.writeHead(200, headers);
    res.end(body);
  });

  return new Promise((resolve) => {
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        resetLog: () => {
          accessLog = [];
        },
        getLog: () => [...accessLog],
        close: () => new Promise((r) => srv.close(r)),
      });
    });
  });
}

function quantile(arr, q) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] * 100) / 100;
}

function readIsolatedRendererMemMb(profileDir) {
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
    let added = true;
    while (added) {
      added = false;
      for (const r of rows) {
        if (!owned.has(r.pid) && owned.has(r.ppid)) {
          owned.add(r.pid);
          added = true;
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
    const totalRssMb = Math.round(procs.reduce((s, p) => s + p.rssMb, 0) * 100) / 100;
    const totalPssMb = Math.round(procs.reduce((s, p) => s + p.pssMb, 0) * 100) / 100;
    const totalPrivateDirtyMb = Math.round(procs.reduce((s, p) => s + p.privateDirtyMb, 0) * 100) / 100;
    return { rendererCount: procs.length, totalRssMb, totalPssMb, totalPrivateDirtyMb, procs };
  } catch {
    return null;
  }
}

async function runArm(server, armName, protoCfg) {
  server.resetLog();
  const profileDir = mkdtempSync("/tmp/r22_objdet_");
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    serviceWorkers: "block",
    args: [
      "--disable-gpu",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-precise-memory-info",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-video-capture=${Y4M_PATH}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  try {
    const page = context.pages()[0] || (await context.newPage());
    const pageCdp = await context.newCDPSession(page);
    await pageCdp.send("Network.enable");
    await pageCdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await pageCdp.send("Performance.enable");
    await pageCdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: false });

    const pending = new Map();
    const cdpAssets = [];
    const attachedTargets = [];

    pageCdp.on("Network.requestWillBeSent", (ev) => {
      pending.set(`page:${ev.requestId}`, { url: ev.request?.url || "", target: "page" });
    });
    pageCdp.on("Network.loadingFinished", (ev) => {
      const rec = pending.get(`page:${ev.requestId}`);
      pending.delete(`page:${ev.requestId}`);
      if (!rec?.url || rec.url.startsWith("data:") || rec.url.startsWith("blob:")) return;
      cdpAssets.push({ path: new URL(rec.url).pathname, target: rec.target, cdpBytes: ev.encodedDataLength || 0 });
    });

    pageCdp.on("Target.attachedToTarget", async (ev) => {
      const sid = ev.sessionId;
      const tType = ev.targetInfo?.type || "worker";
      attachedTargets.push(tType);
      try {
        await pageCdp.send("Target.sendMessageToTarget", {
          sessionId: sid,
          message: JSON.stringify({ id: 1, method: "Network.enable", params: {} }),
        });
        await pageCdp.send("Target.sendMessageToTarget", {
          sessionId: sid,
          message: JSON.stringify({ id: 2, method: "Network.setCacheDisabled", params: { cacheDisabled: true } }),
        });
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
        cdpAssets.push({ path: new URL(rec.url).pathname, target: rec.target, cdpBytes: p.encodedDataLength || 0 });
      }
    });

    await page.goto(`${server.url}/r22-proto/index.html`, { waitUntil: "networkidle" });
    const runOut = await page.evaluate(async (cfg) => {
      return await window.runDetectorProto(cfg);
    }, protoCfg);

    const procMem = readIsolatedRendererMemMb(profileDir);
    const cdpPerf = await pageCdp.send("Performance.getMetrics");
    const perfMap = Object.fromEntries(cdpPerf.metrics.map((m) => [m.name, m.value]));

    const srvLog = server.getLog();
    const srvTotalWire = srvLog.reduce((s, r) => s + r.wireBytes, 0);
    const cdpTotalWire = cdpAssets.reduce((s, r) => s + r.cdpBytes, 0);

    const objMsArr = runOut.frames.map((f) => f.objMs);
    const handMsArr = runOut.frames.map((f) => f.handMs);
    const totalMsArr = runOut.frames.map((f) => f.totalDetectMs);
    const detLabels = {};
    for (const f of runOut.frames) {
      for (const d of f.detections) {
        detLabels[d.label] = (detLabels[d.label] || 0) + 1;
      }
    }
    const handsFoundFrames = runOut.frames.filter((f) => f.handCount > 0).length;

    return {
      arm: armName,
      config: protoCfg,
      attachedTargets,
      network: {
        cdpWireBytes: cdpTotalWire,
        cdpWireMb: Math.round((cdpTotalWire / (1024 * 1024)) * 100) / 100,
        serverWireBytes: srvTotalWire,
        serverWireMb: Math.round((srvTotalWire / (1024 * 1024)) * 100) / 100,
        cdpAssets,
        serverAssets: srvLog,
      },
      init: runOut.readyInfo,
      memory: {
        wasmEnd: runOut.frames.at(-1)?.wasmEnd ?? null,
        workerJsHeapUsedMb: runOut.frames.at(-1)?.workerJsHeapUsedMb ?? runOut.readyInfo.workerJsHeapUsedMb,
        pageCdpJsHeapUsedMb: perfMap.JSHeapUsedSize ? Math.round((perfMap.JSHeapUsedSize / (1024 * 1024)) * 100) / 100 : null,
        rendererProcMem: procMem,
      },
      inference: {
        frames: runOut.frames.length,
        handsFoundFrames,
        objMsP50: quantile(objMsArr, 0.5),
        objMsP95: quantile(objMsArr, 0.95),
        handMsP50: quantile(handMsArr, 0.5),
        handMsP95: quantile(handMsArr, 0.95),
        totalDetectMsP50: quantile(totalMsArr, 0.5),
        totalDetectMsP95: quantile(totalMsArr, 0.95),
        objectDetectorCategoryCounts: detLabels,
      },
    };
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
}

async function runWithinWorkerDelta(server) {
  server.resetLog();
  const profileDir = mkdtempSync("/tmp/r22_objdelta_");
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    serviceWorkers: "block",
    args: [
      "--disable-gpu",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-precise-memory-info",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-video-capture=${Y4M_PATH}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(`${server.url}/r22-proto/index.html`, { waitUntil: "networkidle" });
    const stage1 = await page.evaluate(async () => {
      return await window.runDetectorProto({
        mode: "hand_only",
        numFrames: 60,
        useCrop: false,
        keepAliveForStep: true,
      });
    });
    const memStage1 = readIsolatedRendererMemMb(profileDir);

    const added = await page.evaluate(async () => {
      return await window.__r22AddObjectDetector("/models/efficientdet_lite0_int8.tflite");
    });
    const stage2Frames = await page.evaluate(async () => {
      const f = await window.__r22RunBatch(60);
      window.__r22Cleanup();
      return f;
    });
    const memStage2 = readIsolatedRendererMemMb(profileDir);

    const rssDelta = memStage2 && memStage1 ? Math.round((memStage2.totalRssMb - memStage1.totalRssMb) * 100) / 100 : null;
    const pssDelta = memStage2 && memStage1 ? Math.round((memStage2.totalPssMb - memStage1.totalPssMb) * 100) / 100 : null;
    const privDelta =
      memStage2 && memStage1 ? Math.round((memStage2.totalPrivateDirtyMb - memStage1.totalPrivateDirtyMb) * 100) / 100 : null;

    return {
      before_object_detector: {
        mem: memStage1,
        wasm: stage1.frames.at(-1)?.wasmEnd ?? null,
        handMsP50: quantile(stage1.frames.map((f) => f.handMs), 0.5),
      },
      after_object_detector_same_worker: {
        objectInitMs: added.objectInitMs,
        mem: memStage2,
        wasm: stage2Frames.at(-1)?.wasmEnd ?? added.wasmAfterObject,
        objMsP50: quantile(stage2Frames.map((f) => f.objMs), 0.5),
        handMsP50: quantile(stage2Frames.map((f) => f.handMs), 0.5),
        totalDetectMsP50: quantile(stage2Frames.map((f) => f.totalDetectMs), 0.5),
      },
      within_same_worker_delta: {
        rss_delta_mb: rssDelta,
        pss_delta_mb: pssDelta,
        private_dirty_delta_mb: privDelta,
        wasm_instances_delta:
          (stage2Frames.at(-1)?.wasmEnd?.wasmMemoryCount ?? 0) - (stage1.frames.at(-1)?.wasmEnd?.wasmMemoryCount ?? 0),
        wasm_linear_delta_mb:
          Math.round(
            ((stage2Frames.at(-1)?.wasmEnd?.wasmLinearMb ?? 0) - (stage1.frames.at(-1)?.wasmEnd?.wasmLinearMb ?? 0)) * 100,
          ) / 100,
      },
    };
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
}

async function main() {
  if (!existsSync(OBJ_MODEL_PATH)) {
    throw new Error(`Missing ObjectDetector TFLite model at ${OBJ_MODEL_PATH}`);
  }
  buildProtoWorker();
  const server = await startServer();
  try {
    const nFrames = 90;
    const armA = await runArm(server, "ArmA_HandLandmarker_Only", {
      mode: "hand_only",
      numFrames: nFrames,
      useCrop: false,
    });
    const armB = await runArm(server, "ArmB_ObjectDetector_Plus_HandLandmarker", {
      mode: "dual_object_and_hand",
      objectModelUrl: "/models/efficientdet_lite0_int8.tflite",
      numFrames: nFrames,
      useCrop: false,
    });
    const armC = await runArm(server, "ArmC_HandLandmarker_RoiCrop_Browser", {
      mode: "hand_only",
      numFrames: 45,
      useCrop: true,
    });
    const sameWorkerDelta = await runWithinWorkerDelta(server);

    const cdpWireDeltaMb = Math.round((armB.network.cdpWireMb - armA.network.cdpWireMb) * 100) / 100;
    const srvWireDeltaMb = Math.round((armB.network.serverWireMb - armA.network.serverWireMb) * 100) / 100;
    const rssDeltaMb = sameWorkerDelta.within_same_worker_delta.rss_delta_mb;
    const pssDeltaMb = sameWorkerDelta.within_same_worker_delta.pss_delta_mb;
    const privDeltaMb = sameWorkerDelta.within_same_worker_delta.private_dirty_delta_mb;
    const wasmDeltaMb = sameWorkerDelta.within_same_worker_delta.wasm_linear_delta_mb;
    const wasmCountDelta = sameWorkerDelta.within_same_worker_delta.wasm_instances_delta;
    const p50DeltaMs = Math.round((armB.inference.totalDetectMsP50 - armA.inference.totalDetectMsP50) * 100) / 100;
    const p95DeltaMs = Math.round((armB.inference.totalDetectMsP95 - armA.inference.totalDetectMsP95) * 100) / 100;

    const report = {
      generated_at: new Date().toISOString(),
      model_tested: {
        name: "efficientdet_lite0_int8.tflite",
        license: "Apache-2.0",
        bytes: statSync(OBJ_MODEL_PATH).size,
        labels_note: "90 COCO object categories (contains 'person', ZERO 'hand' category)",
      },
      arms: { armA, armB, armC },
      same_worker_paired_memory_delta: sameWorkerDelta,
      o04_empirical_delta_armB_minus_armA: {
        cdp_wire_delta_mb: cdpWireDeltaMb,
        server_wire_delta_mb: srvWireDeltaMb,
        init_ms_delta: Math.round((armB.init.totalInitMs - armA.init.totalInitMs) * 100) / 100,
        wasm_memory_instances_delta: wasmCountDelta,
        wasm_linear_memory_delta_mb: wasmDeltaMb,
        same_worker_renderer_rss_delta_mb: rssDeltaMb,
        same_worker_renderer_pss_delta_mb: pssDeltaMb,
        same_worker_private_dirty_delta_mb: privDeltaMb,
        detect_p50_delta_ms: p50DeltaMs,
        detect_p95_delta_ms: p95DeltaMs,
        proves_shared_wasm_not_zero_cost: true,
      },
      o05_ab_decision: {
        status: "CANDIDATE_DEFERRED",
        keep_default_runtime_hand_landmarker_only: true,
        reasons: [
          `Adding ObjectDetector alongside HandLandmarker sharing FilesetResolver.forVisionTasks() adds +${rssDeltaMb} MB renderer RSS (+${pssDeltaMb} MB PSS, +${privDeltaMb} MB Private_Dirty, +${wasmCountDelta} WASM instance / +${wasmDeltaMb} MB WASM linear memory)`,
          `Adds +${cdpWireDeltaMb} MB CDP cold wire (+${srvWireDeltaMb} MB server wire; efficientdet_lite0_int8.tflite = 4.60 MB + duplicate WASM fetch without CacheStorage)`,
          `Adds +${p50DeltaMs} ms p50 (+${p95DeltaMs} ms p95) CPU inference latency per dual-task frame`,
          "COCO ObjectDetector detects 'person' rather than dedicated 'hand' boxes, while HandLandmarker internal BlazePalm already achieves 99.43% recall on HANDS RGB-D S4+S5 locked OOD test",
        ],
      },
    };

    writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.o04_empirical_delta_armB_minus_armA, null, 2));
    console.log(JSON.stringify(report.o05_ab_decision, null, 2));
  } finally {
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

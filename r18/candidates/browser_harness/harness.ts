import { createHandLandmarker, getDelegateInfo, type CreatedHandLandmarker } from "../repo/frontend/implementation/src/camera/hand-landmarker";
import { claheRgba } from "../repo/frontend/implementation/src/camera/clahe";
import { BACKLIGHT_CENTER_MAX, BACKLIGHT_LUMA_GAP, DARK_LUMA, ENHANCE_WIDTH } from "../repo/frontend/implementation/src/camera/frame-source";
import { centerLuma, meanLuma } from "../repo/frontend/implementation/src/camera/luma";
import { GameplayGestureFilter } from "../repo/frontend/implementation/src/input/gameplay-gesture";
import { classifyHandPose, countExtendedFingers, palmCenterNormalized } from "../repo/frontend/implementation/src/input/hand-gesture";
import type { Landmark } from "../repo/frontend/implementation/src/input/types";
import { Ux3RuntimePipeline } from "../candidates/ux3_integrated";
import type { Ux3ExportedModel } from "../candidates/ux3_model";

declare global {
  interface Window {
    __R18_HARNESS__?: {
      ready: boolean;
      error: string | null;
      getMetrics: () => any;
      stop: () => Promise<any>;
    };
  }
}

const stats = {
  framesTotal: 0,
  mpFramesProcessed: 0,
  rawHits: 0,
  adaptiveTotalHits: 0,
  claheFallbackCalls: 0,
  claheFallbackHits: 0,
  baseSteerFrames: 0,
  ux3SteerFrames: 0,
  baseEraseFrames: 0,
  ux3EraseFrames: 0,
  ux3PinchFrames: 0,
  ux3SwipeFires: 0,
  detectMs: [] as number[],
  claheMs: [] as number[],
  ux3Ms: [] as number[],
  e2eMs: [] as number[],
  rafDtMs: [] as number[],
  longTasks: [] as Array<{ startTime: number; duration: number }>,
  stoppedCleanly: false,
  tracksEndedCount: 0,
  tracksTotalCount: 0,
};

function capPush(arr: number[], v: number, maxLen = 4000) {
  if (arr.length < maxLen) arr.push(v);
  else {
    // reservoir overwrite
    const idx = Math.floor(Math.random() * maxLen);
    arr[idx] = v;
  }
}

function quant(arr: number[], q: number): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]! * 100) / 100;
}

async function boot() {
  const statusEl = document.getElementById("status")!;
  const video = document.getElementById("cam") as HTMLVideoElement;
  const canvas = document.getElementById("work") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  try {
    if (typeof PerformanceObserver !== "undefined") {
      try {
        const obs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            stats.longTasks.push({ startTime: Math.round(e.startTime), duration: Math.round(e.duration * 100) / 100 });
          }
        });
        obs.observe({ entryTypes: ["longtask"] });
      } catch { /* ignore */ }
    }

    const tBoot0 = performance.now();
    const [modelResp, , created, stream] = await Promise.all([
      fetch("/r18-harness/ux3_model_mlp.json").then((r) => r.json() as Promise<Ux3ExportedModel>),
      fetch("/mediapipe/blaze_face_short_range.tflite").then((r) => r.arrayBuffer()),
      createHandLandmarker({ wasmRoot: "/mediapipe/wasm", modelUrl: "/models/hand_landmarker.task" }),
      navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 } }, audio: false }),
    ]);

    video.srcObject = stream;
    await new Promise<void>((res) => {
      if (video.readyState >= 2) return res();
      video.addEventListener("loadeddata", () => res(), { once: true });
    });
    await video.play();

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 360;
    const cw = ENHANCE_WIDTH;
    const ch = Math.max(1, Math.round((cw * vh) / vw));
    canvas.width = cw;
    canvas.height = ch;

    const aspect = vw / vh;
    const ux3Pipe = new Ux3RuntimePipeline(modelResp, aspect);
    const baseFilter = new GameplayGestureFilter();
    const bootMs = Math.round(performance.now() - tBoot0);

    let running = true;
    let recFrames = 0;
    let lastVidTime = -1;
    let lastRafMs: number | null = null;
    let lastMpTimestamp = 0;
    const startWall = performance.now();

    const getSummary = () => {
      const elapsedS = Math.max(0.001, (performance.now() - startWall) / 1000);
      const mem = (performance as any).memory;
      return {
        ready: true,
        bootMs,
        elapsedSec: Math.round(elapsedS * 100) / 100,
        delegateInfo: { delegate: created.delegate, reason: created.reason, fellBack: created.fellBack, runtime: getDelegateInfo() },
        videoSize: `${vw}x${vh}`,
        framesTotal: stats.framesTotal,
        mpFramesProcessed: stats.mpFramesProcessed,
        effectiveMpFps: Math.round((stats.mpFramesProcessed / elapsedS) * 100) / 100,
        rafFps: Math.round((stats.framesTotal / elapsedS) * 100) / 100,
        rawHits: stats.rawHits,
        adaptiveTotalHits: stats.adaptiveTotalHits,
        adaptiveDetRatePct: stats.mpFramesProcessed ? Math.round((10000 * stats.adaptiveTotalHits) / stats.mpFramesProcessed) / 100 : 0,
        claheFallbackCalls: stats.claheFallbackCalls,
        claheFallbackHits: stats.claheFallbackHits,
        falseSteerBaseVsUx3: [stats.baseSteerFrames, stats.ux3SteerFrames],
        falseEraseBaseVsUx3: [stats.baseEraseFrames, stats.ux3EraseFrames],
        ux3PinchFrames: stats.ux3PinchFrames,
        ux3SwipeFires: stats.ux3SwipeFires,
        detectMs: { p50: quant(stats.detectMs, 0.5), p95: quant(stats.detectMs, 0.95), max: quant(stats.detectMs, 1.0) },
        claheMs: { p50: quant(stats.claheMs, 0.5), p95: quant(stats.claheMs, 0.95) },
        ux3Ms: { p50: quant(stats.ux3Ms, 0.5), p95: quant(stats.ux3Ms, 0.95) },
        e2eMs: { p50: quant(stats.e2eMs, 0.5), p95: quant(stats.e2eMs, 0.95), max: quant(stats.e2eMs, 1.0) },
        rafIntervalMs: { p50: quant(stats.rafDtMs, 0.5), p95: quant(stats.rafDtMs, 0.95), max: quant(stats.rafDtMs, 1.0) },
        longTasksCount: stats.longTasks.length,
        longTasksMaxMs: stats.longTasks.reduce((m, x) => Math.max(m, x.duration), 0),
        jsHeapUsedMB: mem ? Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 100) / 100 : null,
        jsHeapTotalMB: mem ? Math.round((mem.totalJSHeapSize / (1024 * 1024)) * 100) / 100 : null,
        stoppedCleanly: stats.stoppedCleanly,
        tracksEndedCount: stats.tracksEndedCount,
        tracksTotalCount: stats.tracksTotalCount,
      };
    };

    window.__R18_HARNESS__ = {
      ready: true,
      error: null,
      getMetrics: getSummary,
      stop: async () => {
        running = false;
        const tracks = stream.getTracks();
        stats.tracksTotalCount = tracks.length;
        for (const tr of tracks) tr.stop();
        stats.tracksEndedCount = tracks.filter((tr) => tr.readyState === "ended").length;
        video.srcObject = null;
        created.landmarker.close();
        stats.stoppedCleanly = stats.tracksEndedCount === stats.tracksTotalCount;
        return getSummary();
      },
    };

    const nextTs = (nowMs: number) => {
      lastMpTimestamp = Math.max(lastMpTimestamp + 1, Math.round(nowMs));
      return lastMpTimestamp;
    };

    function stepFrame(nowMs: number) {
      if (!running) return;
      stats.framesTotal++;
      if (lastRafMs !== null) capPush(stats.rafDtMs, nowMs - lastRafMs);
      lastRafMs = nowMs;

      if (video.readyState >= 2 && video.currentTime !== lastVidTime) {
        lastVidTime = video.currentTime;
        const tFrame0 = performance.now();
        stats.mpFramesProcessed++;

        // Quick 320px draw & luma check
        ctx.drawImage(video, 0, 0, cw, ch);
        const img = ctx.getImageData(0, 0, cw, ch);
        const ml = meanLuma(img.data, cw, ch, 2);
        const cl = centerLuma(img.data, cw, ch, 2);
        const isDark = ml < DARK_LUMA || (cl < BACKLIGHT_CENTER_MAX && ml - cl >= BACKLIGHT_LUMA_GAP);

        let landmarks: Landmark[][] = [];
        let tDetStart = performance.now();
        if (recFrames > 0) {
          recFrames--;
          const tc0 = performance.now();
          claheRgba(img.data, cw, ch, {}, img.data);
          ctx.putImageData(img, 0, 0);
          capPush(stats.claheMs, performance.now() - tc0);
          stats.claheFallbackCalls++;
          tDetStart = performance.now();
          const res = created.landmarker.detectForVideo(canvas, nextTs(performance.now()));
          capPush(stats.detectMs, performance.now() - tDetStart);
          landmarks = res.landmarks as Landmark[][];
          if (landmarks.length > 0) stats.claheFallbackHits++;
          else recFrames = 0;
        } else {
          const resRaw = created.landmarker.detectForVideo(video, nextTs(performance.now()));
          capPush(stats.detectMs, performance.now() - tDetStart);
          landmarks = resRaw.landmarks as Landmark[][];
          if (landmarks.length > 0) {
            stats.rawHits++;
          } else if (isDark) {
            const tc0 = performance.now();
            claheRgba(img.data, cw, ch, {}, img.data);
            ctx.putImageData(img, 0, 0);
            capPush(stats.claheMs, performance.now() - tc0);
            stats.claheFallbackCalls++;
            const td1 = performance.now();
            const resC = created.landmarker.detectForVideo(canvas, nextTs(performance.now()));
            capPush(stats.detectMs, performance.now() - td1);
            landmarks = resC.landmarks as Landmark[][];
            if (landmarks.length > 0) {
              stats.claheFallbackHits++;
              recFrames = 5;
            }
          }
        }

        if (landmarks.length > 0) stats.adaptiveTotalHits++;

        const tUx0 = performance.now();
        const lm = landmarks[0];
        if (!lm || lm.length < 21) {
          baseFilter.update(undefined, nowMs);
          ux3Pipe.step(undefined, nowMs, "none", 0, 0, 0);
        } else {
          const revPose = classifyHandPose(lm, { experimentalRobust: true, aspect });
          const bPose = classifyHandPose(lm);
          const bCnt = countExtendedFingers(lm);
          const c = palmCenterNormalized(lm);
          const ps = Math.max(
            Math.hypot((lm[9]!.x - lm[0]!.x) * aspect, lm[9]!.y - lm[0]!.y),
            Math.hypot((lm[17]!.x - lm[5]!.x) * aspect, lm[17]!.y - lm[5]!.y),
          );
          const bf = baseFilter.update(lm, nowMs);
          const u3 = ux3Pipe.step(lm, nowMs, revPose, c.x, c.y, ps);
          if (bf.input.left || bf.input.right || bf.input.jump) stats.baseSteerFrames++;
          if (u3.steer.zone !== "stop") stats.ux3SteerFrames++;
          if ((bPose === "open-palm" || bPose === "split-palm") && bCnt === 5) stats.baseEraseFrames++;
          if (u3.eraseActive) stats.ux3EraseFrames++;
          if (u3.pinchActive) stats.ux3PinchFrames++;
          if (u3.swipeAction) stats.ux3SwipeFires++;
        }
        capPush(stats.ux3Ms, performance.now() - tUx0);
        capPush(stats.e2eMs, performance.now() - tFrame0);
        if (stats.mpFramesProcessed % 20 === 0) {
          statusEl.textContent = `frames=${stats.mpFramesProcessed} hits=${stats.adaptiveTotalHits}`;
        }
      }

      requestAnimationFrame(stepFrame);
    }

    statusEl.textContent = "RUNNING";
    requestAnimationFrame(stepFrame);
  } catch (err: any) {
    statusEl.textContent = "ERROR: " + (err?.message ?? String(err));
    window.__R18_HARNESS__ = {
      ready: false,
      error: err?.stack ?? String(err),
      getMetrics: () => ({ error: err?.message ?? String(err) }),
      stop: async () => ({}),
    };
  }
}

void boot();

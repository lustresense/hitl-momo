import {
  createHandLandmarker,
  getDelegateInfo,
} from "../../r18-ux0-sandbox/repo/frontend/implementation/src/camera/hand-landmarker";
import { claheRgba } from "../../r18-ux0-sandbox/repo/frontend/implementation/src/camera/clahe";
import {
  BACKLIGHT_CENTER_MAX,
  BACKLIGHT_LUMA_GAP,
  DARK_LUMA,
  ENHANCE_WIDTH,
} from "../../r18-ux0-sandbox/repo/frontend/implementation/src/camera/frame-source";
import { centerLuma, meanLuma } from "../../r18-ux0-sandbox/repo/frontend/implementation/src/camera/luma";
import { GameplayGestureFilter } from "../../r18-ux0-sandbox/repo/frontend/implementation/src/input/gameplay-gesture";
import {
  classifyHandPose,
  palmCenterNormalized,
} from "../../r18-ux0-sandbox/repo/frontend/implementation/src/input/hand-gesture";
import type { Landmark } from "../../r18-ux0-sandbox/repo/frontend/implementation/src/input/types";
import { classifyPistolGeometry } from "../g1_geom/pistol_geometry";
import { PistolVirtualKeyFSM } from "../g1_geom/pistol_fsm";
import type { R19ExportedModel } from "../train/r19_model";
import { R19RuntimePipeline } from "../train/r19_integrated";

declare global {
  interface Window {
    __R19_HARNESS__?: {
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
  g0SteerFrames: 0,
  g1ReadyFrames: 0,
  g1PressFrames: 0,
  g1ActiveFrames: 0,
  r19ReadyFrames: 0,
  r19PressFrames: 0,
  r19OtherFrames: 0,
  r19ActiveFrames: 0,
  r19KeyDownCount: 0,
  r19KeyUpCount: 0,
  r19JumpCount: 0,
  r19EraseFrames: 0,
  r19PinchFrames: 0,
  r19SwipeFires: 0,
  detectMs: [] as number[],
  claheMs: [] as number[],
  r19Ms: [] as number[],
  e2eMs: [] as number[],
  rafDtMs: [] as number[],
  longTasks: [] as Array<{ startTime: number; duration: number }>,
  stoppedCleanly: false,
  tracksEndedCount: 0,
  tracksTotalCount: 0,
};

function capPush(arr: number[], v: number, maxLen = 4000) {
  if (arr.length < maxLen) arr.push(v);
  else arr[Math.floor(Math.random() * maxLen)] = v;
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
      } catch {
        /* ignore */
      }
    }

    const tBoot0 = performance.now();
    const [modelResp, , created, stream] = await Promise.all([
      fetch("/r19-harness/r19_model_mlp.json").then((r) => r.json() as Promise<R19ExportedModel>),
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
    const g0Filter = new GameplayGestureFilter();
    const g1Fsm = new PistolVirtualKeyFSM({ aspect });
    const r19Pipe = new R19RuntimePipeline(modelResp, aspect);
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
        counts: {
          g0SteerFrames: stats.g0SteerFrames,
          g1ReadyFrames: stats.g1ReadyFrames,
          g1PressFrames: stats.g1PressFrames,
          g1ActiveFrames: stats.g1ActiveFrames,
          r19ReadyFrames: stats.r19ReadyFrames,
          r19PressFrames: stats.r19PressFrames,
          r19OtherFrames: stats.r19OtherFrames,
          r19ActiveFrames: stats.r19ActiveFrames,
          r19KeyDownCount: stats.r19KeyDownCount,
          r19KeyUpCount: stats.r19KeyUpCount,
          r19JumpCount: stats.r19JumpCount,
          r19EraseFrames: stats.r19EraseFrames,
          r19PinchFrames: stats.r19PinchFrames,
          r19SwipeFires: stats.r19SwipeFires,
        },
        detectMs: { p50: quant(stats.detectMs, 0.5), p95: quant(stats.detectMs, 0.95), max: quant(stats.detectMs, 1.0) },
        claheMs: { p50: quant(stats.claheMs, 0.5), p95: quant(stats.claheMs, 0.95) },
        r19Ms: { p50: quant(stats.r19Ms, 0.5), p95: quant(stats.r19Ms, 0.95), max: quant(stats.r19Ms, 1.0) },
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

    window.__R19_HARNESS__ = {
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

        const lm = landmarks[0];
        if (!lm || lm.length < 21) {
          g0Filter.update(undefined, nowMs);
          g1Fsm.update(undefined, nowMs);
          const tR0 = performance.now();
          const rOut = r19Pipe.step(undefined, nowMs);
          capPush(stats.r19Ms, performance.now() - tR0);
          if (rOut.fsm.keyEvent === "KEYUP") stats.r19KeyUpCount++;
        } else {
          const g0Out = g0Filter.update(lm, nowMs);
          if (g0Out.input.left || g0Out.input.right || g0Out.input.jump) stats.g0SteerFrames++;

          const g1Cls = classifyPistolGeometry(lm, aspect);
          const g1Step = g1Fsm.update(lm, nowMs, g1Cls);
          if (g1Cls.state === "POINT_READY") stats.g1ReadyFrames++;
          else if (g1Cls.state === "POINT_PRESS") stats.g1PressFrames++;
          if (g1Step.input.left || g1Step.input.right || g1Step.input.jump) stats.g1ActiveFrames++;

          const revPose = classifyHandPose(lm, { experimentalRobust: true, aspect });
          const c = palmCenterNormalized(lm);
          const ps = Math.max(
            Math.hypot((lm[9]!.x - lm[0]!.x) * aspect, lm[9]!.y - lm[0]!.y),
            Math.hypot((lm[17]!.x - lm[5]!.x) * aspect, lm[17]!.y - lm[5]!.y),
          );

          const tR0 = performance.now();
          const rOut = r19Pipe.step(lm, nowMs, revPose, c.x, c.y, ps);
          capPush(stats.r19Ms, performance.now() - tR0);

          if (rOut.geomState === "POINT_READY") stats.r19ReadyFrames++;
          else if (rOut.geomState === "POINT_PRESS") stats.r19PressFrames++;
          else stats.r19OtherFrames++;

          if (rOut.steer.input.left || rOut.steer.input.right || rOut.steer.input.jump) stats.r19ActiveFrames++;
          if (rOut.fsm.keyEvent === "KEYDOWN") stats.r19KeyDownCount++;
          if (rOut.fsm.keyEvent === "KEYUP") stats.r19KeyUpCount++;
          if (rOut.fsm.jumpFiredThisFrame) stats.r19JumpCount++;
          if (rOut.eraseActive) stats.r19EraseFrames++;
          if (rOut.pinchActive) stats.r19PinchFrames++;
          if (rOut.swipeAction) stats.r19SwipeFires++;
        }

        capPush(stats.e2eMs, performance.now() - tFrame0);
        if (stats.mpFramesProcessed % 20 === 0) {
          statusEl.textContent = `frames=${stats.mpFramesProcessed} hits=${stats.adaptiveTotalHits} press=${stats.r19PressFrames}`;
        }
      }

      requestAnimationFrame(stepFrame);
    }

    statusEl.textContent = "RUNNING";
    requestAnimationFrame(stepFrame);
  } catch (err: any) {
    statusEl.textContent = "ERROR: " + (err?.message ?? String(err));
    window.__R19_HARNESS__ = {
      ready: false,
      error: err?.stack ?? String(err),
      getMetrics: () => ({ error: err?.message ?? String(err) }),
      stop: async () => ({}),
    };
  }
}

void boot();

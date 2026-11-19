/**
 * R20 CPU-Only Browser Benchmark Harness (`r20/candidates/browser_harness/harness.ts`).
 *
 * Evaluates paired `C0 (R19 Frozen)` vs `R20 (C4/C7 Student)` inside headless/real Chromium
 * under strict CPU-only vision inference (`delegate: "CPU"`, `gpuDelegateAttempted: false`,
 * `gpuDelegateActive: false`), comparing:
 *  - Variant A: `cpu-main-thread` (synchronous `HandLandmarker.detectForVideo` on UI thread)
 *  - Variant B: `cpu-web-worker` (`r20_hand_landmarker.worker.ts` via transferable `ImageBitmap`,
 *    `maxInFlight = 1` latest-frame-wins, `bitmap.close()`, fail-closed `RELEASE_ALL`)
 *  - `numHands = 2` (default multi-hand ownership/anti-distraction) vs `numHands = 1` ablation
 */
import { GameplayGestureFilter } from "../../../../r18-ux0-sandbox/repo/frontend/implementation/src/input/gameplay-gesture";
import {
  classifyHandPose,
  palmCenterNormalized,
} from "../../../../r18-ux0-sandbox/repo/frontend/implementation/src/input/hand-gesture";
import type { Landmark } from "../../../r19/candidates/pistol_types";
import { R19RuntimePipeline } from "../../../r19/candidates/r19_integrated";
import type { R19ExportedModel } from "../../../r19/candidates/r19_model";
import {
  R20CpuHandDetector,
  type R20ExecutionVariant,
  type R20HandDetectionFrameResult,
} from "../r20_hand_landmarker_cpu";
import type { R20LowLightMode } from "../r20_lowlight_frame_source";

declare global {
  interface Window {
    __R20_HARNESS__?: {
      ready: boolean;
      error: string | null;
      getMetrics: () => any;
      simulateLifecycleRelease: (reason: string) => any;
      stop: () => Promise<any>;
    };
  }
}

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

  const params = new URLSearchParams(window.location.search);
  const variant = (params.get("variant") || "cpu-web-worker") as R20ExecutionVariant;
  const numHands = Number(params.get("numHands") || "2");
  const dynamicOwnerLock = params.get("dynamicOwnerLock") === "1";
  const lowLightMode = (params.get("lowLightMode") || "adaptive-fallback") as R20LowLightMode;
  const captureWidth = Number(params.get("captureWidth") || "320");

  const stats = {
    variant,
    numHands,
    lowLightMode,
    captureWidth,
    delegate: "CPU" as const,
    gpuDelegateAttempted: false as const,
    gpuDelegateActive: false as const,
    rafFramesTotal: 0,
    mpFramesCompleted: 0,
    handsDetectedFrames: 0,
    a3EnhancedRecoveryFrames: 0,
    mainThreadDispatchMs: [] as number[],
    preprocessMs: [] as number[],
    detectMs: [] as number[],
    setOptionsMs: [] as number[],
    e2eMs: [] as number[],
    lastOwnerGuard: null as R20HandDetectionFrameResult["ownerGuard"] | null,
    monotonicClamps: 0,
    c0ClassifierMs: [] as number[],
    r20ClassifierMs: [] as number[],
    rafDtMs: [] as number[],
    uiFps1sWindows: [] as number[],
    longTasksAfterBoot: [] as Array<{ startTime: number; duration: number }>,
    c0: {
      readyFrames: 0,
      pressFrames: 0,
      otherFrames: 0,
      activeFrames: 0,
      keydowns: 0,
      keyups: 0,
      jumps: 0,
      releaseAlls: 0,
      stuckKeysNow: false,
    },
    r20: {
      readyFrames: 0,
      pressFrames: 0,
      otherFrames: 0,
      activeFrames: 0,
      keydowns: 0,
      keyups: 0,
      jumps: 0,
      releaseAlls: 0,
      eraseFrames: 0,
      pinchFrames: 0,
      swipeFires: 0,
      stuckKeysNow: false,
    },
    g0SteerFrames: 0,
    stoppedCleanly: false,
    tracksEndedCount: 0,
    tracksTotalCount: 0,
  };

  try {
    const tBoot0 = performance.now();
    const [c0Model, r20Model, , stream] = await Promise.all([
      fetch("/r20-harness/r19_model_mlp.json").then((r) => r.json() as Promise<R19ExportedModel>),
      fetch("/r20-harness/r20_winner_model.json").then((r) => r.json() as Promise<R19ExportedModel>),
      fetch("/mediapipe/blaze_face_short_range.tflite").then((r) => r.arrayBuffer()),
      navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 } },
        audio: false,
      }),
    ]);

    video.srcObject = stream;
    await new Promise<void>((res) => {
      if (video.readyState >= 2) return res();
      video.addEventListener("loadeddata", () => res(), { once: true });
    });
    await video.play();

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 360;
    const aspect = vw / vh;

    const g0Filter = new GameplayGestureFilter();
    const c0Pipe = new R19RuntimePipeline(c0Model, aspect);
    const r20Pipe = new R19RuntimePipeline(r20Model, aspect);

    const handleFrameResult = (res: R20HandDetectionFrameResult) => {
      stats.mpFramesCompleted++;
      capPush(stats.mainThreadDispatchMs, res.timing.mainThreadDispatchMs);
      capPush(stats.preprocessMs, res.timing.preprocessMs);
      capPush(stats.detectMs, res.timing.detectMs);
      if (typeof res.timing.setOptionsMs === "number" && res.timing.setOptionsMs > 0) {
        capPush(stats.setOptionsMs, res.timing.setOptionsMs);
      }
      capPush(stats.e2eMs, res.timing.totalE2eMs);
      if (res.ownerGuard) stats.lastOwnerGuard = res.ownerGuard;
      if (typeof res.monotonicClamps === "number") stats.monotonicClamps = res.monotonicClamps;

      if (
        (res.luma.activePass === "A3_gamma_denoise_clahe320" || res.luma.activePass === "A4_denoise_reinhard320") &&
        res.landmarks.length > 0
      ) {
        stats.a3EnhancedRecoveryFrames++;
      }

      const lm = res.landmarks[0] as Landmark[] | undefined;
      const nowMs = res.timestampMs;

      if (!lm || lm.length < 21) {
        g0Filter.update(undefined, nowMs);

        const tC0 = performance.now();
        const c0Out = c0Pipe.step(undefined, nowMs);
        capPush(stats.c0ClassifierMs, performance.now() - tC0);
        if (c0Out.fsm.keyEvent === "KEYUP") stats.c0.keyups++;
        stats.c0.stuckKeysNow = c0Out.fsm.input.left || c0Out.fsm.input.right || c0Out.fsm.input.jump;

        const tR20 = performance.now();
        const r20Out = r20Pipe.step(undefined, nowMs);
        capPush(stats.r20ClassifierMs, performance.now() - tR20);
        if (r20Out.fsm.keyEvent === "KEYUP") stats.r20.keyups++;
        stats.r20.stuckKeysNow = r20Out.fsm.input.left || r20Out.fsm.input.right || r20Out.fsm.input.jump;
        return;
      }

      stats.handsDetectedFrames++;
      const g0Out = g0Filter.update(lm, nowMs);
      if (g0Out.input.left || g0Out.input.right || g0Out.input.jump) stats.g0SteerFrames++;

      const revPose = classifyHandPose(lm, { experimentalRobust: true, aspect });
      const c = palmCenterNormalized(lm);
      const ps = Math.max(
        Math.hypot((lm[9]!.x - lm[0]!.x) * aspect, lm[9]!.y - lm[0]!.y),
        Math.hypot((lm[17]!.x - lm[5]!.x) * aspect, lm[17]!.y - lm[5]!.y),
      );

      // 1. C0 (R19 Frozen)
      const tC0 = performance.now();
      const c0Out = c0Pipe.step(lm, nowMs, revPose, c.x, c.y, ps);
      capPush(stats.c0ClassifierMs, performance.now() - tC0);
      if (c0Out.geomState === "POINT_READY") stats.c0.readyFrames++;
      else if (c0Out.geomState === "POINT_PRESS") stats.c0.pressFrames++;
      else stats.c0.otherFrames++;
      if (c0Out.steer.input.left || c0Out.steer.input.right || c0Out.steer.input.jump) stats.c0.activeFrames++;
      if (c0Out.fsm.keyEvent === "KEYDOWN") stats.c0.keydowns++;
      if (c0Out.fsm.keyEvent === "KEYUP") stats.c0.keyups++;
      if (c0Out.fsm.jumpFiredThisFrame) stats.c0.jumps++;
      stats.c0.stuckKeysNow = c0Out.fsm.input.left || c0Out.fsm.input.right || c0Out.fsm.input.jump;

      // 2. R20 (Winner Student)
      const tR20 = performance.now();
      const r20Out = r20Pipe.step(lm, nowMs, revPose, c.x, c.y, ps);
      capPush(stats.r20ClassifierMs, performance.now() - tR20);
      if (r20Out.geomState === "POINT_READY") stats.r20.readyFrames++;
      else if (r20Out.geomState === "POINT_PRESS") stats.r20.pressFrames++;
      else stats.r20.otherFrames++;
      if (r20Out.steer.input.left || r20Out.steer.input.right || r20Out.steer.input.jump) stats.r20.activeFrames++;
      if (r20Out.fsm.keyEvent === "KEYDOWN") stats.r20.keydowns++;
      if (r20Out.fsm.keyEvent === "KEYUP") stats.r20.keyups++;
      if (r20Out.fsm.jumpFiredThisFrame) stats.r20.jumps++;
      if (r20Out.eraseActive) stats.r20.eraseFrames++;
      if (r20Out.pinchActive) stats.r20.pinchFrames++;
      if (r20Out.swipeAction) stats.r20.swipeFires++;
      stats.r20.stuckKeysNow = r20Out.fsm.input.left || r20Out.fsm.input.right || r20Out.fsm.input.jump;
    };

    const handleReleaseAll = (_reason: string) => {
      c0Pipe.reset();
      r20Pipe.reset();
      stats.c0.releaseAlls++;
      stats.r20.releaseAlls++;
      stats.c0.stuckKeysNow = false;
      stats.r20.stuckKeysNow = false;
    };

    const detector = new R20CpuHandDetector({
      variant,
      wasmRoot: "/mediapipe/wasm",
      modelUrl: "/models/hand_landmarker.task",
      workerScriptUrl: "/r20-harness/r20_worker.bundle.js",
      numHands,
      dynamicOwnerLock,
      lowLightMode,
      captureWidth,
      onResult: handleFrameResult,
      onReleaseAll: handleReleaseAll,
    });

    await detector.init();
    const bootDoneAt = performance.now();
    const bootMs = Math.round(bootDoneAt - tBoot0);

    // Observe main-thread LongTasks (>50 ms) AFTER boot so initial WASM compilation is separated from active runtime
    if (typeof PerformanceObserver !== "undefined") {
      try {
        const obs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (e.startTime >= bootDoneAt) {
              stats.longTasksAfterBoot.push({
                startTime: Math.round(e.startTime - bootDoneAt),
                duration: Math.round(e.duration * 100) / 100,
              });
            }
          }
        });
        obs.observe({ entryTypes: ["longtask"] });
      } catch {
        /* ignore */
      }
    }

    let running = true;
    let lastRafMs: number | null = null;
    let windowStartMs = bootDoneAt;
    let windowFrames = 0;

    const getSummary = () => {
      const elapsedS = Math.max(0.001, (performance.now() - bootDoneAt) / 1000);
      const mem = (performance as any).memory;
      const detTel = detector.getTelemetry();
      return {
        ready: true,
        bootMs,
        elapsedSec: Math.round(elapsedS * 100) / 100,
        variant: stats.variant,
        numHands: stats.numHands,
        lowLightMode: stats.lowLightMode,
        captureWidth: stats.captureWidth,
        delegate: detTel.delegate,
        gpuDelegateAttempted: detTel.gpuDelegateAttempted,
        gpuDelegateActive: detTel.gpuDelegateActive,
        videoSize: `${vw}x${vh}`,
        rafFramesTotal: stats.rafFramesTotal,
        mpFramesCompleted: stats.mpFramesCompleted,
        effectiveMpFps: Math.round((stats.mpFramesCompleted / elapsedS) * 100) / 100,
        uiFpsMean: Math.round((stats.rafFramesTotal / elapsedS) * 100) / 100,
        uiFpsP5: quant(stats.uiFps1sWindows, 0.05),
        uiFpsP50: quant(stats.uiFps1sWindows, 0.5),
        handsDetectedFrames: stats.handsDetectedFrames,
        detectionCoveragePct: stats.mpFramesCompleted
          ? Math.round((10000 * stats.handsDetectedFrames) / stats.mpFramesCompleted) / 100
          : 0,
        a3EnhancedRecoveryFrames: stats.a3EnhancedRecoveryFrames,
        detectorTelemetry: detTel,
        mainThreadDispatchMs: {
          p50: quant(stats.mainThreadDispatchMs, 0.5),
          p95: quant(stats.mainThreadDispatchMs, 0.95),
          max: quant(stats.mainThreadDispatchMs, 1.0),
        },
        preprocessMs: {
          p50: quant(stats.preprocessMs, 0.5),
          p95: quant(stats.preprocessMs, 0.95),
        },
        detectMs: {
          p50: quant(stats.detectMs, 0.5),
          p95: quant(stats.detectMs, 0.95),
          max: quant(stats.detectMs, 1.0),
        },
        setOptionsMs: {
          calls: stats.setOptionsMs.length,
          p50: quant(stats.setOptionsMs, 0.5),
          p95: quant(stats.setOptionsMs, 0.95),
          max: quant(stats.setOptionsMs, 1.0),
        },
        ownerGuard: stats.lastOwnerGuard,
        monotonicClamps: stats.monotonicClamps,
        r20ClassifierMs: {
          p50: quant(stats.r20ClassifierMs, 0.5),
          p95: quant(stats.r20ClassifierMs, 0.95),
          max: quant(stats.r20ClassifierMs, 1.0),
        },
        e2eMs: {
          p50: quant(stats.e2eMs, 0.5),
          p95: quant(stats.e2eMs, 0.95),
          max: quant(stats.e2eMs, 1.0),
        },
        rafIntervalMs: {
          p50: quant(stats.rafDtMs, 0.5),
          p95: quant(stats.rafDtMs, 0.95),
          max: quant(stats.rafDtMs, 1.0),
        },
        longTasksAfterBootCount: stats.longTasksAfterBoot.length,
        longTasksAfterBootMaxMs: stats.longTasksAfterBoot.reduce((m, x) => Math.max(m, x.duration), 0),
        c0Counts: stats.c0,
        r20Counts: stats.r20,
        g0SteerFrames: stats.g0SteerFrames,
        jsHeapUsedMB: mem ? Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 100) / 100 : null,
        jsHeapTotalMB: mem ? Math.round((mem.totalJSHeapSize / (1024 * 1024)) * 100) / 100 : null,
        stoppedCleanly: stats.stoppedCleanly,
        tracksEndedCount: stats.tracksEndedCount,
        tracksTotalCount: stats.tracksTotalCount,
      };
    };

    window.__R20_HARNESS__ = {
      ready: true,
      error: null,
      getMetrics: getSummary,
      simulateLifecycleRelease: (reason: string) => {
        detector.triggerReleaseAll(reason);
        return {
          releaseAllCount: detector.getTelemetry().releaseAllCount,
          lastReleaseReason: detector.getTelemetry().lastReleaseReason,
          c0Stuck: stats.c0.stuckKeysNow,
          r20Stuck: stats.r20.stuckKeysNow,
        };
      },
      stop: async () => {
        running = false;
        detector.close("harness-stop");
        const tracks = stream.getTracks();
        stats.tracksTotalCount = tracks.length;
        for (const tr of tracks) tr.stop();
        stats.tracksEndedCount = tracks.filter((tr) => tr.readyState === "ended").length;
        video.srcObject = null;
        stats.stoppedCleanly =
          stats.tracksEndedCount === stats.tracksTotalCount &&
          !stats.c0.stuckKeysNow &&
          !stats.r20.stuckKeysNow;
        return getSummary();
      },
    };

    function stepFrame(nowMs: number) {
      if (!running) return;
      stats.rafFramesTotal++;
      windowFrames++;
      if (nowMs - windowStartMs >= 1000) {
        const fps = (windowFrames * 1000) / (nowMs - windowStartMs);
        capPush(stats.uiFps1sWindows, Math.round(fps * 100) / 100);
        windowFrames = 0;
        windowStartMs = nowMs;
      }
      if (lastRafMs !== null) capPush(stats.rafDtMs, nowMs - lastRafMs);
      lastRafMs = nowMs;

      void detector.submitVideoFrame(video, nowMs);

      if (stats.rafFramesTotal % 60 === 0) {
        statusEl.textContent = `variant=${variant} mpFrames=${stats.mpFramesCompleted} hits=${stats.handsDetectedFrames} r20Press=${stats.r20.pressFrames}`;
      }
      requestAnimationFrame(stepFrame);
    }

    statusEl.textContent = "RUNNING";
    requestAnimationFrame(stepFrame);
  } catch (err: any) {
    statusEl.textContent = "ERROR: " + (err?.message ?? String(err));
    window.__R20_HARNESS__ = {
      ready: false,
      error: err?.stack ?? String(err),
      getMetrics: () => ({ error: err?.message ?? String(err) }),
      simulateLifecycleRelease: () => ({}),
      stop: async () => ({}),
    };
  }
}

void boot();

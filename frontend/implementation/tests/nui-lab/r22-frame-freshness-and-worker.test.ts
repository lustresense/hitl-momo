// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  CameraFrameScheduler,
  STALE_FRAME_THRESHOLD_MS,
  computeCaptureFrameAgeMs,
  isCaptureFrameStale,
  type VideoFrameCallbackMetadataLike,
} from "@/src/components/nui-lab/bench/frame-scheduler";
import {
  OneEuroFilter1D,
  OneEuroLandmark21Filter,
  OneEuroPoint2DFilter,
} from "@/src/components/nui-lab/bench/one-euro";
import {
  R22_DIM_RECOVERY_LUMA,
  R22_HIGHLIGHT_KNEE_CEILING,
  R22_HIGHLIGHT_KNEE_START,
  analyzeFrameLuma,
  applyHighlightSoftKneeInPlace,
  applyR22CandidateRecoveryInPlace,
  probeCameraExposureCapabilities,
  reinhardWithSoftKneeInPlace,
  suppressShadowChromaNoiseInPlace,
} from "@/src/components/nui-lab/bench/r20-lowlight";
import { LabCpuWorkerClient, type CpuWorkerResult } from "@/src/components/nui-lab/bench/r20-worker-client";
import {
  WorkerOwnerGuard,
  createR22OwnerGuard,
  type WorkerPoint3,
} from "@/src/components/nui-lab/bench/worker-owner-guard";

function makeHandAt(wx: number, wy: number, size = 0.22): WorkerPoint3[] {
  return Array.from({ length: 21 }, (_, i) => ({
    x: wx + (i === 0 ? 0 : ((i % 5) / 4) * size),
    y: wy + (i === 0 ? 0 : (Math.floor(i / 5) / 4) * size),
    z: 0,
  }));
}

function makeFakeVideo(opts: {
  width?: number;
  height?: number;
  totalVideoFrames?: () => number;
  currentTime?: () => number;
  rvfc?: boolean;
} = {}) {
  const listeners = new Set<(now: number, meta: VideoFrameCallbackMetadataLike) => void>();
  let nextHandle = 1;
  const handles = new Map<number, (now: number, meta: VideoFrameCallbackMetadataLike) => void>();
  const video = {
    readyState: 4,
    videoWidth: opts.width ?? 1280,
    videoHeight: opts.height ?? 720,
    get currentTime() {
      return opts.currentTime ? opts.currentTime() : 0;
    },
    ...(opts.totalVideoFrames
      ? {
          getVideoPlaybackQuality: () => ({
            totalVideoFrames: opts.totalVideoFrames!(),
            droppedVideoFrames: 0,
            corruptedVideoFrames: 0,
            creationTime: 0,
          }),
        }
      : {}),
    ...(opts.rvfc
      ? {
          requestVideoFrameCallback: (cb: (now: number, meta: VideoFrameCallbackMetadataLike) => void) => {
            const id = nextHandle++;
            handles.set(id, cb);
            listeners.add(cb);
            return id;
          },
          cancelVideoFrameCallback: (id: number) => {
            const cb = handles.get(id);
            if (cb) {
              listeners.delete(cb);
              handles.delete(id);
            }
          },
        }
      : {}),
  } as unknown as HTMLVideoElement;

  const fireRvfc = (now: number, presentedFrames: number, mediaTime: number) => {
    const cbs = [...handles.entries()];
    handles.clear();
    listeners.clear();
    for (const [, cb] of cbs) {
      cb(now, {
        presentationTime: now,
        expectedDisplayTime: now + 16.6,
        width: opts.width ?? 1280,
        height: opts.height ?? 720,
        mediaTime,
        presentedFrames,
      });
    }
  };

  return { video, fireRvfc };
}

describe("R22 CameraFrameScheduler: unique camera frames & duplicate suppression (W02, W03, P08)", () => {
  it("skips duplicate polls at 60 Hz & 144 Hz when camera delivers 15 unique FPS via RVFC and enforces processedFrames <= capturedUniqueFrames", () => {
    let clockMs = 1000;
    const sched = new CameraFrameScheduler({ now: () => clockMs });
    const { video, fireRvfc } = makeFakeVideo({ rvfc: true });
    const ticks: number[] = [];
    sched.onNewCameraFrame((t) => ticks.push(t.captureFrameId));

    sched.start(video);
    // Simulate 1 second of 15 FPS camera frames (dt ≈ 66.67 ms) while worker callback & 60/144Hz polls fire constantly
    for (let camIdx = 1; camIdx <= 15; camIdx++) {
      clockMs = 1000 + Math.round((camIdx - 1) * (1000 / 15));
      fireRvfc(clockMs, camIdx, camIdx / 15);
      // Worker callback claims the frame once
      const claimed = sched.pollAndClaim(video, clockMs);
      expect(claimed?.captureFrameId).toBe(camIdx);
      sched.markProcessed(camIdx);

      // 8 extra 144Hz-like completion/poll checks before next camera frame arrive -> MUST ALL be skipped!
      for (let sub = 1; sub <= 8; sub++) {
        const subMs = clockMs + sub * 7;
        expect(sched.pollAndClaim(video, subMs)).toBeNull();
        expect(sched.claimLatestUnprocessedFrame()).toBeNull();
      }
    }

    // Duplicate presentedFrames event from browser MUST also be skipped
    fireRvfc(clockMs + 5, 15, 1.0);

    const stats = sched.getStats(clockMs + 10);
    sched.stop();
    expect(ticks).toHaveLength(15);
    expect(stats.capturedUniqueFrames).toBe(15);
    expect(stats.dispatchedFrames).toBe(15);
    expect(stats.processedFrames).toBe(15);
    expect(stats.processedFrames).toBeLessThanOrEqual(stats.capturedUniqueFrames);
    expect(stats.framesSkippedDuplicate).toBeGreaterThanOrEqual(15 * 8);
    expect(stats.uniqueCaptureFps).toBeGreaterThanOrEqual(14);
    expect(stats.uniqueCaptureFps).toBeLessThanOrEqual(16);
  });

  it("uses totalVideoFrames fallback on 15 FPS camera polled at 60 Hz without re-inferring identical frames", () => {
    let clockMs = 0;
    let decodedFrames = 0;
    const sched = new CameraFrameScheduler({ useRvfc: false, now: () => clockMs });
    const { video } = makeFakeVideo({
      totalVideoFrames: () => decodedFrames,
      currentTime: () => clockMs / 1000,
    });

    let lastCamStep = -1;
    // 60 polls over 1000 ms (~60 Hz), camera updates every 4th poll (~15 Hz)
    for (let i = 0; i < 60; i++) {
      clockMs = i * 16.67;
      const camStep = Math.floor(i / 4);
      if (camStep !== lastCamStep) {
        decodedFrames++;
        lastCamStep = camStep;
      }
      const tick = sched.pollAndClaim(video, clockMs);
      if (tick) {
        sched.markProcessed(tick.captureFrameId);
      }
    }

    const stats = sched.getStats(clockMs);
    expect(stats.freshnessSource).toBe("playback-quality");
    expect(stats.capturedUniqueFrames).toBe(15);
    expect(stats.processedFrames).toBe(15);
    expect(stats.framesSkippedDuplicate).toBe(45);
    expect(stats.processedFrames).toBeLessThanOrEqual(stats.capturedUniqueFrames);
  });

  it("uses subsampled pixel-SAD fallback when RVFC and totalVideoFrames are absent even if video.currentTime advances", () => {
    let clockMs = 0;
    let frameBytes = new Uint8Array(16 * 9).fill(90);
    const sched = new CameraFrameScheduler({
      useRvfc: false,
      enablePixelSadFallback: true,
      staticSceneHeartbeatMs: 120,
      now: () => clockMs,
      sampleSubsampledLuma: () => frameBytes,
    });
    const { video } = makeFakeVideo({
      currentTime: () => clockMs / 1000, // Advances every poll even on duplicate frames!
    });

    // Poll 1: initial unique frame
    clockMs = 100;
    expect(sched.poll(video, clockMs)?.freshnessSource).toBe("pixel-sad");

    // Polls 2..4 within 120ms with identical pixels -> MUST be skipped as duplicates despite currentTime changing!
    for (const t of [116, 133, 150, 166]) {
      clockMs = t;
      expect(sched.poll(video, clockMs)).toBeNull();
    }
    expect(sched.getStats(clockMs).framesSkippedDuplicate).toBe(4);

    // Real pixel change arrives -> emitted immediately
    frameBytes = new Uint8Array(16 * 9).fill(140);
    clockMs = 183;
    const moved = sched.poll(video, clockMs);
    expect(moved?.freshnessSource).toBe("pixel-sad");
    expect(moved?.captureFrameId).toBe(2);

    // Static scene beyond staticSceneHeartbeatMs -> low-rate heartbeat prevents starvation
    clockMs = 310;
    expect(sched.poll(video, clockMs)?.freshnessSource).toBe("static-heartbeat");
  });

  it("drops superseded queued unique frames before dispatch (latest-frame-wins) and flags stale frames > 150 ms (W08)", () => {
    let clockMs = 1000;
    const sched = new CameraFrameScheduler({ useRvfc: false, now: () => clockMs });
    let decoded = 0;
    const { video } = makeFakeVideo({ totalVideoFrames: () => decoded });

    decoded = 1;
    clockMs = 1000;
    sched.poll(video, clockMs);
    decoded = 2;
    clockMs = 1066;
    sched.poll(video, clockMs);
    decoded = 3;
    clockMs = 1133;
    sched.poll(video, clockMs);

    const claimed = sched.claimLatestUnprocessedFrame();
    expect(claimed?.captureFrameId).toBe(3);
    expect(sched.getStats(clockMs).framesDroppedBeforeDispatch).toBe(2);

    expect(STALE_FRAME_THRESHOLD_MS).toBe(150);
    expect(computeCaptureFrameAgeMs(1000, 1140)).toBe(140);
    expect(isCaptureFrameStale(1000, 1140)).toBe(false);
    expect(isCaptureFrameStale(1000, 1150)).toBe(false);
    expect(isCaptureFrameStale(1000, 1151)).toBe(true);
  });
});

describe("R22 WorkerOwnerGuard & LabCpuWorkerClient: zero runtime setOptions, auto-reacquire, bystander safety, stale detection (W04–W08)", () => {
  it("enforces zero runtime setOptions calls, automatic single-owner lock without relock button, short-blink survival, and 2-hand bystander safety", () => {
    const guard = createR22OwnerGuard({ lockConfirmFrames: 2, emptyResetMs: 300, unmatchedResetMs: 800 });
    expect(guard.policy).toBe("fixed-2");

    const ownerHand = makeHandAt(0.5, 0.5, 0.22);
    const hdRight = [{ categoryName: "Right", score: 0.96 }];

    // Frame 1 (validating) + Frame 2 (locked automatically, NO manual button needed)
    expect(guard.beforeDetect()).toBe(2);
    const s1 = guard.afterDetect([ownerHand], hdRight, 1000);
    expect(s1.ownerTrack.locked).toBe(false);
    expect(s1.nextNumHands).toBe(2);

    expect(guard.beforeDetect()).toBe(2);
    const s2 = guard.afterDetect([ownerHand], hdRight, 1033);
    expect(s2.ownerTrack.locked).toBe(true);
    expect(s2.ownerTrack.trackId).toBe(1);
    expect(s2.nextNumHands).toBe(2);

    // Short blinks at 62ms, 99ms, 220ms preserve lock & trackId
    for (const gapMs of [62, 99, 220]) {
      const lossT = 1100 + gapMs * 10;
      const loss = guard.afterDetect([], [], lossT);
      expect(loss.ownerTrack.locked).toBe(true);
      expect(loss.ownerTrack.rejectReason).toBe("temporary-loss");
      const rec = guard.afterDetect([ownerHand], hdRight, lossT + gapMs);
      expect(rec.ownerTrack.locked).toBe(true);
      expect(rec.ownerTrack.trackId).toBe(1);
      expect(rec.nextNumHands).toBe(2);
    }

    // Bystander hand clearly separated stays secondary (locked owner placed first at index 0)
    const separatedBystander = makeHandAt(0.15, 0.2, 0.2);
    const sep = guard.afterDetect([separatedBystander, ownerHand], [hdRight[0]!, hdRight[0]!], 4000);
    expect(sep.failClosedReason).toBeNull();
    expect(sep.landmarks).toHaveLength(2);
    expect(sep.landmarks[0]![0]!.x).toBeCloseTo(0.5, 3);

    // 2-hand crossing / ambiguity -> fail-closed ambiguousHold!
    const crossingBystander = makeHandAt(0.52, 0.51, 0.22);
    const cross = guard.afterDetect([ownerHand, crossingBystander], [hdRight[0]!, hdRight[0]!], 4033);
    expect(cross.ownerTrack.ambiguousHold).toBe(true);
    expect(cross.failClosedReason).toBe("owner-ambiguous-hold");
    expect(cross.landmarks).toEqual([]);

    // Sudden jump to far bystander alone -> fail-closed reject!
    const farBystander = makeHandAt(0.88, 0.25, 0.22);
    const jumped = guard.afterDetect([farBystander], hdRight, 4100);
    expect(jumped.failClosedReason).toBe("owner-jump-reject");
    expect(jumped.ownerTrack.ambiguousHold).toBe(true);
    expect(jumped.landmarks).toEqual([]);

    // Long absence >= 300ms (e.g. 603ms) releases owner and auto-reacquires new hand without manual relock button
    expect(guard.afterDetect([], [], 5000).ownerTrack.rejectReason).toBe("temporary-loss");
    const emptyReset = guard.afterDetect([], [], 5603);
    expect(emptyReset.ownerTrack.locked).toBe(false);
    expect(emptyReset.ownerTrack.rejectReason).toBe("empty-reset");

    const newHand = makeHandAt(0.25, 0.55, 0.24);
    guard.afterDetect([newHand], hdRight, 5650);
    const reacquired = guard.afterDetect([newHand], hdRight, 5700);
    expect(reacquired.ownerTrack.locked).toBe(true);
    expect(reacquired.ownerTrack.trackId).toBe(2);
    expect(guard.telemetry().activeNumHands).toBe(2);
  });

  it("LabCpuWorkerClient propagates captureFrameId/processedFrameId, enforces duplicate-ID skip, keeps runtimeSetOptionsCalls=0, and marks stale > 150ms", async () => {
    const workers: FakeWorker[] = [];
    class FakeWorker {
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onerror: ((ev: ErrorEvent) => void) | null = null;
      terminated = false;
      constructor() {
        workers.push(this);
      }
      postMessage(msg: {
        type: string;
        sessionEpoch: number;
        frameId?: number;
        captureFrameId?: number;
        captureTimestampMs?: number;
        timestampMs?: number;
        bitmap?: { close?: () => void };
      }) {
        if (msg.type === "INIT") {
          queueMicrotask(() => {
            this.onmessage?.({
              data: {
                type: "READY",
                sessionEpoch: msg.sessionEpoch,
                delegate: "CPU",
                gpuDelegateAttempted: false,
                gpuDelegateActive: false,
                numHands: 2,
                numHandsPolicy: "fixed-2",
                initSetOptionsCalls: 0,
                runtimeSetOptionsCalls: 0,
              },
            } as MessageEvent);
          });
          return;
        }
        if (msg.type === "DETECT") {
          const delay = msg.captureFrameId === 2 ? 175 : 5;
          setTimeout(() => {
            this.onmessage?.({
              data: {
                type: "RESULT",
                sessionEpoch: msg.sessionEpoch,
                frameId: msg.frameId!,
                captureFrameId: msg.captureFrameId!,
                processedFrameId: msg.captureFrameId!,
                processedSeq: msg.captureFrameId!,
                captureTimestampMs: msg.captureTimestampMs!,
                timestampMs: msg.timestampMs!,
                aspect: 16 / 9,
                delegate: "CPU",
                gpuDelegateAttempted: false,
                gpuDelegateActive: false,
                numHandsActive: 2,
                initSetOptionsCalls: 0,
                runtimeSetOptionsCalls: 0,
                landmarks: [],
                handedness: [],
                luma: { meanLuma: 0.45, centerLuma: 0.44, isDark: false, isBacklight: false, activePass: "A0_raw" },
                lumaStats: {
                  mean: 0.45,
                  center: 0.44,
                  p10: 0.2,
                  p50: 0.45,
                  p95: 0.78,
                  nearWhiteHandPct: null,
                  blurProxy: 80,
                  noiseProxy: 1.5,
                  isBacklight: false,
                  passUsed: "A0_raw",
                },
                timing: { preprocessMs: 0.4, detectMs: 12, setOptionsMs: 0, workerTotalMs: 13, detectorCalls: 1 },
                ownerGuard: {
                  activeNumHands: 2,
                  policy: "fixed-2",
                  bystanderAudits: 0,
                  bystanderDetections: 0,
                  ownerJumpRejects: 0,
                  ownerSizeRejects: 0,
                  ambiguousHolds: 0,
                  handednessProbes: 0,
                  bystanderCooldown: 0,
                  trackId: 0,
                  locked: false,
                },
                ownerTrack: { locked: false, trackId: 0, handCount: 0, ambiguousHold: false, rejectReason: "no-hand" },
                failClosedReason: null,
                monotonicClamps: 0,
              },
            } as MessageEvent);
          }, delay);
        }
      }
      terminate() {
        this.terminated = true;
      }
    }

    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ close: vi.fn() })));
    const results: CpuWorkerResult[] = [];
    const client = new LabCpuWorkerClient({
      wasmRoot: "/mediapipe/wasm",
      modelUrl: "/models/hand_landmarker.task",
      preprocess: "a4",
      createWorker: () => new FakeWorker() as unknown as Worker,
      onResult: (r) => results.push(r),
    });

    await client.init();
    const video = { readyState: 4, videoWidth: 1280, videoHeight: 720 } as unknown as HTMLVideoElement;

    const now1 = performance.now();
    expect(await client.submitFrame(video, now1, { captureFrameId: 1, captureTimestampMs: now1 })).toBe(true);
    await vi.waitFor(() => expect(results).toHaveLength(1));

    // Re-submitting duplicate captureFrameId=1 MUST be skipped!
    expect(await client.submitFrame(video, now1 + 16, { captureFrameId: 1, captureTimestampMs: now1 })).toBe(false);
    expect(client.getTelemetry().framesSkippedDuplicate).toBe(1);

    // Frame 2 delayed > 150ms -> isStale MUST be true
    const cap2 = performance.now() - 180;
    expect(await client.submitFrame(video, performance.now(), { captureFrameId: 2, captureTimestampMs: cap2 })).toBe(true);
    await vi.waitFor(() => expect(results).toHaveLength(2));

    expect(results[0]!.captureFrameId).toBe(1);
    expect(results[0]!.processedFrameId).toBe(1);
    expect(results[0]!.runtimeSetOptionsCalls).toBe(0);
    expect(results[0]!.isStale).toBe(false);

    expect(results[1]!.captureFrameId).toBe(2);
    expect(results[1]!.processedFrameId).toBe(2);
    expect(results[1]!.frameAgeMs).toBeGreaterThan(150);
    expect(results[1]!.isStale).toBe(true);
    expect(results[1]!.runtimeSetOptionsCalls).toBe(0);
    expect(client.getTelemetry().runtimeSetOptionsCalls).toBe(0);

    client.close("done");
    vi.unstubAllGlobals();
  });
});

describe("R22 1-Euro cursor filter & A4v2 / R22 photometric primitives (P04, P06, P07, P10)", () => {
  it("OneEuroPoint2DFilter reduces stationary jitter with real variable dt and resets cleanly on loss, owner change, and >350ms gap", () => {
    const f = new OneEuroPoint2DFilter({ minCutoff: 1.0, beta: 0.3, dCutoff: 1.0, maxGapSec: 0.35 });
    const rawPts: Array<{ x: number; y: number }> = [];
    const filtPts: Array<{ x: number; y: number }> = [];
    // Deterministic alternating tremor around (0.5, 0.5) at variable dt (66ms / 33ms)
    let t = 1000;
    for (let i = 0; i < 40; i++) {
      t += i % 2 === 0 ? 66 : 33;
      const raw = {
        x: 0.5 + (i % 2 === 0 ? 0.008 : -0.008),
        y: 0.5 + (i % 3 === 0 ? 0.006 : -0.006),
      };
      rawPts.push(raw);
      filtPts.push(f.filter(raw, t, { tracked: true, ownerTrackId: 1 })!);
    }
    const rms = (pts: Array<{ x: number; y: number }>) => {
      const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
      const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
      return Math.sqrt(pts.reduce((a, p) => a + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / pts.length);
    };
    expect(rms(filtPts)).toBeLessThan(rms(rawPts) * 0.5);

    // Tracking loss resets state; next sample jumps immediately to new hand without stale pull
    expect(f.filter(null, t + 33, { tracked: false })).toBeNull();
    const afterLoss = f.filter({ x: 0.1, y: 0.2 }, t + 66, { tracked: true, ownerTrackId: 1 })!;
    expect(afterLoss.x).toBeCloseTo(0.1, 6);
    expect(afterLoss.y).toBeCloseTo(0.2, 6);

    // Owner change resets state immediately
    const newOwnerPt = f.filter({ x: 0.85, y: 0.75 }, t + 99, { tracked: true, ownerTrackId: 2 })!;
    expect(newOwnerPt.x).toBeCloseTo(0.85, 6);
    expect(newOwnerPt.y).toBeCloseTo(0.75, 6);

    // Gap > maxGapSec (350 ms) resets state automatically
    const afterGap = f.filter({ x: 0.3, y: 0.4 }, t + 600, { tracked: true, ownerTrackId: 2 })!;
    expect(afterGap.x).toBeCloseTo(0.3, 6);
    expect(afterGap.y).toBeCloseTo(0.4, 6);

    // 1D & 21-landmark filter exports work with variable dt
    const f1 = new OneEuroFilter1D();
    expect(f1.filter(0.25, 100)).toBe(0.25);
    const lmFilter = new OneEuroLandmark21Filter();
    const hand = makeHandAt(0.4, 0.5, 0.2);
    expect(lmFilter.filter(hand, 100, { tracked: true, ownerTrackId: 1 })).toHaveLength(21);
    expect(lmFilter.filter(null, 150, { tracked: false })).toBeNull();
  });

  it("computes luma percentiles, nearWhiteHandPct, blur/noise proxies, soft-knee glare protection, and shadow chroma clamp", () => {
    expect(R22_DIM_RECOVERY_LUMA).toBe(0.32);

    // Normal ~0.47 room luma must NOT trigger automatic dim recovery
    const normal = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < 16 * 16; i++) {
      normal[i * 4] = 120;
      normal[i * 4 + 1] = 120;
      normal[i * 4 + 2] = 120;
      normal[i * 4 + 3] = 255;
    }
    const diagNormal = analyzeFrameLuma(normal, 16, 16, { step: 1 });
    expect(diagNormal.meanLuma).toBeCloseTo(120 / 255, 2);
    expect(diagNormal.nearWhiteHandPct).toBeNull();
    expect(diagNormal.shouldActivateDimRecovery).toBe(false);

    // Glare hotspot inside hand ROI -> nearWhiteHandPct > 0 & isGlareRisk = true
    const glare = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < 16 * 16; i++) {
      glare[i * 4] = 254;
      glare[i * 4 + 1] = 252;
      glare[i * 4 + 2] = 250;
      glare[i * 4 + 3] = 255;
    }
    const diagGlare = analyzeFrameLuma(glare, 16, 16, {
      step: 1,
      handRoi: { minX: 0.25, minY: 0.25, maxX: 0.75, maxY: 0.75 },
    });
    expect(diagGlare.nearWhiteHandPct).toBe(100);
    expect(diagGlare.p95).toBeGreaterThanOrEqual(0.94);
    expect(diagGlare.isGlareRisk).toBe(true);

    // Soft-knee highlight protection caps pixels below 255 white clipping while keeping skin below kneeStart intact
    const kneeBuf = new Uint8ClampedArray([
      255, 240, 220, 255, // clipped monitor glare
      140, 100, 80, 255,  // midtone skin below R22_HIGHLIGHT_KNEE_START (0.78 -> ~199)
    ]);
    applyHighlightSoftKneeInPlace(kneeBuf, R22_HIGHLIGHT_KNEE_START, R22_HIGHLIGHT_KNEE_CEILING, 1.0);
    expect(kneeBuf[0]!).toBeLessThanOrEqual(Math.ceil(R22_HIGHLIGHT_KNEE_CEILING * 255) + 1);
    expect(kneeBuf[0]!).toBeGreaterThan(kneeBuf[1]!);
    expect(kneeBuf[4]!).toBe(140);
    expect(kneeBuf[5]!).toBe(100);

    // Reinhard + soft-knee lifts dark skin while compressing glare below ceiling
    const dimSkinGlare = new Uint8ClampedArray([
      32, 22, 16, 255,    // dark skin
      255, 250, 245, 255, // glare hotspot
    ]);
    reinhardWithSoftKneeInPlace(dimSkinGlare, 0.14, 0.48);
    expect(dimSkinGlare[0]!).toBeGreaterThan(60);
    expect(dimSkinGlare[0]!).toBeGreaterThan(dimSkinGlare[2]!);
    expect(dimSkinGlare[4]!).toBeLessThanOrEqual(242);

    // Shadow chroma noise clamp pulls ultra-dark noise toward neutral without touching lit pixels
    const shadow = new Uint8ClampedArray([
      18, 2, 2, 255,     // ultra-dark red chroma spike (luma ~ 6 < 20)
      140, 95, 75, 255,  // lit skin (luma ~ 106 >> 20)
    ]);
    suppressShadowChromaNoiseInPlace(shadow, 0.08, 0.9);
    expect(shadow[0]! - shadow[1]!).toBeLessThan(8);
    expect(shadow[4]!).toBe(140);
    expect(shadow[5]!).toBe(95);

    // Candidate pipeline runs cleanly on 8x8 frame
    const cand = new Uint8ClampedArray(8 * 8 * 4).fill(30);
    for (let i = 3; i < cand.length; i += 4) cand[i] = 255;
    const prev = applyR22CandidateRecoveryInPlace(cand, 8, 8, 0.12, null, undefined, {
      variant: "r22_softknee_shadowclamp",
    });
    expect(prev).toHaveLength(cand.length);

    // Opportunistic UVC capability probe handles missing & valid tracks safely
    expect(probeCameraExposureCapabilities(null).supported).toBe(false);
    const fakeTrack = {
      getCapabilities: () => ({
        exposureMode: ["continuous", "manual"],
        exposureCompensation: { min: -2, max: 2, step: 0.25 },
        whiteBalanceMode: ["continuous"],
      }),
      getSettings: () => ({ exposureMode: "continuous", exposureCompensation: 0 }),
    } as unknown as MediaStreamTrack;
    const caps = probeCameraExposureCapabilities(fakeTrack);
    expect(caps.supported).toBe(true);
    expect(caps.canAdjustExposure).toBe(true);
    expect(caps.currentExposureMode).toBe("continuous");
  });
});

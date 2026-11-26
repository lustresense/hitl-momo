// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonuiHandDetector, type MonuiTelemetry } from "@/src/app/monui-hand-detector";
import { R83CameraDock } from "@/src/app/R83CameraDock";
import { LabCpuWorkerClient } from "@/src/components/nui-lab/bench/r20-worker-client";
import { resetSharedStreamForTest, setSharedStream } from "@/src/camera/shared-stream";
import { NuiProvider, useNui, type NuiController } from "@/src/nui/react";
import type { HandDetector, HandFrame } from "@/src/nui/sources/hand-detector";

interface PostedInit {
  type: "INIT";
  sessionEpoch: number;
  preprocess: string;
  yoloEnabled?: boolean;
  dynamicOwnerLock?: boolean;
  numHandsPolicy?: string;
  auditIntervalFrames?: number;
}

interface PostedDetect {
  type: "DETECT";
  sessionEpoch: number;
  frameId: number;
  captureFrameId?: number;
  captureTimestampMs?: number;
  timestampMs: number;
  bitmap: { close: () => void };
}

class FakeWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  initMessages: PostedInit[] = [];
  detectMessages: PostedDetect[] = [];
  closeMessages: Array<{ type: "CLOSE"; sessionEpoch: number }> = [];
  terminated = false;

  constructor(private readonly mode: "ready" | "init-error" = "ready") {}

  postMessage(msg: { type: string; sessionEpoch: number }): void {
    if (msg.type === "INIT") {
      const initMsg = msg as PostedInit;
      this.initMessages.push(initMsg);
      queueMicrotask(() => {
        if (this.mode === "init-error") {
          this.onmessage?.({
            data: {
              type: "ERROR",
              sessionEpoch: initMsg.sessionEpoch,
              stage: "init",
              message: "WASM load failed",
            },
          } as MessageEvent);
          return;
        }
        this.onmessage?.({
          data: {
            type: "READY",
            sessionEpoch: initMsg.sessionEpoch,
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
      this.detectMessages.push(msg as PostedDetect);
      return;
    }

    if (msg.type === "CLOSE") {
      this.closeMessages.push(msg as { type: "CLOSE"; sessionEpoch: number });
    }
  }

  emitResult(
    overrides: Partial<{
      frameId: number;
      captureFrameId: number;
      captureTimestampMs: number;
      timestampMs: number;
      landmarks: Array<Array<{ x: number; y: number; z: number }>>;
      rescueState: "NORMAL" | "SEARCH" | "RESCUE_TRACK" | "POSITION_ONLY" | "LOST";
      source: "mediapipe" | "rescue";
      yoloRan: boolean;
      yoloScore: number | null;
      rescueAutoOff: { reason: string; p50Ms: number } | null;
      failClosedReason: "owner-ambiguous-hold" | null;
      passUsed: string;
    }> = {},
  ): void {
    const lastDetect = this.detectMessages[this.detectMessages.length - 1];
    const frameId = overrides.frameId ?? lastDetect?.frameId ?? 1;
    const captureFrameId = overrides.captureFrameId ?? lastDetect?.captureFrameId ?? frameId;
    const captureTimestampMs = overrides.captureTimestampMs ?? lastDetect?.captureTimestampMs ?? 1234;
    const sessionEpoch = this.initMessages[0]?.sessionEpoch ?? 1;
    const passUsed = overrides.passUsed ?? "A0_raw";

    this.onmessage?.({
      data: {
        type: "RESULT",
        sessionEpoch,
        frameId,
        captureFrameId,
        processedFrameId: captureFrameId,
        processedSeq: frameId,
        captureTimestampMs,
        timestampMs: overrides.timestampMs ?? Math.round(captureTimestampMs),
        aspect: 16 / 9,
        delegate: "CPU",
        gpuDelegateAttempted: false,
        gpuDelegateActive: false,
        numHandsActive: 2,
        initSetOptionsCalls: 0,
        runtimeSetOptionsCalls: 0,
        landmarks: overrides.landmarks ?? [],
        handedness: [],
        mpRawHandCount: overrides.landmarks?.length ?? 0,
        mpHandednessScores: [],
        luma: { meanLuma: 0.4, centerLuma: 0.4, isDark: false, isBacklight: false, activePass: passUsed },
        lumaStats: {
          mean: 0.4,
          center: 0.4,
          p10: 0.2,
          p50: 0.4,
          p95: 0.7,
          clippedPct: 0,
          handRoiLumaP50: null,
          lastRoiLumaP50: null,
          nearWhiteHandPct: null,
          blurProxy: 60,
          noiseProxy: 1.2,
          isBacklight: false,
          passUsed,
        },
        timing: { preprocessMs: 0.3, detectMs: 8.5, setOptionsMs: 0, workerTotalMs: 9.2, detectorCalls: 1 },
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
          trackId: 1,
          locked: true,
        },
        ownerTrack: {
          locked: true,
          trackId: 1,
          handCount: overrides.landmarks?.length ?? 0,
          ambiguousHold: false,
          rejectReason: null,
        },
        failClosedReason: overrides.failClosedReason ?? null,
        monotonicClamps: 0,
        rescueState: overrides.rescueState ?? "NORMAL",
        source: overrides.source ?? "mediapipe",
        yoloRan: overrides.yoloRan ?? false,
        yoloScore: overrides.yoloScore ?? null,
        rescueAutoOff: overrides.rescueAutoOff ?? null,
      },
    } as MessageEvent);
  }

  terminate(): void {
    this.terminated = true;
  }
}

function makeFakeVideo(width = 1280, height = 720) {
  let time = 0.1;
  const video = document.createElement("video");
  Object.defineProperty(video, "readyState", { configurable: true, get: () => 4 });
  Object.defineProperty(video, "videoWidth", { configurable: true, get: () => width });
  Object.defineProperty(video, "videoHeight", { configurable: true, get: () => height });
  Object.defineProperty(video, "currentTime", { configurable: true, get: () => time });
  return {
    video,
    advanceTime(next: number) {
      time = next;
    },
  };
}

function makeFakeStream(): { stream: MediaStream; trackStop: ReturnType<typeof vi.fn> } {
  const trackStop = vi.fn();
  const track = { readyState: "live", stop: trackStop } as unknown as MediaStreamTrack;
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, trackStop };
}

describe("MonuiHandDetector (P9a MoNUI-7 integration)", () => {
  let rafQueue: Array<{ id: number; cb: FrameRequestCallback }> = [];
  let nextRafId = 1;
  let canceledRafIds: number[] = [];

  beforeEach(() => {
    resetSharedStreamForTest();
    rafQueue = [];
    canceledRafIds = [];
    nextRafId = 1;

    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb: FrameRequestCallback) => {
        const id = nextRafId++;
        rafQueue.push({ id, cb });
        return id;
      }),
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((id: number) => {
        canceledRafIds.push(id);
        rafQueue = rafQueue.filter((item) => item.id !== id);
      }),
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ close: vi.fn() })),
    );
  });

  afterEach(() => {
    cleanup();
    resetSharedStreamForTest();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function flushNextRaf(t = 16): void {
    const next = rafQueue.shift();
    if (next) next.cb(t);
  }

  it("initializes LabCpuWorkerClient with MoNUI-7 defaults, forwards landmarks & captureTimestampMs, emits telemetry, and terminates cleanly on stop()", async () => {
    const worker = new FakeWorker("ready");
    const { stream, trackStop } = makeFakeStream();
    setSharedStream(stream);
    const { video } = makeFakeVideo(1280, 720);

    const frames: HandFrame[] = [];
    const statuses: Array<{ state: string; message: string }> = [];
    const telemetries: MonuiTelemetry[] = [];

    const detector = new MonuiHandDetector({
      getVideo: () => video,
      createWorker: () => worker as unknown as Worker,
      onStatus: (s) => statuses.push(s),
      onTelemetry: (t) => telemetries.push(t),
    });
    const unsub = detector.subscribe((f) => frames.push(f));

    await detector.start();

    expect(worker.initMessages).toHaveLength(1);
    expect(worker.initMessages[0]).toMatchObject({
      type: "INIT",
      preprocess: "raw",
      yoloEnabled: true,
      dynamicOwnerLock: true,
      numHandsPolicy: "fixed-2",
      auditIntervalFrames: 45,
    });
    expect(statuses.map((s) => s.state)).toEqual(["starting", "ready"]);
    expect(telemetries[0]).toEqual({
      mode: "worker",
      rescueState: "NORMAL",
      activePass: "A0_raw",
      rescueReason: null,
      yoloStatus: "ready",
      preprocessPass: "A0_raw",
    });

    // Pump one rAF frame -> LabCpuWorkerClient.submitFrame resizes to captureWidth=320
    flushNextRaf(100);
    await vi.waitFor(() => expect(worker.detectMessages).toHaveLength(1));
    expect(createImageBitmap).toHaveBeenCalledWith(video, {
      resizeWidth: 320,
      resizeHeight: 180,
      resizeQuality: "low",
    });

    // Worker returns hand landmarks + captureTimestampMs
    const sampleHand = Array.from({ length: 21 }, (_, idx) => ({
      x: 0.4 + idx * 0.005,
      y: 0.5,
      z: -0.02,
    }));
    worker.emitResult({
      captureTimestampMs: 4321,
      landmarks: [sampleHand],
      rescueState: "NORMAL",
      passUsed: "A0_raw",
    });

    expect(frames).toHaveLength(1);
    expect(frames[0]!.t).toBe(4321);
    expect(frames[0]!.videoWidth).toBe(1280);
    expect(frames[0]!.videoHeight).toBe(720);
    expect(frames[0]!.hands).toHaveLength(1);
    expect(frames[0]!.hands[0]![0]).toEqual({ x: 0.4, y: 0.5, z: -0.02 });

    // Worker enters SEARCH + HF3 lowlight + YOLO detection, then auto-off
    worker.emitResult({
      captureTimestampMs: 4500,
      landmarks: [],
      rescueState: "SEARCH",
      yoloRan: true,
      yoloScore: 0.88,
      passUsed: "A4_denoise_reinhard320",
    });
    expect(telemetries[telemetries.length - 1]).toEqual({
      mode: "worker",
      rescueState: "SEARCH",
      activePass: "A4_denoise_reinhard320",
      rescueReason: "SEARCH",
      yoloStatus: "detected",
      preprocessPass: "A4_denoise_reinhard320",
    });

    worker.emitResult({
      captureTimestampMs: 4700,
      landmarks: [],
      rescueState: "SEARCH",
      yoloRan: true,
      yoloScore: null,
      rescueAutoOff: { reason: "LATENCY_P50_GT_120MS", p50Ms: 134.2 },
      passUsed: "A4_denoise_reinhard320",
    });
    expect(telemetries[telemetries.length - 1]).toEqual({
      mode: "worker",
      rescueState: "SEARCH",
      activePass: "A4_denoise_reinhard320",
      rescueReason: "LATENCY_P50_GT_120MS",
      yoloStatus: "auto-off",
      preprocessPass: "A4_denoise_reinhard320",
    });

    // Tab hidden triggers fail-closed onReleaseAll -> empty HandFrame
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frames[frames.length - 1]!.hands).toEqual([]);
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });

    // Clean stop terminates worker, cancels rAF, and leaves shared stream tracks live
    unsub();
    detector.stop();
    expect(worker.terminated).toBe(true);
    expect(worker.closeMessages).toHaveLength(1);
    expect(canceledRafIds.length).toBeGreaterThanOrEqual(1);
    expect(trackStop).not.toHaveBeenCalled();
    expect(statuses[statuses.length - 1]!.state).toBe("idle");
  });

  it("falls back to createFallback when Worker is unavailable and stops fallback on stop()", async () => {
    vi.stubGlobal("Worker", undefined);

    const listeners = new Set<(frame: HandFrame) => void>();
    const fbStart = vi.fn().mockResolvedValue(undefined);
    const fbStop = vi.fn();
    const fakeFallback: HandDetector = {
      start: fbStart,
      stop: fbStop,
      subscribe(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    };

    const telemetries: MonuiTelemetry[] = [];
    const frames: HandFrame[] = [];
    const detector = new MonuiHandDetector({
      createFallback: () => fakeFallback,
      onTelemetry: (t) => telemetries.push(t),
    });
    detector.subscribe((f) => frames.push(f));

    await detector.start();
    expect(fbStart).toHaveBeenCalledTimes(1);
    expect(telemetries[telemetries.length - 1]).toEqual({
      mode: "fallback",
      rescueState: "NORMAL",
      activePass: "A0_raw",
      rescueReason: null,
      yoloStatus: "fallback",
      preprocessPass: "A0_raw",
    });

    const sampleFrame: HandFrame = { t: 99, videoWidth: 640, videoHeight: 480, hands: [] };
    for (const cb of listeners) cb(sampleFrame);
    expect(frames).toEqual([sampleFrame]);

    detector.stop();
    expect(fbStop).toHaveBeenCalledTimes(1);
  });

  it("falls back to createFallback when worker construction throws or init rejects and closes the failed worker", async () => {
    const failingWorker = new FakeWorker("init-error");
    const fbStart = vi.fn().mockResolvedValue(undefined);
    const fbStop = vi.fn();
    const fakeFallback: HandDetector = {
      start: fbStart,
      stop: fbStop,
      subscribe: () => () => {},
    };

    const telemetries: MonuiTelemetry[] = [];
    const detector = new MonuiHandDetector({
      createWorker: () => failingWorker as unknown as Worker,
      createFallback: () => fakeFallback,
      onTelemetry: (t) => telemetries.push(t),
    });

    await detector.start();
    expect(failingWorker.terminated).toBe(true);
    expect(fbStart).toHaveBeenCalledTimes(1);
    expect(telemetries[telemetries.length - 1]!.mode).toBe("fallback");

    detector.stop();
    expect(fbStop).toHaveBeenCalledTimes(1);

    // Also verify synchronous Worker constructor throw falls back cleanly
    const fbStartSync = vi.fn().mockResolvedValue(undefined);
    const detectorSyncThrow = new MonuiHandDetector({
      createWorker: () => {
        throw new Error("Worker blocked");
      },
      createFallback: () => ({
        start: fbStartSync,
        stop: vi.fn(),
        subscribe: () => () => {},
      }),
    });
    await detectorSyncThrow.start();
    expect(fbStartSync).toHaveBeenCalledTimes(1);
    detectorSyncThrow.stop();
  });

  it("reports onStatus({ state: 'error' }) cleanly without throwing when fallback throws", async () => {
    vi.stubGlobal("Worker", undefined);
    const fbStop = vi.fn();
    const failingFallback: HandDetector = {
      start: vi.fn().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError")),
      stop: fbStop,
      subscribe: () => () => {},
    };
    const statuses: Array<{ state: string; message: string }> = [];

    const detector = new MonuiHandDetector({
      createFallback: () => failingFallback,
      onStatus: (s) => statuses.push(s),
    });

    await expect(detector.start()).resolves.toBeUndefined();
    expect(fbStop).toHaveBeenCalledTimes(1);
    const lastStatus = statuses[statuses.length - 1];
    expect(lastStatus?.state).toBe("error");
    expect(lastStatus?.message).toContain("Izin kamera ditolak");
  });

  it("fails closed on camera permission denial without invoking fallback twice", async () => {
    const worker = new FakeWorker("ready");
    const fbStart = vi.fn().mockResolvedValue(undefined);
    const createFallback = vi.fn(
      (): HandDetector => ({
        start: fbStart,
        stop: vi.fn(),
        subscribe: () => () => {},
      }),
    );

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError")),
      },
    });

    const statuses: Array<{ state: string; message: string }> = [];
    const detector = new MonuiHandDetector({
      createWorker: () => worker as unknown as Worker,
      createFallback,
      onStatus: (s) => statuses.push(s),
    });

    await expect(detector.start()).resolves.toBeUndefined();
    expect(worker.terminated).toBe(true);
    expect(createFallback).not.toHaveBeenCalled();
    expect(fbStart).not.toHaveBeenCalled();
    expect(statuses[statuses.length - 1]?.state).toBe("error");
  });

  it("R83CameraDock sets imperative data-monui-* attributes on #cam-pip and enforces O-11 cleanup", async () => {
    const worker = new FakeWorker("ready");
    const { stream } = makeFakeStream();
    setSharedStream(stream);
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          return worker as unknown as Worker;
        }
      },
    );

    const renderCount = { current: 0 };
    const nuiRef: { current: NuiController | null } = { current: null };
    function DockHarness({ active, showPip }: { active: boolean; showPip: boolean }) {
      renderCount.current += 1;
      nuiRef.current = useNui();
      return React.createElement(R83CameraDock, { active, showPip });
    }

    const NuiProviderElement = NuiProvider as React.FC<
      Omit<React.ComponentProps<typeof NuiProvider>, "children"> & { children?: React.ReactNode }
    >;

    const { rerender } = render(
      React.createElement(
        NuiProviderElement,
        { testHooks: true },
        React.createElement(DockHarness, { active: true, showPip: true }),
      ),
    );

    const pip = screen.getByTestId("r83-cam-pip");
    await vi.waitFor(() => expect(pip.getAttribute("data-monui-mode")).toBe("worker"));
    expect(pip.getAttribute("data-monui-rescue")).toBe("NORMAL");
    expect(pip.getAttribute("data-monui-pass")).toBe("A0_raw");
    expect(nuiRef.current?.getHandSource()).not.toBeNull();

    const rendersAfterInit = renderCount.current;
    worker.emitResult({
      captureTimestampMs: 2500,
      landmarks: [],
      rescueState: "POSITION_ONLY",
      passUsed: "A4_denoise_reinhard320",
    });

    expect(pip.getAttribute("data-monui-rescue")).toBe("POSITION_ONLY");
    expect(pip.getAttribute("data-monui-pass")).toBe("A4_denoise_reinhard320");
    // Imperative DOM attribute updates trigger zero React re-renders
    expect(renderCount.current).toBe(rendersAfterInit);

    rerender(
      React.createElement(
        NuiProviderElement,
        { testHooks: true },
        React.createElement(DockHarness, { active: false, showPip: true }),
      ),
    );

    expect(worker.terminated).toBe(true);
    expect(nuiRef.current?.getHandSource()).toBeNull();
    expect(pip.getAttribute("data-monui-mode")).toBe("idle");
    expect(pip.getAttribute("data-monui-rescue")).toBeNull();
    expect(pip.getAttribute("data-monui-pass")).toBeNull();
  });

  it("R83CameraDock detaches HandSource (O-11) when detector emits error state", async () => {
    vi.stubGlobal("Worker", undefined);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")),
      },
    });

    const nuiRef: { current: NuiController | null } = { current: null };
    function ErrorDockHarness() {
      nuiRef.current = useNui();
      return React.createElement(R83CameraDock, { active: true, showPip: true });
    }
    const NuiProviderElement = NuiProvider as React.FC<
      Omit<React.ComponentProps<typeof NuiProvider>, "children"> & { children?: React.ReactNode }
    >;

    render(
      React.createElement(
        NuiProviderElement,
        { testHooks: true },
        React.createElement(ErrorDockHarness),
      ),
    );

    await vi.waitFor(() => {
      const pip = screen.getByTestId("r83-cam-pip");
      expect(pip.getAttribute("data-monui-mode")).toBe("fallback");
    });
    await vi.waitFor(() => expect(nuiRef.current?.getHandSource()).toBeNull());
  });

  it("retries on the next tick when submitFrame returns false and video.currentTime stays unchanged", async () => {
    const worker = new FakeWorker("ready");
    const { stream } = makeFakeStream();
    setSharedStream(stream);
    const { video } = makeFakeVideo(1280, 720);

    const realSubmit = LabCpuWorkerClient.prototype.submitFrame;
    const submitSpy = vi
      .spyOn(LabCpuWorkerClient.prototype, "submitFrame")
      .mockResolvedValueOnce(false)
      .mockImplementation(realSubmit);

    const detector = new MonuiHandDetector({
      getVideo: () => video,
      createWorker: () => worker as unknown as Worker,
    });
    await detector.start();

    // Tick 1: submitFrame returns false (in-flight busy); video.currentTime remains 0.1
    flushNextRaf(16);
    await Promise.resolve();
    await Promise.resolve();
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(worker.detectMessages).toHaveLength(0);

    // Tick 2 with unchanged video.currentTime (0.1): retries and delivers the frame
    flushNextRaf(32);
    await vi.waitFor(() => expect(worker.detectMessages).toHaveLength(1));
    expect(submitSpy).toHaveBeenCalledTimes(2);

    detector.stop();
  });

  it("recovers from real in-flight busy drops and prevents concurrent rAF double-submit on the same frame", async () => {
    const worker = new FakeWorker("ready");
    const { stream } = makeFakeStream();
    setSharedStream(stream);
    const { video, advanceTime } = makeFakeVideo(1280, 720);

    const pendingBitmaps: Array<(bmp: { close: () => void }) => void> = [];
    const createBitmapMock = vi.fn(
      () =>
        new Promise<{ close: () => void }>((resolve) => {
          pendingBitmaps.push(resolve);
        }),
    );
    vi.stubGlobal("createImageBitmap", createBitmapMock);

    const detector = new MonuiHandDetector({
      getVideo: () => video,
      createWorker: () => worker as unknown as Worker,
    });
    await detector.start();

    // Concurrent rAF ticks while createImageBitmap is pending must not spam submitFrame on same currentTime
    flushNextRaf(16);
    flushNextRaf(32);
    expect(createBitmapMock).toHaveBeenCalledTimes(1);

    pendingBitmaps.shift()?.({ close: vi.fn() });
    await vi.waitFor(() => expect(worker.detectMessages).toHaveLength(1));

    // Advance video time while frame 1 is in flight -> Tick drops busy (submitFrame returns false)
    advanceTime(0.2);
    flushNextRaf(48);
    await Promise.resolve();
    expect(worker.detectMessages).toHaveLength(1);

    // Worker finishes frame 1 while video.currentTime is still 0.2 -> immediately retries and delivers 0.2
    worker.emitResult({ captureTimestampMs: 100, landmarks: [] });
    await vi.waitFor(() => expect(createBitmapMock).toHaveBeenCalledTimes(2));
    pendingBitmaps.shift()?.({ close: vi.fn() });
    await vi.waitFor(() => expect(worker.detectMessages).toHaveLength(2));

    // Subsequent tick at unchanged 0.2 does not duplicate frame 2
    flushNextRaf(64);
    await Promise.resolve();
    expect(worker.detectMessages).toHaveLength(2);

    detector.stop();
  });
});

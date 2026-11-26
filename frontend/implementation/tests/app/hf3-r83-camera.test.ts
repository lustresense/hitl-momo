// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hf3CameraMonitor } from "@/src/app/hf3-camera-monitor";
import { useR83Camera } from "@/src/app/hooks/useR83Camera";
import { getSharedStream, resetSharedStreamForTest } from "@/src/camera/shared-stream";
import { HF3_CAMERA_BLACK_MESSAGE } from "@/src/components/nui-lab/bench/r20-lowlight";
import type { CpuWorkerResult } from "@/src/components/nui-lab/bench/r20-worker-client";

function makeFakeTrack(options: {
  deviceId?: string;
  label?: string;
  exposureSupport?: boolean;
} = {}): {
  track: MediaStreamTrack;
  applyConstraints: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} {
  let currentMode = "continuous";
  let currentTime = 600;
  const stop = vi.fn();
  const applyConstraints = vi.fn(async (constraints: MediaTrackConstraints) => {
    const adv = (constraints.advanced?.[0] ?? {}) as Record<string, unknown>;
    if (typeof adv.exposureMode === "string") currentMode = adv.exposureMode;
    if (typeof adv.exposureTime === "number") currentTime = adv.exposureTime;
  });

  const track = {
    kind: "video",
    readyState: "live",
    label: options.label ?? "USB RGB Webcam",
    stop,
    getSettings: () => ({
      deviceId: options.deviceId ?? "rgb-cam",
      width: 640,
      height: 480,
      exposureMode: currentMode,
      exposureTime: currentTime,
    }),
    getCapabilities: options.exposureSupport
      ? () => ({
          exposureMode: ["continuous", "manual"],
          exposureTime: { min: 10, max: 1000, step: 1 },
        })
      : () => ({}),
    applyConstraints,
  } as unknown as MediaStreamTrack;

  return { track, applyConstraints, stop };
}

function makeStream(track: MediaStreamTrack): MediaStream {
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

function makeWorkerResult(lumaP50: number): CpuWorkerResult {
  return {
    frameId: 1,
    captureFrameId: 1,
    processedFrameId: 1,
    processedSeq: 1,
    captureTimestampMs: 1000,
    timestampMs: 1000,
    frameAgeMs: 5,
    workerLagMs: 4,
    isStale: false,
    aspect: 4 / 3,
    delegate: "CPU",
    gpuDelegateAttempted: false,
    gpuDelegateActive: false,
    numHandsActive: 2,
    initSetOptionsCalls: 0,
    runtimeSetOptionsCalls: 0,
    landmarks: [],
    handedness: [],
    mpRawHandCount: 0,
    mpHandednessScores: [],
    luma: { meanLuma: lumaP50, centerLuma: lumaP50, isDark: lumaP50 < 0.2, isBacklight: false, activePass: "A0_raw" },
    lumaStats: {
      mean: lumaP50,
      center: lumaP50,
      p10: lumaP50,
      p50: lumaP50,
      p95: lumaP50,
      clippedPct: 0,
      handRoiLumaP50: null,
      lastRoiLumaP50: null,
      nearWhiteHandPct: null,
      blurProxy: 40,
      noiseProxy: 1.0,
      isBacklight: false,
      passUsed: "A0_raw",
    },
    timing: {
      mainThreadDispatchMs: 1,
      preprocessMs: 0.2,
      detectMs: 6,
      setOptionsMs: 0,
      workerTotalMs: 7,
      pipelineMs: 8,
      frameAgeMs: 5,
      workerLagMs: 4,
      detectorCalls: 1,
    },
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
    ownerTrack: { locked: true, trackId: 1, handCount: 0, ambiguousHold: false, rejectReason: null },
    failClosedReason: null,
    droppedSincePrev: 0,
  };
}

describe("useR83Camera + Hf3CameraMonitor (R23B-HF3 integration)", () => {
  afterEach(() => {
    cleanup();
    resetSharedStreamForTest();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens camera with normal auto-exposure 640x480@30 constraints (no min:24 darkening) and skips IR cameras", async () => {
    const { track } = makeFakeTrack({ deviceId: "rgb-1", label: "USB RGB Webcam" });
    const stream = makeStream(track);
    const enumerateDevices = vi.fn().mockResolvedValue([
      { kind: "videoinput", deviceId: "ir-1", label: "Integrated IR Camera" },
      { kind: "videoinput", deviceId: "rgb-1", label: "USB RGB Webcam" },
    ]);
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { enumerateDevices, getUserMedia },
    });

    const { result, unmount } = renderHook(() => useR83Camera());
    let ok = false;
    await act(async () => {
      ok = await result.current.onCameraToggle(true);
    });

    expect(ok).toBe(true);
    expect(result.current.cameraActive).toBe(true);
    expect(result.current.cameraState.selectedDeviceId).toBe("rgb-1");
    expect(getSharedStream()).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        deviceId: { exact: "rgb-1" },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    });
    unmount();
  });

  it("falls back cleanly on OverconstrainedError and reports permission denial as 'denied'", async () => {
    const { track } = makeFakeTrack({ deviceId: "cam-fallback" });
    const stream = makeStream(track);
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("Overconstrained", "OverconstrainedError"))
      .mockResolvedValueOnce(stream);

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { enumerateDevices: vi.fn().mockResolvedValue([]), getUserMedia },
    });

    const { result, unmount } = renderHook(() => useR83Camera());
    await act(async () => {
      const ok = await result.current.onCameraToggle(true);
      expect(ok).toBe(true);
    });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1]![0]).toEqual({
      video: true,
      audio: false,
    });

    const deniedGum = vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { enumerateDevices: vi.fn().mockResolvedValue([]), getUserMedia: deniedGum },
    });
    await act(async () => {
      const ok = await result.current.onCameraToggle(true);
      expect(ok).toBe(false);
    });
    expect(result.current.cameraState.status).toBe("denied");
    expect(result.current.cameraState.error).toContain("Izin kamera ditolak");
    expect(getSharedStream()).toBeNull();
    unmount();
  });

  it("locks manual exposure <= 33.3ms on sustained low FPS (<20) and detects/recovers 2s black frames", async () => {
    const { track, applyConstraints } = makeFakeTrack({ exposureSupport: true });
    const snapshots = [];
    const monitor = new Hf3CameraMonitor((s) => snapshots.push(s));

    // Simulate 10 fps (1 frame every 100ms) for 2.6 seconds
    let vt = 0.1;
    let now = 0;
    for (let i = 0; i < 27; i++) {
      monitor.onVideoFrame(track, vt, now);
      monitor.onWorkerResult(makeWorkerResult(0.4), now);
      await Promise.resolve();
      vt += 0.1;
      now += 100;
    }

    expect(applyConstraints).toHaveBeenCalledWith({
      advanced: [{ exposureMode: "manual", exposureTime: 333 }],
    });
    expect(monitor.getSnapshot().exposureLocked).toBe(true);
    expect(monitor.getSnapshot().exposureState).toBe("locked_verifying");

    // Simulate FPS recovery to 30fps -> transitions to locked_ok
    for (let i = 0; i < 45; i++) {
      vt += 0.033;
      now += 33;
      monitor.onVideoFrame(track, vt, now);
    }
    const okSnap = monitor.onWorkerResult(makeWorkerResult(0.4), now);
    await Promise.resolve();
    expect(okSnap.exposureState).toBe("locked_ok");

    // Simulate 2.1s of black frames (lumaP50 === 0), then recovery
    now += 100;
    expect(monitor.onWorkerResult(makeWorkerResult(0), now).isBlack).toBe(false);
    const blackSnap = monitor.onWorkerResult(makeWorkerResult(0), now + 2100);
    expect(blackSnap.isBlack).toBe(true);
    expect(blackSnap.blackMessage).toBe(HF3_CAMERA_BLACK_MESSAGE);

    const recovered = monitor.onWorkerResult(makeWorkerResult(0.25), now + 2200);
    expect(recovered.isBlack).toBe(false);
    expect(recovered.blackMessage).toBeNull();

    monitor.dispose();
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it("reverts manual exposure back to 'continuous' if FPS stays low for >= 3 seconds", async () => {
    const { track, applyConstraints } = makeFakeTrack({ exposureSupport: true });
    const monitor = new Hf3CameraMonitor();

    let vt = 0.1;
    let now = 0;
    for (let i = 0; i < 27; i++) {
      monitor.onVideoFrame(track, vt, now);
      monitor.onWorkerResult(makeWorkerResult(0.35), now);
      await Promise.resolve();
      vt += 0.1;
      now += 100;
    }
    expect(monitor.getSnapshot().exposureState).toBe("locked_verifying");

    // Keep low FPS (10 fps) for > 3000 ms after lock -> triggers auto-revert
    for (let i = 0; i < 32; i++) {
      vt += 0.1;
      now += 100;
      monitor.onVideoFrame(track, vt, now);
      monitor.onWorkerResult(makeWorkerResult(0.35), now);
      await Promise.resolve();
    }

    expect(applyConstraints).toHaveBeenLastCalledWith({
      advanced: [{ exposureMode: "continuous" }],
    });
    expect(monitor.getSnapshot().exposureState).toBe("reverted");
    expect(monitor.getSnapshot().exposureLocked).toBe(false);
    monitor.dispose();
  });
});

// @vitest-environment jsdom
/**
 * R23B-HF3 Unit Tests: Low-light camera — tajam dulu, baru terang.
 *
 * Uses compact real Owner frame segments from S-355cd7c6 (`tests/fixtures/s355-lowlight-segment.json`, < 2 MB):
 *  - T001 black frames (`lumaP50 = 0`, `cameraReportedFps = 60`)
 *  - T003 gesture dark slow-shutter frames (`uniqueCaptureFps ~ 7`, `blurProxy ~ 54`)
 *  - T004 canvas dark slow-shutter frames (`uniqueCaptureFps ~ 7`, `blurProxy ~ 63`)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  isInfraredCameraLabel,
  labCameraConstraints,
  labCameraFallbackConstraints,
  startLabCamera,
} from "@/src/components/nui-lab/lab-camera";
import {
  AutoPreprocessHysteresis,
  BlackFrameDetector,
  CameraExposureController,
  HF3_AUTO_PREPROCESS_PASS,
  HF3_CAMERA_BLACK_MESSAGE,
  computeTargetExposureTimeFor30Fps,
  probeCameraExposureCapabilities,
} from "@/src/components/nui-lab/bench/r20-lowlight";
import {
  MOMO_ASK_LIGHT_LOW_FPS_TEXT,
  MomoGuideFSM,
} from "@/src/components/nui-lab/bench/monui7-momo-guide";
import { BenchSessionManager } from "@/src/components/nui-lab/bench/manager";
import { MemoryBenchStore } from "@/src/components/nui-lab/bench/store";
import { buildEngineConfig } from "@/src/components/nui-lab/bench/engines";
import { validateExportFile } from "@/src/components/nui-lab/bench/export";

interface S355Frame {
  t: number;
  fid: number;
  lumaP50: number | null;
  handRoiLumaP50?: number | null;
  cameraReportedFps?: number | null;
  uniqueCaptureFps?: number | null;
  blurProxy?: number | null;
}

interface S355Fixture {
  sourceSessionId: string;
  t001BlackFrames: S355Frame[];
  t003DarkSlowFrames: S355Frame[];
  t004CanvasDarkSlowFrames: S355Frame[];
}

const FIXTURE_PATH = resolve(__dirname, "../fixtures/s355-lowlight-segment.json");
const S355: S355Fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as S355Fixture;

function makeMockTrack(opts: {
  exposureMode?: string[];
  exposureTime?: { min: number; max: number; step: number };
  currentExposureMode?: string;
  currentExposureTime?: number;
  applyShouldThrow?: boolean;
  label?: string;
}) {
  let mode = opts.currentExposureMode ?? "continuous";
  let expTime = opts.currentExposureTime ?? 1250;
  const applied: MediaTrackConstraints[] = [];
  const track = {
    label: opts.label ?? "Integrated Webcam",
    stop: vi.fn(),
    getCapabilities: vi.fn(() => ({
      ...(opts.exposureMode ? { exposureMode: opts.exposureMode } : {}),
      ...(opts.exposureTime ? { exposureTime: opts.exposureTime } : {}),
    })),
    getSettings: vi.fn(() => ({
      width: 640,
      height: 480,
      frameRate: 30,
      ...(opts.exposureMode ? { exposureMode: mode } : {}),
      ...(opts.exposureTime ? { exposureTime: expTime } : {}),
    })),
    applyConstraints: vi.fn(async (c: MediaTrackConstraints) => {
      applied.push(c);
      if (opts.applyShouldThrow) {
        throw new DOMException("hardware refused", "NotReadableError");
      }
      const adv = (c.advanced?.[0] ?? {}) as Record<string, unknown>;
      if (typeof adv.exposureMode === "string") mode = adv.exposureMode;
      if (typeof adv.exposureTime === "number") expTime = adv.exposureTime;
    }),
  };
  return { track: track as unknown as MediaStreamTrack, applied, getMode: () => mode, getTime: () => expTime };
}

describe("R23B-HF3 Step 1 & 5: Constraints, OverconstrainedError fallback, and IR avoidance", () => {
  it("builds 640x480 ideal 30 min 24 constraints and retries without min on OverconstrainedError", async () => {
    const fakeStream = {
      getVideoTracks: () => [{ label: "Integrated Webcam", getSettings: () => ({ width: 640, height: 480, frameRate: 30 }) }],
      getTracks: () => [],
    } as unknown as MediaStream;

    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("min fps unsupported", "OverconstrainedError"))
      .mockResolvedValueOnce(fakeStream);

    const res = await startLabCamera({ getUserMedia });
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.constraintFallback).toBe(true);
      expect(res.fallbackReason).toBe("OverconstrainedError");
    }
    expect(getUserMedia).toHaveBeenNthCalledWith(1, { video: labCameraConstraints(), audio: false });
    expect(getUserMedia).toHaveBeenNthCalledWith(2, { video: labCameraFallbackConstraints(), audio: false });
  });

  it("avoids auto-selecting IR/Infrared camera when > 1 camera exists, while allowing manual override", async () => {
    const rgbStream = {
      getVideoTracks: () => [{ label: "Integrated Webcam", getSettings: () => ({ deviceId: "rgb-1" }), stop: vi.fn() }],
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;
    const irStream = {
      getVideoTracks: () => [{ label: "Integrated IR Camera", getSettings: () => ({ deviceId: "ir-1" }), stop: vi.fn() }],
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;

    const enumerateDevices = vi.fn(async () => [
      { kind: "videoinput", deviceId: "ir-1", label: "Integrated IR Camera" },
      { kind: "videoinput", deviceId: "rgb-1", label: "Integrated Webcam" },
    ] as MediaDeviceInfo[]);
    const getUserMedia = vi.fn(async (c: MediaStreamConstraints) => {
      const v = c.video as MediaTrackConstraints;
      const dev = (v.deviceId as ConstrainDOMStringParameters | undefined)?.exact;
      return dev === "ir-1" ? irStream : rgbStream;
    });

    // Auto start: must pick rgb-1 and mark irCameraSkipped
    const autoRes = await startLabCamera({ getUserMedia, enumerateDevices });
    expect(autoRes.kind).toBe("ok");
    if (autoRes.kind === "ok") {
      expect(autoRes.selectedDeviceId).toBe("rgb-1");
      expect(autoRes.irCameraSkipped).toBe(true);
    }

    // Manual override: explicitly selecting IR camera is still respected
    const manualRes = await startLabCamera({ getUserMedia, enumerateDevices }, { deviceId: "ir-1" });
    expect(manualRes.kind).toBe("ok");
    if (manualRes.kind === "ok") {
      expect(manualRes.selectedDeviceId).toBe("ir-1");
      expect(manualRes.irCameraSkipped).toBe(false);
    }
    expect(isInfraredCameraLabel("Windows Hello Infrared")).toBe(true);
  });

  it("switches away from IR camera post-permission when pre-permission labels were blank", async () => {
    const irTrackStop = vi.fn();
    const irStream = {
      getVideoTracks: () => [{ label: "Dell Infrared Camera", getSettings: () => ({ deviceId: "ir-1" }), stop: irTrackStop }],
      getTracks: () => [{ stop: irTrackStop }],
    } as unknown as MediaStream;
    const rgbStream = {
      getVideoTracks: () => [{ label: "Dell RGB Webcam", getSettings: () => ({ deviceId: "rgb-1" }), stop: vi.fn() }],
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;

    // First call before permission: empty labels; second call after permission: real labels
    const enumerateDevices = vi
      .fn()
      .mockResolvedValueOnce([
        { kind: "videoinput", deviceId: "ir-1", label: "" },
        { kind: "videoinput", deviceId: "rgb-1", label: "" },
      ])
      .mockResolvedValueOnce([
        { kind: "videoinput", deviceId: "ir-1", label: "Dell Infrared Camera" },
        { kind: "videoinput", deviceId: "rgb-1", label: "Dell RGB Webcam" },
      ]);
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(irStream)
      .mockResolvedValueOnce(rgbStream);

    const res = await startLabCamera({ getUserMedia, enumerateDevices });
    expect(res.kind).toBe("ok");
    expect(irTrackStop).toHaveBeenCalledTimes(1);
    if (res.kind === "ok") {
      expect(res.stream).toBe(rgbStream);
      expect(res.selectedDeviceId).toBe("rgb-1");
      expect(res.irCameraSkipped).toBe(true);
    }
  });
});

describe("R23B-HF3 Step 2: Exposure lock & revert controller", () => {
  it("computes nearest exposureTime <= 33.3 ms across capability units (100us, ms, s, us)", () => {
    expect(computeTargetExposureTimeFor30Fps({ min: 1, max: 5000, step: 1 })).toMatchObject({
      unit: "100us",
      target: 333,
    });
    expect(computeTargetExposureTimeFor30Fps({ min: 10, max: 10000, step: 10 })).toMatchObject({
      unit: "100us",
      target: 330,
    });
    expect(computeTargetExposureTimeFor30Fps({ min: 1, max: 200, step: 1 })).toMatchObject({
      unit: "ms",
      target: 33,
    });
    expect(computeTargetExposureTimeFor30Fps({ min: 0.001, max: 1, step: 0.001 })).toMatchObject({
      unit: "s",
      target: 0.033,
    });
    expect(computeTargetExposureTimeFor30Fps({ min: 100, max: 1_000_000, step: 100 })).toMatchObject({
      unit: "us",
      target: 33300,
    });
  });

  it("locks exposureTime on real S-355cd7c6 T003 slow FPS (< 20 for >= 2s) and stays locked when FPS rises", async () => {
    const { track, getMode, getTime } = makeMockTrack({
      exposureMode: ["continuous", "manual"],
      exposureTime: { min: 3, max: 2047, step: 1 },
      currentExposureMode: "continuous",
      currentExposureTime: 1250,
    });
    const onLocked = vi.fn();
    const onReverted = vi.fn();
    const ctrl = new CameraExposureController(track, probeCameraExposureCapabilities(track), {
      onLocked,
      onReverted,
    });

    expect(ctrl.getStatus().state).toBe("monitoring");
    expect(ctrl.hasAttemptedOrUnsupported).toBe(false);

    // Feed real S-355cd7c6 T003 frames (~7 fps) until >= 2s elapses
    const t0 = S355.t003DarkSlowFrames[0]!.t;
    for (const f of S355.t003DarkSlowFrames) {
      await ctrl.update(f.uniqueCaptureFps ?? null, f.t);
      if (f.t - t0 >= 2500) break;
    }

    expect(onLocked).toHaveBeenCalledTimes(1);
    expect(onLocked.mock.calls[0]![0]).toMatchObject({
      beforeExposureMode: "continuous",
      beforeExposureTime: 1250,
      afterExposureMode: "manual",
      afterExposureTime: 333,
      unit: "100us",
    });
    expect(getMode()).toBe("manual");
    expect(getTime()).toBe(333);
    expect(ctrl.getStatus().state).toBe("locked_verifying");

    // Simulate FPS rising to 28 fps after lock -> stays locked_ok
    await ctrl.update(28, t0 + 3500);
    expect(ctrl.getStatus().state).toBe("locked_ok");
    expect(ctrl.getStatus().locked).toBe(true);
    expect(ctrl.hasAttemptedOrUnsupported).toBe(true);
    expect(onReverted).not.toHaveBeenCalled();
  });

  it("reverts to continuous auto exposure if FPS does not rise within 3s on S-355cd7c6 T004 frames", async () => {
    const { track, getMode } = makeMockTrack({
      exposureMode: ["continuous", "manual"],
      exposureTime: { min: 1, max: 5000, step: 1 },
      currentExposureMode: "continuous",
      currentExposureTime: 1400,
    });
    const onLocked = vi.fn();
    const onReverted = vi.fn();
    const ctrl = new CameraExposureController(track, probeCameraExposureCapabilities(track), {
      onLocked,
      onReverted,
    });

    // Replay all real T004 frames (~7 fps across 8 seconds) — FPS never rises
    for (const f of S355.t004CanvasDarkSlowFrames) {
      await ctrl.update(f.uniqueCaptureFps ?? null, f.t);
    }

    expect(onLocked).toHaveBeenCalledTimes(1);
    expect(onReverted).toHaveBeenCalledTimes(1);
    expect(onReverted.mock.calls[0]![0]).toMatchObject({
      reason: "fps-did-not-rise",
      afterExposureMode: "continuous",
    });
    expect(getMode()).toBe("continuous");
    expect(ctrl.getStatus().state).toBe("reverted");
    expect(ctrl.getStatus().reverted).toBe(true);
    expect(ctrl.hasAttemptedOrUnsupported).toBe(true);
  });

  it("reverts cleanly when applyConstraints throws an error", async () => {
    const { track } = makeMockTrack({
      exposureMode: ["continuous", "manual"],
      exposureTime: { min: 1, max: 5000, step: 1 },
      applyShouldThrow: true,
    });
    const onReverted = vi.fn();
    const ctrl = new CameraExposureController(track, probeCameraExposureCapabilities(track), {
      onReverted,
    });

    await ctrl.update(8, 0);
    await ctrl.update(8, 2100);

    expect(onReverted).toHaveBeenCalledTimes(1);
    expect(onReverted.mock.calls[0]![0]).toMatchObject({
      reason: "apply-constraints-error",
      afterExposureMode: "continuous",
    });
    expect(ctrl.getStatus().state).toBe("reverted");
    expect(ctrl.hasAttemptedOrUnsupported).toBe(true);
  });

  it("skips step 2 cleanly when camera lacks exposureTime capability", async () => {
    const { track } = makeMockTrack({
      exposureMode: ["continuous", "manual"],
      // No exposureTime capability (just like some laptop drivers)
    });
    const ctrl = new CameraExposureController(track, probeCameraExposureCapabilities(track));
    expect(ctrl.getStatus().supported).toBe(false);
    expect(ctrl.getStatus().state).toBe("unsupported");
    expect(ctrl.hasAttemptedOrUnsupported).toBe(true);

    await ctrl.update(7, 0);
    await ctrl.update(7, 5000);
    expect(ctrl.getStatus().attempted).toBe(false);
  });
});

describe("R23B-HF3 Step 3: Auto-brightener hysteresis (0.15 ON / 1s, 0.22 OFF / 2s)", () => {
  it("activates A4v2 only after < 0.15 for >= 1s, holds inside [0.15, 0.22], and turns OFF after > 0.22 for >= 2s", () => {
    const hys = new AutoPreprocessHysteresis();
    expect(hys.active).toBe(false);
    expect(hys.getStatus().mode).toBe(HF3_AUTO_PREPROCESS_PASS);

    // Fallback to lumaP50 when handRoiLumaP50 is null
    let r = hys.update({ nowMs: 0, handRoiLumaP50: null, lumaP50: 0.12 });
    expect(r.active).toBe(false);
    expect(r.transition).toBeNull();
    expect(r.lumaSource).toBe("lumaP50");

    // 900 ms < 1000 ms -> still OFF
    r = hys.update({ nowMs: 900, handRoiLumaP50: null, lumaP50: 0.12 });
    expect(r.active).toBe(false);
    expect(r.transition).toBeNull();

    // 1050 ms >= 1000 ms -> transitions ON
    r = hys.update({ nowMs: 1050, handRoiLumaP50: null, lumaP50: 0.12 });
    expect(r.active).toBe(true);
    expect(r.transition).toBe("ON");
    expect(r.status.onCount).toBe(1);

    // Inside hysteresis dead-band [0.15, 0.22] -> MUST stay ON even for > 5 seconds
    r = hys.update({ nowMs: 2000, handRoiLumaP50: 0.19, lumaP50: 0.5 });
    expect(r.lumaSource).toBe("handRoiLumaP50"); // handRoiLumaP50 takes precedence over bright background!
    expect(r.active).toBe(true);
    expect(r.transition).toBeNull();

    r = hys.update({ nowMs: 7000, handRoiLumaP50: 0.21, lumaP50: 0.5 });
    expect(r.active).toBe(true);
    expect(r.transition).toBeNull();

    // Above 0.22 starts 2s turn-off timer
    r = hys.update({ nowMs: 8000, handRoiLumaP50: 0.25, lumaP50: 0.25 });
    expect(r.active).toBe(true);
    expect(r.transition).toBeNull();

    // 1900 ms above 0.22 -> still ON
    r = hys.update({ nowMs: 9900, handRoiLumaP50: 0.25, lumaP50: 0.25 });
    expect(r.active).toBe(true);
    expect(r.transition).toBeNull();

    // 2050 ms above 0.22 -> transitions OFF
    r = hys.update({ nowMs: 10050, handRoiLumaP50: 0.25, lumaP50: 0.25 });
    expect(r.active).toBe(false);
    expect(r.transition).toBe("OFF");
    expect(r.status.offCount).toBe(1);
  });

  it("does NOT falsely activate on S-355cd7c6 T003 auto-exposed bright-but-blurry frames (lumaP50 ~ 0.39)", () => {
    const hys = new AutoPreprocessHysteresis();
    for (const f of S355.t003DarkSlowFrames) {
      const r = hys.update({ nowMs: f.t, handRoiLumaP50: f.handRoiLumaP50 ?? null, lumaP50: f.lumaP50 });
      expect(r.active).toBe(false);
      expect(r.transition).toBeNull();
    }
  });
});

describe("R23B-HF3 Step 6: Black-frame detection on real S-355cd7c6 T001 frames", () => {
  it("triggers CAMERA_BLACK with exact Indonesian message after lumaP50 = 0 for >= 2s", () => {
    const det = new BlackFrameDetector();
    const t0 = S355.t001BlackFrames[0]!.t;
    let triggerCount = 0;
    let triggerAtMs: number | null = null;
    let triggerMsg: string | null = null;

    for (const f of S355.t001BlackFrames) {
      expect(f.lumaP50).toBe(0);
      const res = det.update(f.lumaP50, f.t);
      if (f.t - t0 < 2000) {
        expect(res.isBlack).toBe(false);
      }
      if (res.justTriggered) {
        triggerCount++;
        triggerAtMs = f.t - t0;
        triggerMsg = res.message;
      }
    }

    expect(triggerCount).toBe(1);
    expect(triggerAtMs).not.toBeNull();
    expect(triggerAtMs!).toBeGreaterThanOrEqual(2000);
    expect(triggerMsg).toBe(HF3_CAMERA_BLACK_MESSAGE);
    expect(triggerMsg).toBe("Kamera hitam. Cek penutup kamera atau pilih kamera lain.");

    // Recovers when a non-zero luma frame arrives
    const recovered = det.update(0.25, t0 + 5000);
    expect(recovered.isBlack).toBe(false);
    expect(recovered.message).toBeNull();
  });
});

describe("R23B-HF3 Step 7: Momo ASK_LIGHT triggered by low capture FPS (< 12 for >= 3s after step 2)", () => {
  it("does NOT trigger before exposure step 2 is attempted, and triggers with exact message after step 2 on S-355cd7c6 T004 frames", () => {
    const guide = new MomoGuideFSM("LOCKED");
    const t0 = S355.t004CanvasDarkSlowFrames[0]!.t;

    // 1. Before step 2 is attempted: even 4s at 7 fps must NOT trigger low-FPS ASK_LIGHT
    for (const f of S355.t004CanvasDarkSlowFrames) {
      const res = guide.update({
        nowMs: f.t,
        hasHand: true,
        fiveFingerValid: false,
        handRoiLumaP50: 0.35,
        frameLumaMean: 0.39,
        uniqueCaptureFps: f.uniqueCaptureFps ?? null,
        exposureControlAttempted: false,
      });
      expect(res.state).toBe("LOCKED");
      if (f.t - t0 >= 4000) break;
    }

    // 2. After step 2 was tried (e.g. reverted or unsupported): >= 3s at < 12 fps triggers ASK_LIGHT
    const guideAfter = new MomoGuideFSM("LOCKED");
    let firedText: string | null = null;
    let firedElapsed: number | null = null;
    for (const f of S355.t004CanvasDarkSlowFrames) {
      const res = guideAfter.update({
        nowMs: f.t,
        hasHand: true,
        fiveFingerValid: false,
        handRoiLumaP50: 0.35,
        frameLumaMean: 0.39,
        uniqueCaptureFps: f.uniqueCaptureFps ?? null,
        exposureControlAttempted: true,
      });
      if (f.t - t0 < 3000) {
        expect(res.state).toBe("LOCKED");
      }
      if (res.promptEvent && res.state === "ASK_LIGHT") {
        firedText = res.promptEvent.text;
        firedElapsed = f.t - t0;
        break;
      }
    }

    expect(guideAfter.state).toBe("ASK_LIGHT");
    expect(firedElapsed).not.toBeNull();
    expect(firedElapsed!).toBeGreaterThanOrEqual(3000);
    expect(firedText).toBe(MOMO_ASK_LIGHT_LOW_FPS_TEXT);
    expect(firedText).toBe("Kameramu melambat karena gelap. Nyalakan lampu di depanmu, ya.");
    expect(guideAfter.text).toBe(MOMO_ASK_LIGHT_LOW_FPS_TEXT);
    expect(guideAfter.isInkAllowed).toBe(false);
  });
});

describe("R23B-HF3 Step 4: SessionMeta persistence & export privacy", () => {
  it("stores actual resolution/fps, exposure capabilities, and step 2/3 status in exported session meta without leaking device labels", async () => {
    const store = new MemoryBenchStore();
    const mgr = new BenchSessionManager({
      openStore: async () => store,
      now: () => 1000,
      wallMinuteIso: () => "2026-11-23T00:00:00.000Z",
    });

    const { track } = makeMockTrack({
      exposureMode: ["continuous", "manual"],
      exposureTime: { min: 3, max: 2047, step: 1 },
      label: "Secret-Laptop-Webcam-Model-XYZ",
    });
    const caps = probeCameraExposureCapabilities(track);
    const ctrl = new CameraExposureController(track, caps);
    const hys = new AutoPreprocessHysteresis();

    await mgr.startSession({
      consent: true,
      app: { version: "0.29.3-alpha+r23b-monui7-hf3", gitCommit: "hf3test", gitBranch: "research-can" },
      environment: {
        userAgentFamily: "Chromium",
        platform: "Linux",
        hardwareConcurrency: 8,
        deviceMemoryGb: 16,
        devicePixelRatio: 1,
        viewport: { w: 1280, h: 720 },
        secureContext: true,
        storage: "memory-only",
      },
      cameraActual: {
        width: 640,
        height: 480,
        frameRate: 30,
        deviceClass: "physical-presumed",
        constraintFallback: false,
        irCameraSkipped: true,
      },
      cameraCapabilities: {
        supported: caps.supported,
        exposureMode: caps.exposureMode,
        exposureTime: caps.exposureTime,
        currentExposureMode: caps.currentExposureMode,
        currentExposureTime: caps.currentExposureTime,
        canLockExposureTime: caps.canLockExposureTime,
      },
      exposureControlStatus: ctrl.getStatus(),
      autoPreprocessStatus: hys.getStatus(),
    });

    mgr.beginTrial({
      route: "canvas",
      source: "canvas-lab",
      engine: buildEngineConfig("r20-c4", "raw", "cpu-worker", true),
      camera: { width: 640, height: 480, frameRate: 30, deviceClass: "physical-presumed" },
    });

    mgr.event("CAMERA_CONSTRAINT_FALLBACK", { reason: "OverconstrainedError", retriedWithoutMinFps: true }, "system");
    mgr.event("PREPROCESS_AUTO_ON", { pass: HF3_AUTO_PREPROCESS_PASS, effectiveLuma: 0.11, lumaSource: "lumaP50" }, "system");
    mgr.patchSessionMeta({
      autoPreprocessStatus: { ...hys.getStatus(), active: true, onCount: 1 },
    });

    await mgr.finishSession("user-finish");
    const blob = await mgr.exportAll({ version: "0.29.3-alpha+r23b-monui7-hf3", gitCommit: "hf3test" });
    const text =
      typeof blob.text === "function"
        ? await blob.text()
        : await new Promise<string>((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(String(reader.result));
            reader.onerror = () => rej(reader.error);
            reader.readAsText(blob);
          });
    const parsed = JSON.parse(text);

    expect(validateExportFile(parsed)).toEqual([]);
    expect(text).not.toContain("Secret-Laptop-Webcam-Model-XYZ");

    const meta = parsed.sessions[0].meta;
    expect(meta.cameraActual).toEqual({
      width: 640,
      height: 480,
      frameRate: 30,
      deviceClass: "physical-presumed",
      constraintFallback: false,
      irCameraSkipped: true,
    });
    expect(meta.cameraCapabilities.exposureMode).toEqual(["continuous", "manual"]);
    expect(meta.cameraCapabilities.exposureTime).toEqual({ min: 3, max: 2047, step: 1 });
    expect(meta.exposureControlStatus.state).toBe("monitoring");
    expect(meta.autoPreprocessStatus.mode).toBe("A4_denoise_reinhard320");
    expect(meta.autoPreprocessStatus.active).toBe(true);
  });
});

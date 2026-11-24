import { describe, expect, it, vi } from "vitest";
import {
  isInfraredCameraLabel,
  labCameraConstraints,
  labCameraFallbackConstraints,
  selectDefaultNonIrVideoDevice,
  startLabCamera,
} from "@/src/components/nui-lab/lab-camera";
import { messageFor } from "@/src/camera/messages";

const fakeStream = { id: "fake" } as unknown as MediaStream;

function domError(name: string): DOMException {
  return new DOMException("x", name);
}

describe("labCameraConstraints (R23B-HF3)", () => {
  it("requests 640x480 with frameRate ideal 30, min 24 (tajam dulu, baru terang)", () => {
    expect(labCameraConstraints()).toEqual({
      facingMode: "user",
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30, min: 24 },
    });
  });

  it("drops min frameRate on fallback constraints while keeping 640x480 and ideal 30", () => {
    expect(labCameraFallbackConstraints()).toEqual({
      facingMode: "user",
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30 },
    });
    expect(labCameraFallbackConstraints("cam-rgb")).toEqual({
      deviceId: { exact: "cam-rgb" },
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30 },
    });
  });
});

describe("IR camera detection & avoidance", () => {
  it("flags IR / Infrared camera labels without false positives on ordinary webcams", () => {
    expect(isInfraredCameraLabel("Integrated IR Camera")).toBe(true);
    expect(isInfraredCameraLabel("Intel(R) RealSense(TM) Infrared")).toBe(true);
    expect(isInfraredCameraLabel("HD_IR_Cam")).toBe(true);
    expect(isInfraredCameraLabel("USB (IR)")).toBe(true);
    expect(isInfraredCameraLabel("Integrated Webcam")).toBe(false);
    expect(isInfraredCameraLabel("Logitech Brio 4K")).toBe(false);
    expect(isInfraredCameraLabel("MirrorCam HD")).toBe(false);
  });

  it("skips IR cameras when > 1 videoinput exists", () => {
    const picked = selectDefaultNonIrVideoDevice([
      { kind: "videoinput", deviceId: "dev-ir", label: "Integrated IR Camera" },
      { kind: "videoinput", deviceId: "dev-rgb", label: "Integrated Webcam" },
    ]);
    expect(picked).toEqual({ deviceId: "dev-rgb", irCameraSkipped: true });

    // Single camera -> no forced deviceId
    expect(
      selectDefaultNonIrVideoDevice([
        { kind: "videoinput", deviceId: "dev-ir", label: "Integrated IR Camera" },
      ]),
    ).toEqual({ deviceId: null, irCameraSkipped: false });
  });
});

describe("startLabCamera", () => {
  it("makes one constrained request and returns the stream without fallback", async () => {
    const getUserMedia = vi.fn(async () => fakeStream);
    const result = await startLabCamera({ getUserMedia } as unknown as MediaDevices);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({ video: labCameraConstraints(), audio: false });
    expect(result).toEqual({
      kind: "ok",
      stream: fakeStream,
      constraintFallback: false,
      fallbackReason: null,
      selectedDeviceId: null,
      irCameraSkipped: false,
    });
  });

  it("retries without frameRate.min on OverconstrainedError and flags constraintFallback", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(domError("OverconstrainedError"))
      .mockResolvedValueOnce(fakeStream);
    const result = await startLabCamera({ getUserMedia } as unknown as MediaDevices);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1]![0]).toEqual({
      video: labCameraFallbackConstraints(),
      audio: false,
    });
    expect(result).toEqual({
      kind: "ok",
      stream: fakeStream,
      constraintFallback: true,
      fallbackReason: "OverconstrainedError",
      selectedDeviceId: null,
      irCameraSkipped: false,
    });
  });

  it("falls back to plain video:true only if both constrained requests throw OverconstrainedError", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(domError("OverconstrainedError"))
      .mockRejectedValueOnce(domError("OverconstrainedError"))
      .mockResolvedValueOnce(fakeStream);
    const result = await startLabCamera({ getUserMedia } as unknown as MediaDevices);
    expect(getUserMedia).toHaveBeenCalledTimes(3);
    expect(getUserMedia.mock.calls[2]![0]).toEqual({ video: true, audio: false });
    expect(result.kind === "ok" && result.constraintFallback).toBe(true);
  });

  it("does not retry on a permission refusal; it shows the student-safe message", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(domError("NotAllowedError"));
    const result = await startLabCamera({ getUserMedia } as unknown as MediaDevices);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ kind: "error", message: messageFor("permission-denied") });
  });

  it("reports a camera that is missing on the fallback too", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(domError("OverconstrainedError"))
      .mockRejectedValueOnce(domError("NotFoundError"));
    const result = await startLabCamera({ getUserMedia } as unknown as MediaDevices);
    expect(result).toEqual({ kind: "error", message: messageFor("camera-unavailable") });
  });

  it("says so when the browser has no camera API at all", async () => {
    const result = await startLabCamera(undefined);
    expect(result).toEqual({ kind: "error", message: messageFor("unsupported") });
  });
});

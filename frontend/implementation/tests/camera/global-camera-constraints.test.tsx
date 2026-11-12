// @vitest-environment jsdom
/**
 * NUI-2 anti motion blur: one getUserMedia call asks for 720p at 24-60 fps. A camera that cannot meet it
 * (OverconstrainedError) still has to start, so the call is retried with the plain video request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GlobalCamera } from "@/src/components/camera/GlobalCamera";
import { resetInputModeForTest } from "@/src/input/input-mode";

vi.mock("gsap", () => {
  const tl = { fromTo: vi.fn().mockReturnThis(), call: vi.fn().mockReturnThis(), kill: vi.fn() };
  const g = { fromTo: vi.fn(() => ({ kill: vi.fn() })), killTweensOf: vi.fn(), to: vi.fn(), set: vi.fn(), timeline: vi.fn(() => tl) };
  return { default: g, ...g };
});
vi.mock("@/src/components/momo/MomoAvatar", () => ({ MomoAvatar: () => null }));
vi.mock("@/src/camera/landmarker-warmup", () => ({
  warmHandLandmarker: vi.fn(async () => undefined),
  subscribeHandLandmarkerStatus: vi.fn(() => () => undefined),
  takeHandLandmarker: vi.fn(() => new Promise(() => undefined)),
}));

function fakeStream(): MediaStream {
  const track = { stop: vi.fn(), addEventListener: vi.fn(), getSettings: () => ({ deviceId: "c" }) };
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
}

function overconstrained(): DOMException {
  return new DOMException("Constraints cannot be satisfied", "OverconstrainedError");
}

/** Clicks the camera switch and lets the pending getUserMedia promise settle. */
async function turnCameraOn() {
  await act(async () => { fireEvent.click(screen.getByTestId("btn-camera-toggle-switch")); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetInputModeForTest();
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  getUserMedia = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([]) },
  });
});
afterEach(() => {
  cleanup();
});

describe("GlobalCamera camera constraints (NUI-2 anti motion blur)", () => {
  it("asks for 720p at 24-60 fps in the single getUserMedia call and keeps the front camera", async () => {
    getUserMedia.mockResolvedValue(fakeStream());
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await turnCameraOn();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    const arg = getUserMedia.mock.calls[0]![0] as { video: MediaTrackConstraints; audio: boolean };
    expect(arg.audio).toBe(false);
    expect(arg.video).toMatchObject({
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60, min: 24 },
    });
    // The existing 5:4 preference is kept (the brief says keep existing fields).
    expect(arg.video).toHaveProperty("aspectRatio");
  });

  it("retries with the plain video request when the constrained call is OverconstrainedError, and the camera still starts", async () => {
    getUserMedia.mockRejectedValueOnce(overconstrained()).mockResolvedValueOnce(fakeStream());
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await turnCameraOn();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1]![0]).toEqual({ video: true, audio: false });
    expect(screen.getByTestId("camera-card").className).toContain("has-stream");
  });

  it("keeps the chosen camera when it retries after OverconstrainedError", async () => {
    // A selected device must not be swapped for the default camera when only the resolution cannot be met.
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: vi.fn().mockResolvedValue([{ kind: "videoinput", deviceId: "cam-2", label: "USB" }]),
      },
    });
    getUserMedia.mockResolvedValue(fakeStream());
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await turnCameraOn();
    getUserMedia.mockReset();
    getUserMedia.mockRejectedValueOnce(overconstrained()).mockResolvedValueOnce(fakeStream());
    await act(async () => { fireEvent.change(screen.getByLabelText("Pilih kamera"), { target: { value: "cam-2" } }); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    const retry = getUserMedia.mock.calls[1]![0] as { video: { deviceId?: unknown } };
    expect(retry.video.deviceId).toEqual({ exact: "cam-2" });
  });

  it("does not retry on other errors (a denied permission is shown, not retried)", async () => {
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await turnCameraOn();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("camera-card").className).toContain("failed");
  });
});

// @vitest-environment jsdom
/**
 * I1 cold start on the cover: the hand model is warmed once, after the camera permission, without blocking the UI.
 * The status is shown only when it fails; the technical states (loading, warming, GPU/CPU) stay hidden.
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
vi.mock("@/src/components/momo/MomoGuide", () => ({ MomoGuide: () => null }));
vi.mock("@/src/camera/wave-tracker", () => ({
  WaveTracker: class {
    start = vi.fn(async () => undefined);
    stop = vi.fn();
    subscribeProgress = vi.fn(() => () => undefined);
  },
}));

const warm = vi.hoisted(() => ({
  warmHandLandmarker: vi.fn(async () => undefined),
  listener: null as null | ((s: unknown) => void),
  unsubscribed: 0,
}));
vi.mock("@/src/camera/landmarker-warmup", () => ({
  warmHandLandmarker: warm.warmHandLandmarker,
  subscribeHandLandmarkerStatus: vi.fn((listener: (s: unknown) => void) => {
    warm.listener = listener;
    listener({ kind: "idle" });
    return () => {
      warm.listener = null;
      warm.unsubscribed++;
    };
  }),
}));

async function flush() {
  for (let i = 0; i < 6; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}

async function cameraOn() {
  const track = { stop: vi.fn(), addEventListener: vi.fn(), getSettings: () => ({ deviceId: "c" }) };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream), enumerateDevices: vi.fn().mockResolvedValue([]) },
  });
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  fireEvent.click(screen.getByTestId("btn-camera-toggle-switch"));
  await flush();
}

beforeEach(() => {
  resetInputModeForTest();
  warm.warmHandLandmarker.mockClear();
  warm.listener = null;
  warm.unsubscribed = 0;
});
afterEach(() => {
  cleanup();
});

describe("GlobalCamera cover cold start (I1)", () => {
  it("does not touch the hand model before the camera permission", () => {
    render(<GlobalCamera mode="cover" modelUrl="/m.task" />);
    expect(warm.warmHandLandmarker).not.toHaveBeenCalled();
  });

  it("warms the model once after the camera is on, with the cover's model URL", async () => {
    const { rerender } = render(<GlobalCamera mode="cover" modelUrl="/m.task" />);
    await cameraOn();
    expect(warm.warmHandLandmarker).toHaveBeenCalledTimes(1);
    expect(warm.warmHandLandmarker).toHaveBeenCalledWith(expect.objectContaining({ modelUrl: "/m.task", wasmRoot: expect.any(String) }));
    rerender(<GlobalCamera mode="cover" modelUrl="/m.task" />);
    expect(warm.warmHandLandmarker).toHaveBeenCalledTimes(1);
  });

  it("does not warm the model in the floating PIP", async () => {
    render(<GlobalCamera mode="floating" modelUrl="/m.task" />);
    await cameraOn();
    expect(warm.warmHandLandmarker).not.toHaveBeenCalled();
  });

  it("shows nothing while the model loads or warms; a failure shows one honest sentence", async () => {
    render(<GlobalCamera mode="cover" modelUrl="/m.task" />);
    await cameraOn();
    const status = () => screen.getByTestId("camera-status").textContent ?? "";
    act(() => { warm.listener?.({ kind: "loading" }); });
    expect(status()).toBe("");
    act(() => { warm.listener?.({ kind: "warming", delegate: "GPU" }); });
    expect(status()).toBe("");
    act(() => { warm.listener?.({ kind: "ready", delegate: "GPU" }); });
    expect(status()).toBe("");
    act(() => { warm.listener?.({ kind: "failed", message: "Deteksi tangan belum bisa dimuat." }); });
    expect(status()).toBe("Deteksi tangan belum bisa dimuat.");
  });

  it("releases the status subscription on unmount", () => {
    const { unmount } = render(<GlobalCamera mode="cover" modelUrl="/m.task" />);
    unmount();
    expect(warm.unsubscribed).toBe(1);
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DelegateInfo } from "@/src/camera/hand-landmarker";
import { getInferenceStats, resetInferenceSchedulerForTest } from "@/src/camera/inference-scheduler";

const mocks = vi.hoisted(() => {
  const defaultDelegate: DelegateInfo = {
    delegate: "GPU",
    reason: "gpu",
    switchState: "none",
    gpuAvgMs: null,
    slowStreak: 0,
    switchError: null,
  };
  const landmarker = { detectForVideo: vi.fn(() => ({ landmarks: [] })), close: vi.fn() };
  return {
    landmarker,
    createHandLandmarker: vi.fn(async () => ({ landmarker, delegate: "GPU", fellBack: false })),
    defaultDelegate,
    delegateInfo: { ...defaultDelegate },
  };
});

// Real delegateLabel and types; only the model load and the live delegate state are replaced.
vi.mock("@/src/camera/hand-landmarker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/camera/hand-landmarker")>()),
  createHandLandmarker: mocks.createHandLandmarker,
  getDelegateInfo: () => ({ ...mocks.delegateInfo }),
}));

// The video element is a plain object in jsdom: no canvas work for the detector input.
vi.mock("@/src/camera/frame-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/camera/frame-source")>()),
  frameForDetection: (video: HTMLVideoElement) => video,
}));

import { NuiLabPage } from "@/src/components/nui-lab/NuiLabPage";

function fakeStream() {
  const track = {
    stop: vi.fn(),
    getSettings: () => ({ width: 1280, height: 720, frameRate: 30 }),
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

// jsdom has no 2D canvas: the ink preview then skips its drawing, as it does in a browser without one.
vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);

function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, "mediaDevices", { value, configurable: true });
}

/** A video whose frame only changes when the test moves the clock: one call = one new camera frame. */
function fakeVideo(video: HTMLVideoElement) {
  let time = 0.1;
  Object.defineProperty(video, "readyState", { configurable: true, get: () => 4 });
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => time,
    set: (v: number) => {
      time = v;
    },
  });
  return { nextFrame: () => (time += 0.1) };
}

/** Stand-in for a slow model: the thread is busy for `ms`, as a real detectForVideo would be. */
function busyWait(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    /* spin */
  }
}

/** Value of a readout row, by its label (dt) in the numbers list. */
function stat(label: string): string {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent ?? "";
}

async function startCamera() {
  const { stream } = fakeStream();
  setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
  const view = render(<NuiLabPage />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
  });
  return view;
}

beforeEach(() => {
  mocks.createHandLandmarker.mockClear();
  mocks.landmarker.close.mockClear();
  mocks.landmarker.detectForVideo.mockReset();
  mocks.landmarker.detectForVideo.mockImplementation(() => ({ landmarks: [] }));
  mocks.delegateInfo = { ...mocks.defaultDelegate };
  resetInferenceSchedulerForTest();
});

afterEach(() => {
  cleanup();
  setMediaDevices(undefined);
});

describe("NuiLabPage without a camera", () => {
  it("shows the start button disabled and a clear message when getUserMedia is missing", async () => {
    setMediaDevices(undefined);
    render(<NuiLabPage />);
    expect(screen.getByRole("heading", { name: /uji tangan/i })).toBeTruthy();
    const start = screen.getByRole("button", { name: "Nyalakan kamera" }) as HTMLButtonElement;
    await waitFor(() => expect(start.disabled).toBe(true));
    expect(screen.getByText("Browser ini belum bisa pakai kamera.")).toBeTruthy();
    expect(mocks.createHandLandmarker).not.toHaveBeenCalled();
  });
});

describe("NuiLabPage camera", () => {
  it("does not touch the camera until the owner clicks", () => {
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    setMediaDevices({ getUserMedia });
    render(<NuiLabPage />);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(mocks.createHandLandmarker).not.toHaveBeenCalled();
    // With the camera off the wave test still tells the owner what to do.
    expect(screen.getByText(/Belum diuji/)).toBeTruthy();
  });

  it("starts the camera on click and the hand model with it", async () => {
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    setMediaDevices({ getUserMedia });
    render(<NuiLabPage />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(() => expect(mocks.createHandLandmarker).toHaveBeenCalledTimes(1));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Matikan kamera" })).toBeTruthy();
  });

  it("stops the tracks and closes the model when the owner stops the camera", async () => {
    const { stream, track } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    render(<NuiLabPage />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(() => expect(mocks.createHandLandmarker).toHaveBeenCalled());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Matikan kamera" }));
    });
    expect(track.stop).toHaveBeenCalled();
    expect(mocks.landmarker.close).toHaveBeenCalled();
  });

  it("releases the camera and the model on unmount", async () => {
    const { stream, track } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    const view = render(<NuiLabPage />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(() => expect(mocks.createHandLandmarker).toHaveBeenCalled());
    view.unmount();
    expect(track.stop).toHaveBeenCalled();
    expect(mocks.landmarker.close).toHaveBeenCalled();
  });
});

describe("NuiLabPage delegate readouts", () => {
  it("shows the CPU engine and why, for a browser without a GPU", async () => {
    mocks.delegateInfo = { ...mocks.defaultDelegate, delegate: "CPU", reason: "software-renderer" };
    await startCamera();
    await waitFor(() => expect(stat("Mesin (GPU/CPU)")).toBe("CPU (tanpa GPU)"));
    expect(stat("Alasan mesin")).toBe("Tidak ada GPU, browser memakai renderer perangkat lunak");
    expect(stat("Status pindah mesin")).toBe("tidak ada pindah");
  });

  it("shows the switch to CPU after the GPU was measured too slow", async () => {
    mocks.delegateInfo = { ...mocks.defaultDelegate, delegate: "CPU", reason: "slow-gpu", switchState: "switched" };
    await startCamera();
    await waitFor(() => expect(stat("Mesin (GPU/CPU)")).toBe("CPU (GPU lambat)"));
    expect(stat("Alasan mesin")).toBe("GPU terlalu lambat, pindah ke CPU");
    expect(stat("Status pindah mesin")).toBe("sudah pindah ke CPU");
  });

  it("shows that a failed switch keeps the GPU, with the error", async () => {
    mocks.delegateInfo = { ...mocks.defaultDelegate, switchState: "failed", switchError: "boom" };
    await startCamera();
    await waitFor(() => expect(stat("Status pindah mesin")).toBe("gagal pindah ke CPU, tetap pakai GPU (boom)"));
    expect(stat("Mesin (GPU/CPU)")).toBe("GPU");
  });
});

describe("NuiLabPage detection runs through the shared gate", () => {
  it("skips a frame that arrives inside the gap after a slow detection, then detects again", async () => {
    // 200 ms detection: the busy cap (50 %) makes the next start wait about 400 ms.
    mocks.landmarker.detectForVideo.mockImplementation(() => {
      busyWait(200);
      return { landmarks: [] };
    });
    const { stream } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    const { container } = render(<NuiLabPage />);
    const clock = fakeVideo(container.querySelector("video") as HTMLVideoElement);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });

    await waitFor(() => expect(mocks.landmarker.detectForVideo).toHaveBeenCalledTimes(1), { timeout: 2000 });

    clock.nextFrame();
    await waitFor(() => expect(getInferenceStats().skippedFrames).toBeGreaterThanOrEqual(1), { timeout: 1000 });
    expect(mocks.landmarker.detectForVideo).toHaveBeenCalledTimes(1);

    await waitFor(
      () => {
        clock.nextFrame();
        expect(mocks.landmarker.detectForVideo).toHaveBeenCalledTimes(2);
      },
      { timeout: 3000, interval: 25 },
    );
  });

  it("shows the effective detection rate and the average inference time from the gate", async () => {
    mocks.landmarker.detectForVideo.mockImplementation(() => {
      busyWait(200);
      return { landmarks: [] };
    });
    const { stream } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    const { container } = render(<NuiLabPage />);
    fakeVideo(container.querySelector("video") as HTMLVideoElement);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(() => expect(stat("Waktu deteksi rata-rata")).toMatch(/^\d+ ms$/), { timeout: 2000 });
    expect(stat("Deteksi efektif")).toMatch(/^\d+ \/detik$/);
    expect(stat("Sibuk (perkiraan)")).toMatch(/^\d+%$/);
  });
});

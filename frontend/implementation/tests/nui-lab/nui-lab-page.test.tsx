// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DelegateInfo } from "@/src/camera/hand-landmarker";
import { getInferenceStats, resetInferenceSchedulerForTest } from "@/src/camera/inference-scheduler";
import { resetFaceDetectorForTest } from "@/src/camera/face-anchor";
import { getLabBenchConfig, writePersistedBenchConsent } from "@/src/components/nui-lab/bench/config";
import { resetBenchManagerForTest } from "@/src/components/nui-lab/bench/manager";
import { FaceDetector } from "@mediapipe/tasks-vision";
import { MEDIAN_SKELETONS, placeHand } from "../input/realistic-hands";
import { pistolSkeleton } from "./lab-rig";

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
  type FaceBoxPx = { originX: number; originY: number; width: number; height: number };
  const faceDetector = {
    detectForVideo: vi.fn((): { detections: { boundingBox?: FaceBoxPx }[] } => ({ detections: [] })),
    close: vi.fn(),
  };
  return {
    landmarker,
    faceDetector,
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

// The face model is the second MediaPipe model; the page reaches it through FaceAnchor, which loads it once.
vi.mock("@mediapipe/tasks-vision", async (importOriginal) => ({
  ...((await importOriginal<typeof import("@mediapipe/tasks-vision")>()) as object),
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  FaceDetector: { createFromOptions: vi.fn(async () => mocks.faceDetector) },
}));

// The video element is a plain object in jsdom: no canvas work for the detector input.
vi.mock("@/src/camera/frame-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/camera/frame-source")>()),
  frameForDetection: (video: HTMLVideoElement) => video,
}));

import NuiLabLanding from "@/app/nui-lab/page";
import { NuiLabPage } from "@/src/components/nui-lab/NuiLabPage";

const R20_C4_RAW = readFileSync(resolve(process.cwd(), "public/models/r20-c4-model.json"));
const R19_C0_RAW = readFileSync(resolve(process.cwd(), "public/models/r19-pistol-model.json"));

function stubRealModelFetch(spy?: ReturnType<typeof vi.fn>) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    spy?.(url);
    const buf = url.includes("r19-pistol-model.json")
      ? R19_C0_RAW
      : url.includes("r20-c4-model.json")
        ? R20_C4_RAW
        : null;
    if (buf) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        json: async () => JSON.parse(buf.toString("utf8")),
      } as unknown as Response;
    }
    return {
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({}),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function fakeStream() {
  const track = {
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
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

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
}

/** A video whose frame only changes when the test moves the clock: one call = one new camera frame. */
function fakeVideo(video: HTMLVideoElement, width = 1280, height = 720) {
  let time = 0.1;
  Object.defineProperty(video, "readyState", { configurable: true, get: () => 4 });
  Object.defineProperty(video, "videoWidth", { configurable: true, get: () => width });
  Object.defineProperty(video, "videoHeight", { configurable: true, get: () => height });
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => time,
    set: (v: number) => {
      time = v;
    },
  });
  return { nextFrame: () => (time += 0.1) };
}

function sizedVideo(video: HTMLVideoElement, width = 1280, height = 720) {
  Object.defineProperty(video, "videoWidth", { configurable: true, get: () => width });
  Object.defineProperty(video, "videoHeight", { configurable: true, get: () => height });
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

async function startCamera(variant: "gesture" | "canvas" = "gesture") {
  const { stream } = fakeStream();
  setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
  const view = render(<NuiLabPage variant={variant} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
  });
  await waitFor(() => expect(screen.getByTestId("r19-model-status").getAttribute("data-state")).toBe("ready"));
  return view;
}

beforeEach(() => {
  mocks.createHandLandmarker.mockClear();
  mocks.landmarker.close.mockClear();
  mocks.landmarker.detectForVideo.mockReset();
  mocks.landmarker.detectForVideo.mockImplementation(() => ({ landmarks: [] }));
  mocks.delegateInfo = { ...mocks.defaultDelegate };
  mocks.faceDetector.detectForVideo.mockReset();
  mocks.faceDetector.detectForVideo.mockImplementation(() => ({ detections: [] }));
  resetFaceDetectorForTest();
  resetInferenceSchedulerForTest();
  writePersistedBenchConsent(false);
  resetBenchManagerForTest(null);
  getLabBenchConfig().resetForTest({ engineId: "r20-c4", preprocess: "a4", detector: "cpu-main-thread" });
  setDocumentHidden(false);
  stubRealModelFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  writePersistedBenchConsent(false);
  resetBenchManagerForTest(null);
  setMediaDevices(undefined);
  setDocumentHidden(false);
});

describe("NUI Lab landing page (/nui-lab)", () => {
  it("renders passive readiness, two primary CTAs (Coba Gestur & Coba Canvas), zero engineering selectors, and honest model diagnostics", () => {
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    setMediaDevices({ getUserMedia });
    render(<NuiLabLanding />);

    expect(screen.getByTestId("nui-lab-landing")).toBeTruthy();
    expect(screen.getByTestId("nui-lab-status-badge").textContent).toContain("NUI R22 · CPU · Otomatis");
    expect(screen.getByTestId("nui-lab-engine-info").textContent).toContain("R20 C4");
    expect(screen.getByTestId("nui-lab-camera-readiness").getAttribute("data-camera-api")).toBe("available");
    expect(getUserMedia).not.toHaveBeenCalled();

    const gestureLink = screen.getByRole("link", { name: /Coba Gestur/i });
    const canvasLink = screen.getByRole("link", { name: /Coba Canvas/i });
    expect(gestureLink.getAttribute("href")).toBe("/nui-lab/gesture");
    expect(canvasLink.getAttribute("href")).toBe("/nui-lab/canvas");
    expect(document.querySelector('a[href="/nui-lab/diagnostics"]')).toBeNull();
    expect(screen.queryByTestId("bench-engine-r19-c0")).toBeNull();
    expect(screen.queryByTestId("bench-engine-r20-c4")).toBeNull();
    expect(screen.queryByTestId("bench-scenario-select")).toBeNull();
    expect(screen.queryByTestId("bench-start")).toBeNull();
    expect(screen.queryByTestId("lab-experiment-toggle")).toBeNull();
    expect(screen.queryByTestId("lab-r18-toggle")).toBeNull();
    expect(screen.queryByTestId("lab-r18-metrics")).toBeNull();
  });

  it("reports unavailable camera API cleanly on landing when mediaDevices is missing", () => {
    setMediaDevices(undefined);
    render(<NuiLabLanding />);
    expect(screen.getByTestId("nui-lab-camera-readiness").getAttribute("data-camera-api")).toBe("unavailable");
  });
});

describe("NuiLabPage without a camera", () => {
  it("shows the start button disabled and a clear message when getUserMedia is missing", async () => {
    setMediaDevices(undefined);
    render(<NuiLabPage />);
    expect(screen.getByRole("heading", { name: "Gesture Detection Lab" })).toBeTruthy();
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
    expect(screen.getByText(/Belum diuji/)).toBeTruthy();
    expect(screen.getByTestId("r19-model-status").getAttribute("data-state")).toBe("unloaded");
  });

  it("starts the camera on click, loads the classifier model and the hand model", async () => {
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    setMediaDevices({ getUserMedia });
    render(<NuiLabPage />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(() => expect(mocks.createHandLandmarker).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("r19-model-status").getAttribute("data-state")).toBe("ready"));
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
    await waitFor(() => expect(screen.getByTestId("r19-model-status").getAttribute("data-state")).toBe("ready"));
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
    await waitFor(() => expect(stat("Delegate aktif")).toBe("CPU (tanpa GPU)"));
    expect(stat("Alasan mesin")).toBe("Tidak ada GPU, browser memakai renderer perangkat lunak");
    expect(stat("Status pindah mesin")).toBe("tidak ada pindah");
  });

  it("shows the switch to CPU after the GPU was measured too slow", async () => {
    mocks.delegateInfo = { ...mocks.defaultDelegate, delegate: "CPU", reason: "slow-gpu", switchState: "switched" };
    await startCamera();
    await waitFor(() => expect(stat("Delegate aktif")).toBe("CPU (GPU lambat)"));
    expect(stat("Alasan mesin")).toBe("GPU terlalu lambat, pindah ke CPU");
    expect(stat("Status pindah mesin")).toBe("sudah pindah ke CPU");
  });

  it("shows that a failed switch keeps the GPU, with the error", async () => {
    mocks.delegateInfo = { ...mocks.defaultDelegate, switchState: "failed", switchError: "boom" };
    await startCamera();
    await waitFor(() => expect(stat("Status pindah mesin")).toBe("gagal pindah ke CPU, tetap pakai GPU (boom)"));
    expect(stat("Delegate aktif")).toBe("GPU");
  });
});

describe("NuiLabPage detection runs through the shared gate", () => {
  it("skips a frame that arrives inside the gap after a slow detection, then detects again", async () => {
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

  it("shows the measured busy share of the main thread from the gate", async () => {
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
    expect(stat("Sibuk (diukur)")).toMatch(/^\d+%$/);
  });

  it("shows the hand and the face detector separately, each with its own rate and average time", async () => {
    mocks.faceDetector.detectForVideo.mockImplementation(() => ({
      detections: [{ boundingBox: { originX: 256, originY: 96, width: 128, height: 120 } }],
    }));
    const { stream } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    const { container } = render(<NuiLabPage />);
    const video = container.querySelector("video") as HTMLVideoElement;
    const clock = fakeVideo(video);
    sizedVideo(video, 640, 480);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(
      () => {
        clock.nextFrame();
        expect(stat("Wajah (deteksi)")).toMatch(/^\d+ \/detik · rata-rata \d+ ms$/);
      },
      { timeout: 4000, interval: 25 },
    );
    expect(stat("Tangan (deteksi)")).toMatch(/^\d+ \/detik · rata-rata \d+ ms$/);
  });

  it("says the face model failed to load, so a missing face is not blamed on the student", async () => {
    vi.mocked(FaceDetector.createFromOptions).mockRejectedValueOnce(new Error("404"));
    const { stream } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    const { container } = render(<NuiLabPage />);
    const video = container.querySelector("video") as HTMLVideoElement;
    const clock = fakeVideo(video);
    sizedVideo(video, 640, 480);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(
      () => {
        clock.nextFrame();
        expect(stat("Wajah pemain")).toBe("Model wajah gagal dimuat");
      },
      { timeout: 4000, interval: 25 },
    );
  });
});

describe("NuiLabPage face and wave rule", () => {
  it("shows the player's face and the numbers that decide the hand, once a face is in view", async () => {
    mocks.faceDetector.detectForVideo.mockImplementation(() => ({
      detections: [{ boundingBox: { originX: 256, originY: 96, width: 128, height: 120 } }],
    }));
    const { stream } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    const { container } = render(<NuiLabPage />);
    const video = container.querySelector("video") as HTMLVideoElement;
    const clock = fakeVideo(video);
    sizedVideo(video, 640, 480);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });

    await waitFor(
      () => {
        clock.nextFrame();
        expect(stat("Wajah pemain")).toBe("ada, 20%");
      },
      { timeout: 4000, interval: 25 },
    );
    expect(stat("Tangan ditolak")).toBe("jauh 0 · wajah 0 · luar 0");
    expect(screen.getByText(/Pembalikan: 0 dari 2/)).toBeTruthy();
  });

  it("says the face is not seen when the face model finds none", async () => {
    const { stream } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    const { container } = render(<NuiLabPage />);
    const video = container.querySelector("video") as HTMLVideoElement;
    const clock = fakeVideo(video);
    sizedVideo(video, 640, 480);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(
      () => {
        clock.nextFrame();
        expect(stat("Wajah pemain")).toBe("Wajah tidak terlihat");
      },
      { timeout: 4000, interval: 25 },
    );
  });
});

describe("NUI Lab R22 isolated workspaces (Gesture & Canvas)", () => {
  it("gesture route (and default variant) displays clean Owner UI, sticky left camera + right scroll panels, zero selectors/manual relock, and zero auto-camera", () => {
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    setMediaDevices({ getUserMedia });
    const { container } = render(<NuiLabPage />);

    expect(screen.getByTestId("nui-lab-gesture")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Gesture Detection Lab" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Coba Canvas" }).getAttribute("href")).toBe("/nui-lab/canvas");
    expect(document.querySelector('a[href="/nui-lab/diagnostics"]')).toBeNull();
    expect(container.querySelectorAll("video")).toHaveLength(1);
    expect(screen.getByTestId("nui-lab-camera-panel")).toBeTruthy();
    expect(screen.getByTestId("nui-lab-right-panel")).toBeTruthy();
    expect(screen.getByTestId("frame-sync-badge")).toBeTruthy();
    expect(screen.getByTestId("gesture-finger-count")).toBeTruthy();
    expect(screen.getByTestId("low-glare-toggle")).toBeTruthy();

    expect(screen.queryByTestId("lab-relock-hand")).toBeNull();
    expect(screen.queryByTestId("bench-bar-engine")).toBeNull();
    expect(screen.queryByTestId("bench-bar-preprocess")).toBeNull();
    expect(screen.queryByTestId("bench-bar-detector")).toBeNull();
    expect(screen.queryByTestId("bench-bar-scenario")).toBeNull();
    expect(screen.queryByTestId("bench-bar-truth")).toBeNull();
    expect(screen.queryByTestId("lab-recorder-truth")).toBeNull();
    expect(screen.queryByTestId("lab-experiment-toggle")).toBeNull();
    expect(screen.queryByTestId("lab-r18-toggle")).toBeNull();
    expect(screen.queryByTestId("lab-r18-metrics")).toBeNull();

    expect(screen.getByTestId("r19-engine-badge").textContent).toContain("NUI R22 · CPU · Otomatis");
    expect(screen.getByTestId("nui-lab-honest-model-info").textContent).toContain("r20-c4");
    expect(screen.getByTestId("r19-model-status").getAttribute("data-state")).toBe("unloaded");
    expect(screen.getByTestId("r19-state-badge")).toBeTruthy();
    expect(screen.getByTestId("r19-probs").textContent).toMatch(
      /Probabilitas Softmax Terkalibrasi MLP \(bukan confidence MediaPipe\)/i,
    );
    expect(screen.getByTestId("r19-direction")).toBeTruthy();
    expect(screen.getByTestId("r19-fingers")).toBeTruthy();
    expect(screen.getByTestId("r19-vkey-panel")).toBeTruthy();
    expect(screen.getByTestId("r19-vkey-event")).toBeTruthy();
    expect(screen.getByTestId("r19-vkey-left").getAttribute("data-active")).toBe("false");
    expect(screen.getByTestId("r19-vkey-jump").getAttribute("data-active")).toBe("false");
    expect(screen.getByTestId("r19-vkey-right").getAttribute("data-active")).toBe("false");
    expect(screen.getByTestId("r19-vkey-diagonal")).toBeTruthy();
    expect(screen.getByTestId("r19-vkey-scope-note")).toBeTruthy();
    expect(screen.getByTestId("r19-guards-panel")).toBeTruthy();

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Kanvas gambar NUI")).toBeNull();
    expect(document.querySelectorAll(".nui-lab__pose")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Mulai uji lambaian" })).toBeTruthy();
  });

  it("canvas route exposes drawable canvas, R22 fist-to-1/2 Undo/Redo instructions (no swipe), pointer fallback tools, and zero engineering selectors", () => {
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    setMediaDevices({ getUserMedia });
    const { container } = render(<NuiLabPage variant="canvas" />);
    expect(screen.getByTestId("nui-lab-canvas")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Canvas NUI Lab" })).toBeTruthy();
    expect(container.querySelectorAll("video")).toHaveLength(1);
    expect(screen.getByTestId("nui-lab-camera-panel")).toBeTruthy();
    expect(screen.getByTestId("nui-lab-right-panel")).toBeTruthy();
    expect(screen.getByTestId("canvas-undo-redo-fsm")).toBeTruthy();
    expect(screen.queryByText(/Swipe Undo/i)).toBeNull();
    expect(screen.queryByText(/Swipe Redo/i)).toBeNull();
    expect(screen.queryByTestId("bench-bar-engine")).toBeNull();
    expect(screen.queryByTestId("bench-bar-truth")).toBeNull();
    expect(screen.getByTestId("r19-engine-badge").textContent).toContain("NUI R22 · CPU · Otomatis");

    const canvas = screen.getByLabelText("Kanvas gambar NUI") as HTMLCanvasElement;
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
    expect(screen.getByTestId("lab-gesture-hud")).toBeTruthy();
    expect(screen.getByTestId("lab-lock-status")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pena pointer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Penghapus pointer" })).toBeTruthy();
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 25, clientY: 25 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 80, clientY: 80 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    fireEvent.click(screen.getByRole("button", { name: "Bersihkan kanvas" }));
    expect(getUserMedia).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("low-glare-toggle"));
    expect(screen.getByTestId("nui-lab-canvas").getAttribute("data-low-glare")).toBe("true");
  });
});

describe("NUI Lab Virtual Keyboard live activation & safety release", () => {
  it("lights up virtual keys on POINT_PRESS and clears on POINT_READY, NO_HAND, visibility hidden, and camera stop", async () => {
    const pressRight = pistolSkeleton(0, true, { aspect: 16 / 9 });
    const readyRight = pistolSkeleton(0, false, { aspect: 16 / 9 });
    let currentLm: ReturnType<typeof pistolSkeleton>[] = [pressRight];
    mocks.landmarker.detectForVideo.mockImplementation(() => ({ landmarks: currentLm as never[] }));

    const { stream } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    const { container } = render(<NuiLabPage variant="gesture" />);
    const video = container.querySelector("video") as HTMLVideoElement;
    const clock = fakeVideo(video);
    sizedVideo(video, 1280, 720);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(() => expect(screen.getByTestId("r19-model-status").getAttribute("data-state")).toBe("ready"));

    await waitFor(
      () => {
        clock.nextFrame();
        expect(screen.getByTestId("r19-vkey-right").getAttribute("data-active")).toBe("true");
      },
      { timeout: 4000, interval: 25 },
    );
    expect(screen.getByTestId("r19-state-badge").getAttribute("data-r19-state")).toBe("POINT_PRESS");
    expect(screen.getByTestId("r19-vkey-left").getAttribute("data-active")).toBe("false");
    expect(screen.getByTestId("r19-vkey-jump").getAttribute("data-active")).toBe("false");
    expect(screen.getByTestId("r19-direction").textContent).toContain("RIGHT");

    // 1. Thumb fold (POINT_READY) clears virtual keys immediately
    currentLm = [readyRight];
    await waitFor(
      () => {
        clock.nextFrame();
        expect(screen.getByTestId("r19-vkey-right").getAttribute("data-active")).toBe("false");
        expect(screen.getByTestId("r19-state-badge").getAttribute("data-r19-state")).toBe("POINT_READY");
      },
      { timeout: 4000, interval: 25 },
    );

    // 2. Re-engage POINT_PRESS, then lose hand (NO_HAND) -> virtual keys drop immediately
    currentLm = [pressRight];
    await waitFor(
      () => {
        clock.nextFrame();
        expect(screen.getByTestId("r19-vkey-right").getAttribute("data-active")).toBe("true");
      },
      { timeout: 4000, interval: 25 },
    );
    currentLm = [];
    await waitFor(
      () => {
        clock.nextFrame();
        expect(screen.getByTestId("r19-vkey-right").getAttribute("data-active")).toBe("false");
        expect(screen.getByTestId("r19-state-badge").getAttribute("data-r19-state")).toBe("NO_HAND");
      },
      { timeout: 4000, interval: 25 },
    );

    // 3. Re-engage POINT_PRESS, then browser tab hides -> visibilitychange calls releaseAll("browser-hidden")
    currentLm = [pressRight];
    await waitFor(
      () => {
        clock.nextFrame();
        expect(screen.getByTestId("r19-vkey-right").getAttribute("data-active")).toBe("true");
      },
      { timeout: 4000, interval: 25 },
    );
    setDocumentHidden(true);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByTestId("r19-vkey-right").getAttribute("data-active")).toBe("false");
    expect(screen.getByTestId("r19-vkey-event").textContent).toContain("RELEASE_ALL");
    expect(screen.getByTestId("r19-vkey-event").textContent).toContain("browser-hidden");

    // 4. Restore visibility, re-engage POINT_PRESS, then stop camera -> clears virtual keys
    setDocumentHidden(false);
    await waitFor(
      () => {
        clock.nextFrame();
        expect(screen.getByTestId("r19-vkey-right").getAttribute("data-active")).toBe("true");
      },
      { timeout: 4000, interval: 25 },
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Matikan kamera" }));
    });
    expect(screen.getByTestId("r19-vkey-right").getAttribute("data-active")).toBe("false");
    expect(screen.getByTestId("r19-vkey-left").getAttribute("data-active")).toBe("false");
    expect(screen.getByTestId("r19-vkey-jump").getAttribute("data-active")).toBe("false");
  });
});

describe("NUI Lab fail-closed model loading & retry", () => {
  it("shows r19-model-error alert on HTTP 404, keeps actions blocked with zero silent fallback, and recovers on retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({}),
      })),
    );
    const pressRight = pistolSkeleton(0, true, { aspect: 16 / 9 });
    mocks.landmarker.detectForVideo.mockImplementation(() => ({ landmarks: [pressRight] as never[] }));

    const { stream } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    const { container } = render(<NuiLabPage variant="gesture" />);
    const video = container.querySelector("video") as HTMLVideoElement;
    const clock = fakeVideo(video);
    sizedVideo(video, 1280, 720);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });

    await waitFor(() => expect(screen.getByTestId("r19-model-status").getAttribute("data-state")).toBe("error"));
    const alert = screen.getByTestId("r19-model-error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toMatch(/404/);
    const retryBtn = screen.getByTestId("r19-retry-model");
    expect(retryBtn).toBeTruthy();

    for (let i = 0; i < 6; i++) {
      clock.nextFrame();
    }
    await waitFor(() => expect(mocks.landmarker.detectForVideo).toHaveBeenCalled(), { timeout: 2000 });
    expect(screen.getByTestId("r19-vkey-left").getAttribute("data-active")).toBe("false");
    expect(screen.getByTestId("r19-vkey-jump").getAttribute("data-active")).toBe("false");
    expect(screen.getByTestId("r19-vkey-right").getAttribute("data-active")).toBe("false");
    expect(screen.getByTestId("r19-state-badge").getAttribute("data-r19-state")).toBe("NO_HAND");

    stubRealModelFetch();
    await act(async () => {
      fireEvent.click(retryBtn);
    });
    await waitFor(() => expect(screen.getByTestId("r19-model-status").getAttribute("data-state")).toBe("ready"));
    expect(screen.queryByTestId("r19-model-error")).toBeNull();
  });

  it("shows r19-model-error alert when model endpoint returns corrupt JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      })),
    );
    const { stream } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    render(<NuiLabPage variant="gesture" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(() => expect(screen.getByTestId("r19-model-status").getAttribute("data-state")).toBe("error"));
    expect(screen.getByTestId("r19-model-error").textContent).toMatch(/Gagal membaca JSON model/);
    expect(screen.getByTestId("r19-retry-model")).toBeTruthy();
  });
});

describe("NUI Lab developer diagnostics & 0-5 finger readout (gesture route)", () => {
  const ids = [
    "aspect", "pose-raw", "fingers", "thumb-legacy", "thumb-lateral", "thumb-ip", "five-valid", "armed", "hand-status",
    "pipeline", "erase-hit", "strokes", "command-mode", "last-command", "command-count",
  ];
  const cell = (id: string) => screen.getByTestId(`lab-diag-${id}`).querySelector("dd")?.textContent ?? "";

  it("lists every row with a dash before any hand is seen, and says diagnostics stay isolated from gameplay", () => {
    setMediaDevices({ getUserMedia: vi.fn(async () => fakeStream().stream) });
    render(<NuiLabPage variant="gesture" />);
    for (const id of ids) expect(screen.getByTestId(`lab-diag-${id}`)).toBeTruthy();
    expect(cell("aspect")).toBe("—");
    expect(cell("fingers")).toBe("—");
    expect(cell("hand-status")).toBe("—");
    expect(screen.getByTestId("lab-diag").textContent).toMatch(/tidak mengubah gameplay siswa produksi/);
  });

  it("passes the real video aspect to the analyzer and displays 4 fingers clearly in both gesture readout and diagnostics", async () => {
    const four = placeHand(MEDIAN_SKELETONS.four, { aspect: 4 / 3, cx: 0.5, cy: 0.7 });
    mocks.landmarker.detectForVideo.mockImplementation(() => ({ landmarks: [four] as never[] }));
    const { stream } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    const { container } = render(<NuiLabPage variant="gesture" />);
    const video = container.querySelector("video") as HTMLVideoElement;
    const clock = fakeVideo(video);
    sizedVideo(video, 640, 480);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(
      () => {
        clock.nextFrame();
        expect(cell("aspect")).toBe("1.333");
      },
      { timeout: 4000, interval: 25 },
    );
    await waitFor(
      () => {
        clock.nextFrame();
        expect(cell("fingers")).toBe("4 / 5");
      },
      { timeout: 4000, interval: 25 },
    );
    expect(screen.getByTestId("gesture-finger-count").textContent).toContain("4 / 5 jari");
    expect(cell("thumb-legacy")).toMatch(/→ terbuka$/);
    expect(cell("thumb-lateral")).toMatch(/→ tertutup$/);
    expect(cell("five-valid")).toBe("tidak");
    expect(cell("command-mode")).toBe("Kepal → 1/2 jari (R22)");
  });

  it("shows human-friendly Indonesian error alert on camera permission denied (U10)", async () => {
    const err = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    setMediaDevices({ getUserMedia: vi.fn(async () => { throw err; }) });
    render(<NuiLabPage variant="canvas" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(() => expect(screen.getByTestId("camera-error-status").getAttribute("role")).toBe("alert"));
    expect(screen.getByTestId("camera-error-status").textContent).toMatch(/Izin kamera ditolak/i);
  });
});

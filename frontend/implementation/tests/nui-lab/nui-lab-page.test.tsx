// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DelegateInfo } from "@/src/camera/hand-landmarker";
import { getInferenceStats, resetInferenceSchedulerForTest } from "@/src/camera/inference-scheduler";
import { resetFaceDetectorForTest } from "@/src/camera/face-anchor";
import { FaceDetector } from "@mediapipe/tasks-vision";
import { MEDIAN_SKELETONS, placeHand } from "../input/realistic-hands";
import { loadRealR19Model, pistolSkeleton } from "./lab-rig";

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
  ...(await importOriginal<typeof import("@/src/camera/hand-landmarker")>()),
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

const REAL_R19_MODEL = loadRealR19Model();

function stubRealModelFetch(spy?: ReturnType<typeof vi.fn>) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    spy?.(url);
    if (url.includes("r19-pistol-model.json")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => REAL_R19_MODEL,
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
  setDocumentHidden(false);
  stubRealModelFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setMediaDevices(undefined);
  setDocumentHidden(false);
});

describe("NUI Lab landing page (/nui-lab)", () => {
  it("renders passive readiness and links to /nui-lab/gesture and /nui-lab/canvas without calling getUserMedia or linking legacy diagnostics", () => {
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    setMediaDevices({ getUserMedia });
    render(<NuiLabLanding />);

    expect(screen.getByTestId("nui-lab-landing")).toBeTruthy();
    expect(screen.getByTestId("nui-lab-engine-info").textContent).toContain("R19 G4 Hybrid");
    expect(screen.getByTestId("nui-lab-camera-readiness").getAttribute("data-camera-api")).toBe("available");
    expect(getUserMedia).not.toHaveBeenCalled();

    const gestureLink = screen.getByRole("link", { name: /Gesture Detection Lab/i });
    const canvasLink = screen.getByRole("link", { name: /Canvas Lab/i });
    expect(gestureLink.getAttribute("href")).toBe("/nui-lab/gesture");
    expect(canvasLink.getAttribute("href")).toBe("/nui-lab/canvas");
    expect(document.querySelector('a[href="/nui-lab/diagnostics"]')).toBeNull();
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
    // With the camera off the wave test still tells the owner what to do.
    expect(screen.getByText(/Belum diuji/)).toBeTruthy();
    expect(screen.getByTestId("r19-model-status").getAttribute("data-state")).toBe("unloaded");
  });

  it("starts the camera on click, loads the R19 model and the hand model", async () => {
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
    // Face box 128 x 120 px at (256, 96): 0.2 of the frame wide, centred on x = 0.5.
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
        expect(stat("Wajah pemain")).toBe("ada, 20% lebar frame");
      },
      { timeout: 4000, interval: 25 },
    );
    expect(stat("Tangan ditolak")).toBe("jauh 0 · wajah 0 · di luar area 0");
    expect(stat("Pembalikan lambaian")).toBe("0 dari 2");
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

describe("NUI Lab R19 G4 Hybrid isolated workspaces (Gesture & Canvas)", () => {
  it("gesture route (and default variant) displays R19 G4 Hybrid UI with zero R17/R18 toggles and zero auto-camera request", () => {
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    setMediaDevices({ getUserMedia });
    render(<NuiLabPage />);

    expect(screen.getByTestId("nui-lab-gesture")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Gesture Detection Lab" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Canvas Lab" }).getAttribute("href")).toBe("/nui-lab/canvas");
    expect(document.querySelector('a[href="/nui-lab/diagnostics"]')).toBeNull();
    expect(screen.queryByTestId("lab-experiment-toggle")).toBeNull();
    expect(screen.queryByTestId("lab-r18-toggle")).toBeNull();
    expect(screen.queryByTestId("lab-r18-metrics")).toBeNull();
    expect(screen.queryByText(/Mode diagnostik lama/i)).toBeNull();

    expect(screen.getByTestId("r19-engine-badge").textContent).toContain("R19 G4 Hybrid");
    expect(screen.getByTestId("r19-model-status").getAttribute("data-state")).toBe("unloaded");
    expect(screen.getByTestId("r19-state-badge")).toBeTruthy();
    expect(screen.getByTestId("r19-probs").textContent).toMatch(
      /Probabilitas Softmax Terkalibrasi MLP R19 \(bukan confidence MediaPipe\)/i,
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
    expect(screen.getAllByTestId("lab-relock-hand")).toHaveLength(1);
    expect(document.querySelectorAll(".nui-lab__pose")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Mulai uji lambaian" })).toBeTruthy();
  });

  it("canvas route exposes drawable canvas, pointer fallback tools, read-only R19 panel, and zero R17/R18 toggles", () => {
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    setMediaDevices({ getUserMedia });
    render(<NuiLabPage variant="canvas" />);
    expect(screen.getByTestId("nui-lab-canvas")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Canvas NUI Lab" })).toBeTruthy();
    expect(screen.queryByTestId("lab-experiment-toggle")).toBeNull();
    expect(screen.queryByTestId("lab-r18-toggle")).toBeNull();
    expect(screen.queryByTestId("lab-r18-metrics")).toBeNull();
    expect(screen.getByTestId("r19-engine-badge")).toBeTruthy();

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

    // Feed frames while model is in error state -> zero fallback, all virtual keys remain inactive
    for (let i = 0; i < 6; i++) {
      clock.nextFrame();
    }
    await waitFor(() => expect(mocks.landmarker.detectForVideo).toHaveBeenCalled(), { timeout: 2000 });
    expect(screen.getByTestId("r19-vkey-left").getAttribute("data-active")).toBe("false");
    expect(screen.getByTestId("r19-vkey-jump").getAttribute("data-active")).toBe("false");
    expect(screen.getByTestId("r19-vkey-right").getAttribute("data-active")).toBe("false");
    expect(screen.getByTestId("r19-state-badge").getAttribute("data-r19-state")).toBe("NO_HAND");

    // Retry with working model -> recovers to ready and removes alert
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
    expect(screen.getByTestId("r19-model-error").textContent).toMatch(/Gagal membaca JSON model R19/);
    expect(screen.getByTestId("r19-retry-model")).toBeTruthy();
  });
});

describe("NUI Lab developer diagnostics (gesture route)", () => {
  const ids = [
    "aspect", "pose-raw", "fingers", "thumb-legacy", "thumb-lateral", "thumb-ip", "five-valid", "armed", "hand-status",
    "pipeline", "erase-hit", "strokes", "command-mode", "last-command", "command-count",
    "swipe-phase", "swipe-travel", "swipe-speed", "swipe-cancel",
  ];
  const cell = (id: string) => screen.getByTestId(`lab-diag-${id}`).querySelector("dd")?.textContent ?? "";

  it("lists every row with a dash before any hand is seen, and says the diagnostics are test-only", () => {
    setMediaDevices({ getUserMedia: vi.fn(async () => fakeStream().stream) });
    render(<NuiLabPage variant="gesture" />);
    for (const id of ids) expect(screen.getByTestId(`lab-diag-${id}`)).toBeTruthy();
    expect(cell("aspect")).toBe("—");
    expect(cell("fingers")).toBe("—");
    expect(cell("hand-status")).toBe("—");
    expect(screen.getByTestId("lab-diag").textContent).toMatch(/kandidat uji, bukan keputusan gameplay siswa produksi/);
  });

  it("passes the real video aspect to the analyzer and shows the new count next to the legacy one for the same frame", async () => {
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
    expect(cell("thumb-legacy")).toMatch(/→ terbuka$/);
    expect(cell("thumb-lateral")).toMatch(/→ tertutup$/);
    expect(cell("five-valid")).toBe("tidak");
    expect(cell("command-mode")).toBe("geser (uji)");
  });
});

describe("NUI Lab local landmark recorder (RD-02 + R19 truth labels)", () => {
  const start = () => screen.getByTestId("lab-recorder-start") as HTMLButtonElement;

  it("starts locked on gesture route: no consent, no camera, no recording", () => {
    setMediaDevices({ getUserMedia: vi.fn(async () => fakeStream().stream) });
    render(<NuiLabPage variant="gesture" />);
    expect(start().disabled).toBe(true);
    expect(screen.getByTestId("lab-recorder-status").textContent).toMatch(/^Tidak merekam · 0 frame/);
    fireEvent.click(screen.getByTestId("lab-recorder-consent"));
    expect(start().disabled).toBe(true); // consent alone is not enough: the camera is off
    expect((screen.getByTestId("lab-recorder-download") as HTMLButtonElement).disabled).toBe(true);

    const options = Array.from((screen.getByTestId("lab-recorder-truth") as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(expect.arrayContaining(["POINT_PRESS", "DORSAL_RIGHT_LEFT", "FIVE"]));
  });

  it("records R19 truth labels (POINT_PRESS, DORSAL_RIGHT_LEFT, FIVE) after consent + start, downloads a valid file without extra network calls, and discards cleanly", async () => {
    const pressRight = pistolSkeleton(0, true, { aspect: 16 / 9 });
    const dorsalLeft = pistolSkeleton(180, true, { aspect: 16 / 9, dorsal: true, mirror: true });
    let currentLm = pressRight;
    mocks.landmarker.detectForVideo.mockImplementation(() => ({ landmarks: [currentLm] as never[] }));

    const { stream } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    const blobs: Blob[] = [];
    const create = vi.fn((b: Blob) => { blobs.push(b); return "blob:test"; });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const readBlob = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(b); });
    const fetchSpy = vi.fn();
    stubRealModelFetch(fetchSpy);

    const { container } = render(<NuiLabPage variant="gesture" />);
    const video = container.querySelector("video") as HTMLVideoElement;
    const clock = fakeVideo(video);
    sizedVideo(video, 1280, 720);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(() => expect(screen.getByTestId("r19-model-status").getAttribute("data-state")).toBe("ready"));
    fetchSpy.mockClear();

    await waitFor(() => expect(start().disabled).toBe(true), { timeout: 2000 }); // consent still missing
    fireEvent.click(screen.getByTestId("lab-recorder-consent"));
    await waitFor(() => expect(start().disabled).toBe(false), { timeout: 4000 });

    const recordedCount = () => {
      const m = (screen.getByTestId("lab-recorder-status").textContent ?? "").match(/(\d+)\s+frame/);
      return m ? Number(m[1]) : 0;
    };

    fireEvent.change(screen.getByTestId("lab-recorder-truth"), { target: { value: "POINT_PRESS" } });
    fireEvent.click(start());
    await waitFor(
      () => {
        clock.nextFrame();
        expect(recordedCount()).toBeGreaterThanOrEqual(2);
      },
      { timeout: 4000, interval: 25 },
    );

    const afterPress = recordedCount();
    currentLm = dorsalLeft;
    fireEvent.change(screen.getByTestId("lab-recorder-truth"), { target: { value: "DORSAL_RIGHT_LEFT" } });
    await waitFor(
      () => {
        clock.nextFrame();
        expect(recordedCount()).toBeGreaterThanOrEqual(afterPress + 2);
      },
      { timeout: 4000, interval: 25 },
    );

    const afterDorsal = recordedCount();
    currentLm = placeHand(MEDIAN_SKELETONS.palm, { aspect: 16 / 9, cx: 0.5, cy: 0.7 });
    fireEvent.change(screen.getByTestId("lab-recorder-truth"), { target: { value: "FIVE" } });
    await waitFor(
      () => {
        clock.nextFrame();
        expect(recordedCount()).toBeGreaterThanOrEqual(afterDorsal + 2);
      },
      { timeout: 4000, interval: 25 },
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("lab-recorder-stop"));
    });
    const status = screen.getByTestId("lab-recorder-status").textContent ?? "";
    expect(status).toMatch(/^Tidak merekam · [1-9]/);
    fireEvent.click(screen.getByTestId("lab-recorder-download"));
    expect(create).toHaveBeenCalledTimes(1);
    const file = JSON.parse(await readBlob(blobs[0]!));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(file.schema).toBe("nui-landmark-record/1");
    expect(file.mode).toBe("r19-g4-hybrid");
    expect(file.consent).toBe(true);
    expect(file.frames.length).toBeGreaterThanOrEqual(6);
    const recordedLabels = new Set(file.frames.map((f: { truth: string }) => f.truth));
    expect(recordedLabels.has("POINT_PRESS")).toBe(true);
    expect(recordedLabels.has("DORSAL_RIGHT_LEFT")).toBe(true);
    expect(recordedLabels.has("FIVE")).toBe(true);
    expect(file.frames[0].lm).toHaveLength(21);
    expect("r19State" in file.frames[0]).toBe(true);
    expect("vkeyEvent" in file.frames[0]).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("lab-recorder-discard"));
    expect(screen.getByTestId("lab-recorder-status").textContent).toMatch(/· 0 frame/);
  });
});

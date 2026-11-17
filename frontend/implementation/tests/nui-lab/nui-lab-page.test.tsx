// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DelegateInfo } from "@/src/camera/hand-landmarker";
import { getInferenceStats, resetInferenceSchedulerForTest } from "@/src/camera/inference-scheduler";
import { resetFaceDetectorForTest } from "@/src/camera/face-anchor";
import { FaceDetector } from "@mediapipe/tasks-vision";
import { MEDIAN_SKELETONS, placeHand } from "../input/realistic-hands";

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
  ...(await importOriginal<typeof import("@mediapipe/tasks-vision")>()),
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  FaceDetector: { createFromOptions: vi.fn(async () => mocks.faceDetector) },
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
  mocks.faceDetector.detectForVideo.mockReset();
  mocks.faceDetector.detectForVideo.mockImplementation(() => ({ detections: [] }));
  resetFaceDetectorForTest();
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
    Object.defineProperty(video, "videoWidth", { configurable: true, get: () => 640 });
    Object.defineProperty(video, "videoHeight", { configurable: true, get: () => 480 });
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
    Object.defineProperty(video, "videoWidth", { configurable: true, get: () => 640 });
    Object.defineProperty(video, "videoHeight", { configurable: true, get: () => 480 });
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
  /** Video of 640 x 480 px, so the face box (in px) maps to 0..1 of the frame as in the game. */
  function sizedVideo(video: HTMLVideoElement) {
    Object.defineProperty(video, "videoWidth", { configurable: true, get: () => 640 });
    Object.defineProperty(video, "videoHeight", { configurable: true, get: () => 480 });
  }

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
    sizedVideo(video);
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
    sizedVideo(video);
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


describe("NUI Lab isolated workspaces", () => {
  it("gesture route shows every shared pose and does not request a camera on render", () => {
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    setMediaDevices({ getUserMedia });
    render(<NuiLabPage variant="gesture" />);
    expect(screen.getByRole("heading", { name: "Gesture Detection Lab" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Canvas Lab" }).getAttribute("href")).toBe("/nui-lab/canvas");
    for (const pose of ["Jempol", "Cubit", "Telapak"]) {
      // Real labels come from poseLabel; the cards exist even before a hand is present.
      expect(screen.getAllByText(new RegExp(pose, "i")).length).toBeGreaterThan(0);
    }
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Kanvas gambar NUI")).toBeNull();
    expect(screen.getAllByTestId("lab-relock-hand")).toHaveLength(1);
    expect(document.querySelectorAll(".nui-lab__pose")).toHaveLength(7);
  });

  it("canvas route exposes a drawable canvas, tools, and the same camera gate", () => {
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    setMediaDevices({ getUserMedia });
    render(<NuiLabPage variant="canvas" />);
    expect(screen.getByRole("heading", { name: "Canvas NUI Lab" })).toBeTruthy();
    const canvas = screen.getByLabelText("Kanvas gambar NUI") as HTMLCanvasElement;
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
    expect(screen.getByTestId("lab-gesture-hud")).toBeTruthy();
    expect(screen.getByTestId("lab-lock-status")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pena pointer" })).toBeTruthy();
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 25, clientY: 25 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 80, clientY: 80 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    fireEvent.click(screen.getByRole("button", { name: "Bersihkan kanvas" }));
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("preserves the legacy diagnostics screen used by existing owner tests", () => {
    render(<NuiLabPage />);
    expect(screen.getByRole("heading", { name: "Uji Tangan NUI" })).toBeTruthy();
    expect(screen.getByLabelText("Kanvas coret uji")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mulai uji lambaian" })).toBeTruthy();
  });
});

describe("NUI Lab R17 developer diagnostics (gesture route)", () => {
  const ids = [
    "aspect", "pose-raw", "fingers", "thumb-legacy", "thumb-lateral", "thumb-ip", "five-valid", "armed", "hand-status",
    "pipeline", "erase-hit", "strokes", "command-mode", "last-command", "command-count",
    "swipe-phase", "swipe-travel", "swipe-speed", "swipe-cancel",
  ];
  const cell = (id: string) => screen.getByTestId(`lab-diag-${id}`).querySelector("dd")?.textContent ?? "";

  it("lists every row with a dash before any hand is seen, and says the swipe mapping is only a candidate", () => {
    setMediaDevices({ getUserMedia: vi.fn(async () => fakeStream().stream) });
    render(<NuiLabPage variant="gesture" />);
    for (const id of ids) expect(screen.getByTestId(`lab-diag-${id}`)).toBeTruthy();
    expect(cell("aspect")).toBe("—");
    expect(cell("fingers")).toBe("—");
    expect(cell("hand-status")).toBe("—");
    expect(screen.getByTestId("lab-diag").textContent).toMatch(/kandidat uji, bukan keputusan produk/);
  });

  it("is not part of the legacy diagnostics screen", () => {
    render(<NuiLabPage />);
    expect(screen.queryByTestId("lab-diag")).toBeNull();
  });

  it("passes the real video aspect to the analyzer and shows the new count next to the legacy one for the same frame", async () => {
    // A 4:3 stream (not the analyzer's 16:9 default), so the aspect row only reads 1.333 if the page passed it on.
    // A four-finger hand with the thumb tucked: the legacy thumb rule counts five, the lab rule counts four.
    const four = placeHand(MEDIAN_SKELETONS.four, { aspect: 4 / 3, cx: 0.5, cy: 0.7 });
    mocks.landmarker.detectForVideo.mockImplementation(() => ({ landmarks: [four] as never[] }));
    const { stream } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    const { container } = render(<NuiLabPage variant="gesture" />);
    const video = container.querySelector("video") as HTMLVideoElement;
    const clock = fakeVideo(video);
    Object.defineProperty(video, "videoWidth", { configurable: true, get: () => 640 });
    Object.defineProperty(video, "videoHeight", { configurable: true, get: () => 480 });
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

describe("NUI Lab local landmark recorder (RD-02)", () => {
  const start = () => screen.getByTestId("lab-recorder-start") as HTMLButtonElement;

  it("is absent from the legacy diagnostics screen and starts locked: no consent, no camera, no recording", () => {
    render(<NuiLabPage />);
    expect(screen.queryByTestId("lab-recorder")).toBeNull();
    cleanup();
    setMediaDevices({ getUserMedia: vi.fn(async () => fakeStream().stream) });
    render(<NuiLabPage variant="gesture" />);
    expect(start().disabled).toBe(true);
    expect(screen.getByTestId("lab-recorder-status").textContent).toMatch(/^Tidak merekam · 0 frame/);
    fireEvent.click(screen.getByTestId("lab-recorder-consent"));
    expect(start().disabled).toBe(true); // consent alone is not enough: the camera is off
    expect((screen.getByTestId("lab-recorder-download") as HTMLButtonElement).disabled).toBe(true);
  });

  it("records numbers only after consent + start, downloads a valid file by hand, and stops when the camera stops", async () => {
    const hand = placeHand(MEDIAN_SKELETONS.palm, { aspect: 16 / 9, cx: 0.5, cy: 0.7 });
    mocks.landmarker.detectForVideo.mockImplementation(() => ({ landmarks: [hand] as never[] }));
    const { stream } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    const blobs: Blob[] = [];
    const create = vi.fn((b: Blob) => { blobs.push(b); return "blob:test"; });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const readBlob = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(b); });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { container } = render(<NuiLabPage variant="gesture" />);
    const video = container.querySelector("video") as HTMLVideoElement;
    const clock = fakeVideo(video);
    Object.defineProperty(video, "videoWidth", { configurable: true, get: () => 1280 });
    Object.defineProperty(video, "videoHeight", { configurable: true, get: () => 720 });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(() => expect(start().disabled).toBe(true), { timeout: 2000 }); // consent still missing
    fireEvent.click(screen.getByTestId("lab-recorder-consent"));
    await waitFor(() => expect(start().disabled).toBe(false), { timeout: 4000 });
    fireEvent.change(screen.getByTestId("lab-recorder-truth"), { target: { value: "FIVE" } });
    fireEvent.click(start());

    await waitFor(
      () => {
        clock.nextFrame();
        expect(screen.getByTestId("lab-recorder-status").textContent).toMatch(/^Merekam · [1-9]/);
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
    expect(file.consent).toBe(true);
    expect(file.frames.length).toBeGreaterThan(0);
    expect(file.frames.every((f: { truth: string }) => f.truth === "FIVE")).toBe(true);
    expect(file.frames[0].lm).toHaveLength(21);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();

    fireEvent.click(screen.getByTestId("lab-recorder-discard"));
    expect(screen.getByTestId("lab-recorder-status").textContent).toMatch(/· 0 frame/);
  });
});

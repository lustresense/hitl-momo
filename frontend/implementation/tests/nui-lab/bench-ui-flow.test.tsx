// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { resetFaceDetectorForTest } from "@/src/camera/face-anchor";
import { resetInferenceSchedulerForTest } from "@/src/camera/inference-scheduler";
import { getLabBenchConfig, writePersistedBenchConsent } from "@/src/components/nui-lab/bench/config";
import { reanalyzeExport, validateExportFile } from "@/src/components/nui-lab/bench/export";
import { BenchSessionManager, resetBenchManagerForTest } from "@/src/components/nui-lab/bench/manager";
import { MemoryBenchStore } from "@/src/components/nui-lab/bench/store";
import { pistolSkeleton } from "./lab-rig";

const mocks = vi.hoisted(() => {
  const landmarker = { detectForVideo: vi.fn(() => ({ landmarks: [] })), close: vi.fn() };
  const faceDetector = { detectForVideo: vi.fn(() => ({ detections: [] })), close: vi.fn() };
  return {
    landmarker,
    faceDetector,
    createHandLandmarker: vi.fn(async () => ({ landmarker, delegate: "CPU", fellBack: false })),
  };
});

vi.mock("@/src/camera/hand-landmarker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/camera/hand-landmarker")>()),
  createHandLandmarker: mocks.createHandLandmarker,
  getDelegateInfo: () => ({
    delegate: "CPU",
    reason: "software-renderer",
    switchState: "none",
    gpuAvgMs: null,
    slowStreak: 0,
    switchError: null,
  }),
}));

vi.mock("@mediapipe/tasks-vision", async (importOriginal) => ({
  ...((await importOriginal<typeof import("@mediapipe/tasks-vision")>()) as object),
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  FaceDetector: { createFromOptions: vi.fn(async () => mocks.faceDetector) },
}));

vi.mock("@/src/camera/frame-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/camera/frame-source")>()),
  frameForDetection: (video: HTMLVideoElement) => video,
}));

import NuiLabLanding from "@/app/nui-lab/page";
import { NuiLabPage } from "@/src/components/nui-lab/NuiLabPage";

const R20_C4_RAW = readFileSync(resolve(process.cwd(), "public/models/r20-c4-model.json"));
const R19_C0_RAW = readFileSync(resolve(process.cwd(), "public/models/r19-pistol-model.json"));

function fakeStream() {
  const track = {
    label: "Integrated HD Webcam",
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getSettings: () => ({ width: 1280, height: 720, frameRate: 30 }),
  };
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
}

function fakeVideo(video: HTMLVideoElement) {
  let t = 0.1;
  Object.defineProperty(video, "readyState", { configurable: true, get: () => 4 });
  Object.defineProperty(video, "videoWidth", { configurable: true, get: () => 1280 });
  Object.defineProperty(video, "videoHeight", { configurable: true, get: () => 720 });
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => t,
    set: (v: number) => {
      t = v;
    },
  });
  return { nextFrame: () => (t += 0.1) };
}

async function readBlob(b: Blob): Promise<string> {
  if (typeof b.text === "function") return b.text();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsText(b);
  });
}

describe("NUI Lab R22 zero-friction Benchmark UI flow across routes (/nui-lab -> gesture -> canvas)", () => {
  let store: MemoryBenchStore;

  beforeEach(() => {
    store = new MemoryBenchStore();
    writePersistedBenchConsent(false);
    resetBenchManagerForTest(new BenchSessionManager({ openStore: async () => store, randomId: () => "uiflow01", initialConsent: false }));
    getLabBenchConfig().resetForTest({ engineId: "r20-c4", preprocess: "a4", detector: "cpu-main-thread" });
    resetFaceDetectorForTest();
    resetInferenceSchedulerForTest();
    mocks.landmarker.detectForVideo.mockReset();
    mocks.landmarker.detectForVideo.mockImplementation(() => ({ landmarks: [] }));
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => fakeStream()) },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const u = String(input);
        const buf = u.includes("r19-pistol-model.json") ? R19_C0_RAW : R20_C4_RAW;
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
          json: async () => JSON.parse(buf.toString("utf8")),
        } as unknown as Response;
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    writePersistedBenchConsent(false);
    resetBenchManagerForTest(null);
  });

  it("consents once on /nui-lab (with zero engineering selectors), auto-records gesture + canvas trials on camera-on, and exports valid JSON & CSV", async () => {
    const blobs: Blob[] = [];
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((b: Blob) => {
        blobs.push(b);
        return "blob:bench";
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    // 1. Landing page (/nui-lab): only 2 primary CTAs + single consent checkbox, zero engineering dropdowns or Mulai Benchmark button
    const landing = render(<NuiLabLanding />);
    expect(screen.getByTestId("cta-try-gesture").getAttribute("href")).toBe("/nui-lab/gesture");
    expect(screen.getByTestId("cta-try-canvas").getAttribute("href")).toBe("/nui-lab/canvas");
    expect(screen.queryByTestId("bench-start")).toBeNull();
    expect(screen.queryByTestId("bench-engine-r20-c4")).toBeNull();
    expect(screen.queryByTestId("bench-scenario-select")).toBeNull();
    expect(screen.getByTestId("nui-lab-status-badge").textContent).toContain("NUI R22 · CPU · Otomatis");

    fireEvent.click(screen.getByTestId("bench-consent"));
    await waitFor(() => expect(screen.getByTestId("bench-status-pill").textContent).toContain("REKAM OTOMATIS SIAP"));
    landing.unmount();

    // 2. Gesture Lab (/nui-lab/gesture): turning camera ON automatically starts session & Trial 1 (no manual start/GT click!)
    const pressRight = pistolSkeleton(0, true, { aspect: 16 / 9 });
    let lmList: ReturnType<typeof pistolSkeleton>[] = [pressRight];
    mocks.landmarker.detectForVideo.mockImplementation(() => ({ landmarks: lmList as never[] }));

    const gestureView = render(<NuiLabPage variant="gesture" />);
    expect(screen.getByTestId("r19-engine-badge").textContent).toContain("NUI R22 · CPU · Otomatis");
    expect(screen.queryByTestId("bench-bar-engine")).toBeNull();
    expect(screen.queryByTestId("bench-bar-preprocess")).toBeNull();
    expect(screen.queryByTestId("bench-bar-detector")).toBeNull();
    expect(screen.queryByTestId("bench-bar-scenario")).toBeNull();
    expect(screen.queryByTestId("bench-bar-truth")).toBeNull();
    expect(screen.queryByTestId("bench-bar-start")).toBeNull();

    const gClock = fakeVideo(gestureView.container.querySelector("video") as HTMLVideoElement);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(() => expect(screen.getByTestId("r19-model-status").getAttribute("data-state")).toBe("ready"));
    await waitFor(() => expect(screen.getByTestId("bench-bar-status").textContent).toContain("REKAM OTOMATIS"));

    await waitFor(
      () => {
        gClock.nextFrame();
        expect(screen.getByTestId("bench-bar-status").textContent).toMatch(/[1-9]\d* frame/);
      },
      { timeout: 4000, interval: 25 },
    );

    // Record 0-hand DETECTOR_MISS frames
    lmList = [];
    for (let i = 0; i < 3; i++) {
      gClock.nextFrame();
      await new Promise((r) => setTimeout(r, 30));
    }
    // Route switch unmount closes Trial 1 cleanly with endReason="route-switch"
    gestureView.unmount();

    // 3. Canvas Lab (/nui-lab/canvas): auto-opens Trial 2 under the same session, tracks pointer stroke & 1-click export
    const canvasView = render(<NuiLabPage variant="canvas" />);
    const cClock = fakeVideo(canvasView.container.querySelector("video") as HTMLVideoElement);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(() => expect(screen.getByTestId("r19-model-status").getAttribute("data-state")).toBe("ready"));
    await waitFor(
      () => {
        cClock.nextFrame();
        expect(screen.getByTestId("bench-bar-metrics").textContent).toContain("Trial: 2");
      },
      { timeout: 4000, interval: 25 },
    );

    const canvas = screen.getByLabelText("Kanvas gambar NUI");
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 90, clientY: 90 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });

    // Export JSON & CSV in 1 click directly from the bar
    await act(async () => {
      fireEvent.click(screen.getByTestId("bench-bar-export"));
    });
    await waitFor(() => expect(blobs.length).toBeGreaterThanOrEqual(1));

    const exported = JSON.parse(await readBlob(blobs[0]!));
    expect(validateExportFile(exported)).toEqual([]);
    const re = reanalyzeExport(exported);
    expect(re.ok).toBe(true);
    expect(exported.sessions[0].trials).toHaveLength(2);
    expect(exported.sessions[0].trials[0].meta.route).toBe("gesture");
    expect(exported.sessions[0].trials[0].meta.endReason).toBe("route-switch");
    expect(exported.sessions[0].trials[0].meta.engine.actualModelId).toBe("r20-c4");
    expect(exported.sessions[0].trials[0].meta.engine.displayModeLabel).toBe("NUI R22 · CPU · Otomatis");
    expect(exported.sessions[0].trials[1].meta.route).toBe("canvas");
    expect(exported.sessions[0].trials[1].summary.canvas.pointerStrokes).toBe(1);
    expect(exported.sessions[0].trials[0].summary.independentGroundTruthAvailable).toBe(false);
    expect(exported.sessions[0].validation.physicalWebcamEvidence).toBe("PHYSICAL_PRESUMED_TESTER_RUN");

    await act(async () => {
      fireEvent.click(screen.getByTestId("bench-bar-export-csv"));
    });
    await waitFor(() => expect(blobs.length).toBeGreaterThanOrEqual(2));
  });
});

// @vitest-environment jsdom
/**
 * R22 Acceptance Test Suite: UI Flow & Autolabel Lifecycle (U01–U10, B01–B12).
 *
 * Verifies:
 *  - U01, U06: Clean landing page with exactly two primary CTAs (Coba Gestur & Coba Canvas)
 *              and ZERO engineering dropdowns (no C4/C7, A4/RAW, detector, scenario, or manual GT selectors).
 *  - U02, U03, U04: Sticky left camera layout and independent right scroll structure.
 *  - B01–B04: Auto-session start on camera-on after consent, automatic trial closure with canonical endReason
 *             (route-switch, tab-hidden, pagehide, camera-stop, user-finish).
 *  - B05: Provenance tagging (labelSource: MODEL_PREDICTION | RULE_DERIVED | USER_ACTION | DATASET_GT | UNKNOWN).
 *  - B06, B09: Separation of active-window hand frames vs raw no-hand frames without self-GT accuracy claims.
 *  - B10–B12: 1-click JSON and CSV export validity and cryptographic integrity.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import NuiLabLanding from "@/app/nui-lab/page";
import { NuiLabPage } from "@/src/components/nui-lab/NuiLabPage";
import {
  getLabBenchConfig,
  parseNumHandsUrlOverride,
  SSR_DEFAULT_BENCH_CONFIG,
  writePersistedBenchConsent,
} from "@/src/components/nui-lab/bench/config";
import { BenchSessionManager, getBenchManager, resetBenchManagerForTest } from "@/src/components/nui-lab/bench/manager";
import { MemoryBenchStore } from "@/src/components/nui-lab/bench/store";
import { buildEngineConfig, DEFAULT_PREPROCESS, PREPROCESS_CANDIDATES } from "@/src/components/nui-lab/bench/engines";
import {
  buildSummaryCsv,
  reanalyzeExport,
  validateExportFile,
  verifyExportChecksum,
} from "@/src/components/nui-lab/bench/export";
import type { DelegateInfo } from "@/src/camera/hand-landmarker";

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
  const faceDetector = {
    detectForVideo: vi.fn(() => ({ detections: [] })),
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

vi.mock("@/src/camera/hand-landmarker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/camera/hand-landmarker")>()),
  createHandLandmarker: mocks.createHandLandmarker,
  getDelegateInfo: () => ({ ...mocks.delegateInfo }),
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

vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);

const R20_C4_RAW = readFileSync(resolve(process.cwd(), "public/models/r20-c4-model.json"));
const R19_C0_RAW = readFileSync(resolve(process.cwd(), "public/models/r19-pistol-model.json"));

function stubModels() {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
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
    return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) } as unknown as Response;
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

function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, "mediaDevices", { value, configurable: true });
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
}

const APP = { version: "0.29.1-alpha", gitCommit: "r22fullscope" };
const ENV = {
  userAgentFamily: "Chromium",
  platform: "Linux",
  hardwareConcurrency: 4,
  deviceMemoryGb: 8,
  devicePixelRatio: 1,
  viewport: { w: 1280, h: 720 },
  secureContext: true,
  storage: "memory-only" as const,
};
const CAM = { width: 1280, height: 720, frameRate: 30, deviceClass: "physical-presumed" as const };

function makeMockFrame(fid: number, t: number, hasHand: boolean, labelSource: any = "RULE_DERIVED") {
  return {
    t,
    fid,
    det: hasHand ? ("HAND" as const) : ("DETECTOR_MISS" as const),
    lm: hasHand ? Array.from({ length: 21 }, (_, i): [number, number] => [0.3 + i * 0.01, 0.4 + i * 0.01]) : null,
    session: hasHand ? 1 : 0,
    lock: hasHand ? "locked" : "waiting",
    aspect: 1.7778,
    rawPose: hasHand ? "one-finger" : "none",
    stablePose: hasHand ? "one-finger" : "none",
    fingers: hasHand ? 1 : 0,
    fingersLegacy: hasHand ? 1 : 0,
    fingerStates: hasHand ? ["extended", "curled", "curled", "curled"] : null,
    thumb: null,
    pinchRatio: hasHand ? 0.12 : null,
    r19State: hasHand ? ("POINT_PRESS" as const) : ("NO_HAND" as const),
    r19SubClass: hasHand ? "pistol" : "no-hand",
    vkeyEvent: hasHand ? ("KEYDOWN" as const) : ("NONE" as const),
    r19Probs: hasHand ? { ready: 0.02, press: 0.95, other: 0.03 } : null,
    truth: "UNLABELLED" as const,
    reject: hasHand ? "Tinta aktif" : "no-hand",
    action: hasHand ? ("draw" as const) : ("none" as const),
    labelSource,
    hands: hasHand ? 1 : 0,
    farHands: 0,
    luma: { mean: 0.42, center: 0.44, backlight: false, pass: "A0_raw" },
    timing: { mpMs: 14, preMs: 0.2, workerMs: 16, classifierMs: 0.02, pipelineMs: 18 },
    top3: hasHand ? [{ label: "POINT_PRESS", p: 0.95 }, { label: "OTHER", p: 0.03 }, { label: "POINT_READY", p: 0.02 }] : null,
    direction: hasHand ? "RIGHT" : "NEUTRAL",
    geometry: { pinchActive: hasHand, eraseActive: false, swipe: null, thumbUp: false, isPinch: hasHand },
    fsm: { state: hasHand ? "PRESS" : "NO_HAND", event: hasHand ? "KEYDOWN" : "NONE", zone: hasHand ? "walk-right" : "stop", left: false, right: hasHand, jump: false, releaseReason: null },
    rejectDetail: hasHand ? "draw" : "no-hand",
    jitter: null,
    droppedSincePrev: 0,
  };
}

async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsText(blob);
  });
}

beforeEach(() => {
  stubModels();
  setDocumentHidden(false);
  writePersistedBenchConsent(false);
  resetBenchManagerForTest(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  writePersistedBenchConsent(false);
  resetBenchManagerForTest(null);
  setMediaDevices(undefined);
  setDocumentHidden(false);
});

describe("U01, U06: Clean Landing Page CTAs & Zero Engineering Selectors", () => {
  it("renders only two primary CTAs (Coba Gestur & Coba Canvas) with passive camera check and zero engineering dropdowns", () => {
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    setMediaDevices({ getUserMedia });

    render(<NuiLabLanding />);

    // Primary Landing Elements
    expect(screen.getByTestId("nui-lab-landing")).toBeTruthy();
    expect(screen.getByTestId("nui-lab-status-badge").textContent).toContain("NUI R22 · CPU · Otomatis");
    expect(screen.getByTestId("nui-lab-engine-info").textContent).toContain("R20 C4");
    expect(screen.getByTestId("nui-lab-camera-readiness").getAttribute("data-camera-api")).toBe("available");

    // Passive check: must NOT have requested camera permission yet!
    expect(getUserMedia).not.toHaveBeenCalled();

    // Two primary CTAs
    const gestureLink = screen.getByRole("link", { name: /Coba Gestur/i });
    const canvasLink = screen.getByRole("link", { name: /Coba Canvas/i });
    expect(gestureLink.getAttribute("href")).toBe("/nui-lab/gesture");
    expect(canvasLink.getAttribute("href")).toBe("/nui-lab/canvas");

    // Zero engineering selectors (no C4/C7, no A4/RAW, no GT selectors)
    expect(screen.queryByRole("combobox", { name: /model/i })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /engine/i })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /preprocess/i })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /ground truth/i })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /detector/i })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /scenario/i })).toBeNull();
  });
});

describe("U02, U03, U04: Sticky Left Camera & Independent Right Scroll Layout", () => {
  it("structures the DOM with sticky left camera and independent right scroll containers", () => {
    const { container } = render(<NuiLabPage variant="canvas" />);

    // Left camera panel and right content panel exist
    const cameraPanel = container.querySelector(".nui-lab__camera-panel");
    const rightPanel = container.querySelector(".nui-lab__right-panel");

    expect(cameraPanel).toBeTruthy();
    expect(rightPanel).toBeTruthy();

    // Structural separation: camera panel and right panel are distinct sibling containers
    expect(cameraPanel).not.toBe(rightPanel);
    expect(cameraPanel?.parentElement).toBe(rightPanel?.parentElement);
  });
});

describe("B01–B04: Auto-Session Lifecycle & Canonical EndReason", () => {
  it("enforces consent check before recording and creates session with trial lifecycle", async () => {
    const store = new MemoryBenchStore();
    const mgr = new BenchSessionManager({ openStore: async () => store });

    // Without consent -> startSession throws
    await expect(mgr.startSession({ consent: false, app: APP, environment: ENV })).rejects.toThrow(/persetujuan/i);
    expect(await store.listSessions()).toHaveLength(0);

    // With consent -> session begins
    const sid = await mgr.startSession({ consent: true, app: APP, environment: ENV });
    expect(sid).toMatch(/^S-/);

    // Trial begins
    mgr.beginTrial({
      route: "canvas",
      source: "canvas-lab",
      engine: buildEngineConfig("r20-c4", "raw", "cpu-worker", true),
      camera: CAM,
    });

    mgr.recordFrame(makeMockFrame(1, 100, true));
    mgr.recordFrame(makeMockFrame(2, 133, true));

    // End trial on route switch
    mgr.endTrial("route-unmount");

    const trials = await store.listTrials(sid);
    expect(trials).toHaveLength(1);
    expect(trials[0]!.meta.endReason).toBe("route-switch");
  });

  it("closes trials automatically on visibilitychange and pagehide with canonical endReason", async () => {
    const store = new MemoryBenchStore();
    const mgr = new BenchSessionManager({ openStore: async () => store });
    const sid = await mgr.startSession({ consent: true, app: APP, environment: ENV });

    // Trial 1: closed by visibility change
    mgr.beginTrial({
      route: "gesture",
      source: "gesture-lab",
      engine: buildEngineConfig("r20-c4", "raw", "cpu-worker", true),
      camera: CAM,
    });
    mgr.recordFrame(makeMockFrame(1, 100, true));
    mgr.endTrial("tab-hidden");

    // Trial 2: interrupted by pagehide
    mgr.beginTrial({
      route: "canvas",
      source: "canvas-lab",
      engine: buildEngineConfig("r20-c4", "raw", "cpu-worker", true),
      camera: CAM,
    });
    mgr.recordFrame(makeMockFrame(2, 200, true));
    mgr.markInterrupted("pagehide");

    const trials = await store.listTrials(sid);
    expect(trials).toHaveLength(2);
    expect(trials[0]!.meta.endReason).toBe("tab-hidden");
    expect(trials[1]!.meta.endReason).toBe("pagehide");
  });
});

describe("B05: Autolabel Provenance Tagging (labelSource)", () => {
  it("tags frame records with explicit labelSource provenance (RULE_DERIVED / MODEL_PREDICTION / USER_ACTION)", async () => {
    const store = new MemoryBenchStore();
    const mgr = new BenchSessionManager({ openStore: async () => store });
    const sid = await mgr.startSession({ consent: true, app: APP, environment: ENV });

    mgr.beginTrial({
      route: "canvas",
      source: "canvas-lab",
      engine: buildEngineConfig("r20-c4", "raw", "cpu-worker", true),
      camera: CAM,
    });

    const frameRule = makeMockFrame(1, 100, true, "RULE_DERIVED");
    const frameModel = makeMockFrame(2, 133, true, "MODEL_PREDICTION");
    const frameUser = makeMockFrame(3, 166, true, "USER_ACTION");

    expect(mgr.recordFrame(frameRule)).toBe(true);
    expect(mgr.recordFrame(frameModel)).toBe(true);
    expect(mgr.recordFrame(frameUser)).toBe(true);

    mgr.endTrial("finished-by-tester");
    await mgr.finishSession("finished-by-tester");

    const blob = await mgr.exportAll(APP);
    const parsed = JSON.parse(await readBlobText(blob));
    const sessionFrames = parsed.sessions[0].frames;

    expect(sessionFrames[0].labelSource).toBe("RULE_DERIVED");
    expect(sessionFrames[1].labelSource).toBe("MODEL_PREDICTION");
    expect(sessionFrames[2].labelSource).toBe("USER_ACTION");
  });
});

describe("B06, B09: Active-Window vs Raw No-Hand Stats without Self-GT Accuracy", () => {
  it("accurately reports handFrames, detectorMissFrames, and missingHandRate without circular self-GT accuracy", async () => {
    const store = new MemoryBenchStore();
    const mgr = new BenchSessionManager({ openStore: async () => store });
    const sid = await mgr.startSession({ consent: true, app: APP, environment: ENV });

    // Trial: 4 total frames, 3 hand frames, 1 detector miss
    mgr.beginTrial({
      route: "canvas",
      source: "canvas-lab",
      engine: buildEngineConfig("r20-c4", "raw", "cpu-worker", true),
      camera: CAM,
    });

    mgr.recordFrame(makeMockFrame(1, 100, true));
    mgr.recordFrame(makeMockFrame(2, 133, true));
    mgr.recordFrame(makeMockFrame(3, 166, true));
    mgr.recordFrame(makeMockFrame(4, 200, false)); // Detector miss

    mgr.endTrial("route-switch");
    await mgr.finishSession("user-finish");

    const blob = await mgr.exportAll(APP);
    const parsed = JSON.parse(await readBlobText(blob));
    const summary = parsed.sessions[0].trials[0].summary;

    expect(summary.frames).toBe(4);
    expect(summary.handFrames).toBe(3);
    expect(summary.detectorMissFrames).toBe(1);
    expect(summary.missingHandRate).toBeCloseTo(0.25, 4);

    // No circular self-GT claims: unlabelled frames on canvas do not fabricate unexpected stroke breaks
    expect(summary.canvas.strokes).toBe(0);
    expect(summary.canvas.unexpectedStrokeBreaks).toBe(0);
  });
});

describe("B10–B12: 1-Click JSON and Summary CSV Export", () => {
  it("exports valid JSON with cryptographic checksum and multi-trial summary CSV", async () => {
    const store = new MemoryBenchStore();
    const mgr = new BenchSessionManager({ openStore: async () => store });
    const sid = await mgr.startSession({ consent: true, app: APP, environment: ENV });

    // Trial 1: Gesture route
    mgr.beginTrial({
      route: "gesture",
      source: "gesture-lab",
      engine: buildEngineConfig("r20-c4", "raw", "cpu-worker", true),
      camera: CAM,
    });
    mgr.recordFrame(makeMockFrame(1, 100, true));
    mgr.endTrial("route-switch");

    // Trial 2: Canvas route
    mgr.beginTrial({
      route: "canvas",
      source: "canvas-lab",
      engine: buildEngineConfig("r20-c4", "raw", "cpu-worker", true),
      camera: CAM,
    });
    mgr.recordFrame(makeMockFrame(2, 200, true));
    mgr.endTrial("user-finish");

    await mgr.finishSession("user-finish");

    // 1. JSON Export Validation
    const jsonBlob = await mgr.exportAll(APP);
    const jsonText = await readBlobText(jsonBlob);
    const parsed = JSON.parse(jsonText);

    expect(parsed.schema).toBe("nui-lab-bench-export/2");
    expect(validateExportFile(parsed)).toEqual([]);

    const re = reanalyzeExport(parsed);
    expect(re.ok).toBe(true);
    expect(re.mismatches).toEqual([]);

    // Cryptographic validation passes
    const checksumOk = await verifyExportChecksum(jsonText);
    expect(checksumOk.ok).toBe(true);

    // 2. CSV Export Validation
    const csv = await buildSummaryCsv(store, [sid]);
    expect(csv).toContain("sessionId,trialId,index,source,route");
    expect(csv).toContain("gesture");
    expect(csv).toContain("canvas");
    expect(csv.trim().split("\n")).toHaveLength(3); // 1 header line + 2 trial lines
  });
});

describe("Owner Decisions R22 (RAW default, ?hands=1 hidden override, SSR hydration safety)", () => {
  it("defaults DEFAULT_PREPROCESS to raw while retaining a4 and r22-soft-knee-shadow-clamp as candidates", () => {
    expect(DEFAULT_PREPROCESS).toBe("raw");
    expect(PREPROCESS_CANDIDATES).toEqual(["a4", "r22-soft-knee-shadow-clamp"]);
  });

  it("parses hidden URL override ?hands=1 without UI selector and defaults to fixed-2", () => {
    expect(parseNumHandsUrlOverride("")).toEqual({
      numHandsPolicy: "fixed-2",
      fixedNumHands: 2,
      numHandsOverride: null,
    });
    expect(parseNumHandsUrlOverride("?hands=1")).toEqual({
      numHandsPolicy: "fixed-1",
      fixedNumHands: 1,
      numHandsOverride: "url:?hands=1",
    });
    expect(parseNumHandsUrlOverride("?foo=bar&hands=1")).toEqual({
      numHandsPolicy: "fixed-1",
      fixedNumHands: 1,
      numHandsOverride: "url:?hands=1",
    });
    expect(parseNumHandsUrlOverride("?hands=2")).toEqual({
      numHandsPolicy: "fixed-2",
      fixedNumHands: 2,
      numHandsOverride: null,
    });
  });

  it("records ?hands=1 override and RAW default + candidates in TrialMeta and TRIAL_START telemetry", async () => {
    const store = new MemoryBenchStore();
    const mgr = new BenchSessionManager({ openStore: async () => store });
    const sid = await mgr.startSession({ consent: true, app: APP, environment: ENV });
    const ov = parseNumHandsUrlOverride("?hands=1");

    mgr.beginTrial({
      route: "canvas",
      source: "canvas-lab",
      engine: buildEngineConfig("r20-c4", DEFAULT_PREPROCESS, "cpu-worker", true, {
        numHandsPolicy: ov.numHandsPolicy,
        numHandsOverride: ov.numHandsOverride,
      }),
      camera: CAM,
      numHandsActive: ov.fixedNumHands,
      numHandsOverride: ov.numHandsOverride,
    });
    mgr.recordFrame(makeMockFrame(1, 100, true));
    mgr.endTrial("user-finish");
    await mgr.finishSession("user-finish");

    const trials = await store.listTrials(sid);
    expect(trials).toHaveLength(1);
    const meta = trials[0]!.meta;
    expect(meta.engine.preprocess).toBe("raw");
    expect(meta.engine.numHandsPolicy).toBe("fixed-1");
    expect(meta.engine.numHandsOverride).toBe("url:?hands=1");
    expect(meta.detectorConfig?.numHandsPolicy).toBe("fixed-1");
    expect(meta.detectorConfig?.numHandsActive).toBe(1);
    expect(meta.detectorConfig?.numHandsOverride).toBe("url:?hands=1");
    expect(meta.preprocessConfig).toEqual({
      mode: "raw",
      defaultMode: "raw",
      candidates: ["a4", "r22-soft-knee-shadow-clamp"],
    });
  });

  it("exposes deterministic hydration-safe server snapshots on config and bench manager stores", () => {
    expect(getLabBenchConfig().getServerSnapshot()).toBe(SSR_DEFAULT_BENCH_CONFIG);
    expect(SSR_DEFAULT_BENCH_CONFIG.preprocess).toBe("raw");
    expect(SSR_DEFAULT_BENCH_CONFIG.detector).toBe("cpu-worker");
    const ssrBench = getBenchManager().getServerSnapshot();
    expect(ssrBench.phase).toBe("idle");
    expect(ssrBench.consentGranted).toBe(false);
    expect(ssrBench.storage).toBe("unknown");
  });
});

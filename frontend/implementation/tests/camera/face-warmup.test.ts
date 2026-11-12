// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FaceDetector } from "@mediapipe/tasks-vision";
import { FACE_MODEL_PATH } from "@/src/camera/hand-config";
import { warmHandLandmarker, resetHandLandmarkerForTest } from "@/src/camera/landmarker-warmup";
import { resetFaceDetectorForTest } from "@/src/camera/face-anchor";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  FaceDetector: {
    createFromOptions: vi.fn(async () => ({ detectForVideo: vi.fn(() => ({ detections: [] })), close: vi.fn() })),
  },
}));

vi.mock("@/src/camera/hand-landmarker", () => ({
  createHandLandmarker: vi.fn(async () => ({
    landmarker: { detectForVideo: vi.fn(() => ({ landmarks: [] })), close: vi.fn() },
    delegate: "CPU",
    fellBack: false,
    reason: "software-renderer",
  })),
  delegateLabel: () => "CPU",
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  resetHandLandmarkerForTest();
  resetFaceDetectorForTest();
});

describe("cold start: the face model is warmed with the hand model", () => {
  it("warming the hand model also loads the face model, once, from the public folder", async () => {
    await warmHandLandmarker({ wasmRoot: "/mediapipe/wasm", modelUrl: "/models/hand_landmarker.task" });
    await flush();
    expect(FaceDetector.createFromOptions).toHaveBeenCalledTimes(1);
    expect(vi.mocked(FaceDetector.createFromOptions).mock.calls[0]![1]).toMatchObject({
      baseOptions: { modelAssetPath: FACE_MODEL_PATH },
      runningMode: "VIDEO",
    });
    expect(FACE_MODEL_PATH).toBe("/mediapipe/blaze_face_short_range.tflite");
  });
});

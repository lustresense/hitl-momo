import { beforeEach, describe, expect, it, vi } from "vitest";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { createHandLandmarker, delegateLabel } from "@/src/camera/hand-landmarker";
import { HAND_DETECTION_CONFIDENCE, HAND_PRESENCE_CONFIDENCE, HAND_TRACKING_CONFIDENCE } from "@/src/camera/hand-config";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

const create = vi.mocked(HandLandmarker.createFromOptions);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(FilesetResolver.forVisionTasks).mockResolvedValue({} as never);
});

const opts = { wasmRoot: "/w", modelUrl: "/m.task" };
const delegateOf = (call: number) =>
  ((create.mock.calls[call]![1] as { baseOptions: { delegate: string } }).baseOptions.delegate);
const numHandsOf = (call: number) => (create.mock.calls[call]![1] as { numHands: number }).numHands;

describe("createHandLandmarker delegate policy", () => {
  it("uses GPU when it works and does not touch CPU", async () => {
    create.mockResolvedValueOnce({ id: "gpu" } as never);
    const r = await createHandLandmarker(opts);
    expect(r.delegate).toBe("GPU");
    expect(r.fellBack).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
    expect(delegateOf(0)).toBe("GPU");
    expect(delegateLabel(r)).toBe("GPU");
  });

  it("retries ONCE on CPU when GPU createFromOptions rejects, and reports CPU", async () => {
    create.mockRejectedValueOnce(new Error("WebGL2 unavailable")).mockResolvedValueOnce({ id: "cpu" } as never);
    const r = await createHandLandmarker(opts);
    expect(create).toHaveBeenCalledTimes(2);
    expect([delegateOf(0), delegateOf(1)]).toEqual(["GPU", "CPU"]);
    expect(r.delegate).toBe("CPU");
    expect(r.fellBack).toBe(true);
    expect(delegateLabel(r)).toBe("CPU (cadangan)");
  });

  it("does not loop forever: GPU and CPU both failing throws after exactly two attempts", async () => {
    create.mockRejectedValue(new Error("model 404"));
    await expect(createHandLandmarker(opts)).rejects.toThrow("model 404");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("resolves the wasm fileset only once for the retry", async () => {
    create.mockRejectedValueOnce(new Error("gpu")).mockResolvedValueOnce({} as never);
    await createHandLandmarker(opts);
    expect(FilesetResolver.forVisionTasks).toHaveBeenCalledTimes(1);
  });
});

describe("createHandLandmarker hand count", () => {
  it("defaults to two hands, so the trackers can tell the player's hand from a bystander's", async () => {
    create.mockResolvedValueOnce({} as never);
    await createHandLandmarker(opts);
    expect(numHandsOf(0)).toBe(2);
  });

  it("passes the starting detection thresholds (exported, not measured) to every landmarker", async () => {
    create.mockResolvedValueOnce({} as never);
    await createHandLandmarker(opts);
    const cfg = create.mock.calls[0]![1] as Record<string, number>;
    expect(cfg.minHandDetectionConfidence).toBe(HAND_DETECTION_CONFIDENCE);
    expect(cfg.minHandPresenceConfidence).toBe(HAND_PRESENCE_CONFIDENCE);
    expect(cfg.minTrackingConfidence).toBe(HAND_TRACKING_CONFIDENCE);
    expect(HAND_DETECTION_CONFIDENCE).toBe(0.6);
  });

  it("passes the requested hand count to MediaPipe (the drawing driver asks for two)", async () => {
    create.mockResolvedValueOnce({} as never);
    await createHandLandmarker({ ...opts, numHands: 2 });
    expect(numHandsOf(0)).toBe(2);
  });
});

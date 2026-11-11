// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHandLandmarker } from "@/src/camera/hand-landmarker";
import {
  getHandLandmarkerStatus,
  type HandLandmarkerStatus,
  resetHandLandmarkerForTest,
  subscribeHandLandmarkerStatus,
  takeHandLandmarker,
  warmHandLandmarker,

} from "@/src/camera/landmarker-warmup";

vi.mock("@/src/camera/hand-landmarker", () => ({
  createHandLandmarker: vi.fn(),
  delegateLabel: (c: { delegate: string; fellBack: boolean }) => (c.fellBack ? `${c.delegate} (cadangan)` : c.delegate),
}));

const OPTS = { wasmRoot: "/mediapipe/wasm", modelUrl: "/models/hand_landmarker.task" };

function fake(delegate: "GPU" | "CPU" = "GPU") {
  return { landmarker: { detectForVideo: vi.fn(() => ({ landmarks: [] })), close: vi.fn() }, delegate, fellBack: delegate === "CPU" };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetHandLandmarkerForTest();
});
afterEach(() => resetHandLandmarkerForTest());

describe("landmarker warm-up (cold start)", () => {
  it("loads the model once, runs one blank inference, and publishes loading -> ready with the delegate", async () => {
    const created = fake("GPU");
    vi.mocked(createHandLandmarker).mockResolvedValue(created as never);
    const seen: HandLandmarkerStatus[] = [];
    subscribeHandLandmarkerStatus((s) => seen.push(s));

    await warmHandLandmarker(OPTS);

    expect(createHandLandmarker).toHaveBeenCalledTimes(1);
    expect(created.landmarker.detectForVideo).toHaveBeenCalledTimes(1);
    expect(seen.map((s) => s.kind)).toEqual(["idle", "loading", "warming", "ready"]);
    expect(getHandLandmarkerStatus()).toEqual({ kind: "ready", delegate: "GPU" });
  });

  it("reports the CPU fallback in the delegate label", async () => {
    vi.mocked(createHandLandmarker).mockResolvedValue(fake("CPU") as never);
    await warmHandLandmarker(OPTS);
    expect(getHandLandmarkerStatus()).toEqual({ kind: "ready", delegate: "CPU (cadangan)" });
  });

  it("never touches the camera: warming up needs no permission", async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    vi.mocked(createHandLandmarker).mockResolvedValue(fake() as never);
    await warmHandLandmarker(OPTS);
    expect(getUserMedia).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("a second warm-up while one is running or done creates no second model", async () => {
    vi.mocked(createHandLandmarker).mockResolvedValue(fake() as never);
    await Promise.all([warmHandLandmarker(OPTS), warmHandLandmarker(OPTS)]);
    await warmHandLandmarker(OPTS);
    expect(createHandLandmarker).toHaveBeenCalledTimes(1);
  });

  it("a failed load is reported in short Indonesian and can be retried", async () => {
    vi.mocked(createHandLandmarker).mockRejectedValueOnce(new Error("Failed to fetch model asset"));
    await warmHandLandmarker(OPTS);
    const s = getHandLandmarkerStatus();
    expect(s.kind).toBe("failed");
    expect(s.kind === "failed" && s.message).toMatch(/Pelacak|Pakai/);
    vi.mocked(createHandLandmarker).mockResolvedValue(fake() as never);
    await warmHandLandmarker(OPTS);
    expect(getHandLandmarkerStatus().kind).toBe("ready");
  });
});

describe("takeHandLandmarker hands the warm instance over once", () => {
  it("takes the warm instance, then the next taker builds its own", async () => {
    const warm = fake();
    const next = fake();
    vi.mocked(createHandLandmarker).mockResolvedValueOnce(warm as never).mockResolvedValueOnce(next as never);
    await warmHandLandmarker(OPTS);

    const first = await takeHandLandmarker(OPTS);
    expect(first.landmarker).toBe(warm.landmarker);
    const second = await takeHandLandmarker(OPTS);
    expect(second.landmarker).toBe(next.landmarker);
    expect(createHandLandmarker).toHaveBeenCalledTimes(2);
  });

  it("a taker that arrives while the warm-up runs waits for it: one model, not two", async () => {
    const warm = fake();
    let resolve!: (v: unknown) => void;
    vi.mocked(createHandLandmarker).mockReturnValueOnce(new Promise((r) => { resolve = r; }) as never);
    const warming = warmHandLandmarker(OPTS);
    const taken = takeHandLandmarker(OPTS);
    resolve(warm);
    const got = await taken;
    await warming;
    expect(got.landmarker).toBe(warm.landmarker);
    expect(createHandLandmarker).toHaveBeenCalledTimes(1);
  });

  it("a warm instance with a different hand count is not reused", async () => {
    vi.mocked(createHandLandmarker).mockResolvedValue(fake() as never);
    await warmHandLandmarker(OPTS);
    await takeHandLandmarker({ ...OPTS, numHands: 2 });
    expect(createHandLandmarker).toHaveBeenLastCalledWith(expect.objectContaining({ numHands: 2 }));
    expect(createHandLandmarker).toHaveBeenCalledTimes(2);
  });
});

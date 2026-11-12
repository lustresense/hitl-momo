import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { createHandLandmarker, delegateLabel, getDelegateInfo } from "@/src/camera/hand-landmarker";
import { HAND_DETECTION_CONFIDENCE, HAND_PRESENCE_CONFIDENCE, HAND_TRACKING_CONFIDENCE } from "@/src/camera/hand-config";

const SWIFTSHADER = "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)";
/** The renderer the GPU probe reports; null means "unknown", so the GPU is tried. */
const probe = vi.hoisted(() => ({ renderer: null as string | null }));
vi.mock("@/src/camera/gpu-probe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/camera/gpu-probe")>()),
  readRenderer: () => probe.renderer,
}));

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

const create = vi.mocked(HandLandmarker.createFromOptions);

beforeEach(() => {
  vi.clearAllMocks();
  probe.renderer = null;
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

describe("software renderer guard (no GPU attempt on SwiftShader and similar)", () => {
  it("goes straight to CPU on a software renderer: one model build, labelled as no GPU", async () => {
    probe.renderer = SWIFTSHADER;
    create.mockResolvedValueOnce({} as never);
    const r = await createHandLandmarker(opts);
    expect(create).toHaveBeenCalledTimes(1);
    expect(delegateOf(0)).toBe("CPU");
    expect(delegateLabel(r)).toBe("CPU (tanpa GPU)");
    expect(getDelegateInfo()).toMatchObject({ delegate: "CPU", reason: "software-renderer", switchState: "none" });
  });

  it("still tries GPU first on a real GPU, and keeps the GPU to CPU retry on a create failure", async () => {
    probe.renderer = "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060, D3D11)";
    create.mockRejectedValueOnce(new Error("WebGL2 unavailable")).mockResolvedValueOnce({} as never);
    const r = await createHandLandmarker(opts);
    expect([delegateOf(0), delegateOf(1)]).toEqual(["GPU", "CPU"]);
    expect(delegateLabel(r)).toBe("CPU (cadangan)");
    expect(getDelegateInfo().reason).toBe("gpu-failed");
  });
});

describe("slow GPU guard: one rebuild on CPU when the GPU is slow", () => {
  let clock = 0;
  let spy: ReturnType<typeof vi.spyOn>;
  /** A landmarker whose detect costs `cost()` ms on the fake clock. */
  function timed(cost: () => number) {
    return {
      detectForVideo: vi.fn(() => {
        clock += cost();
        return { landmarks: [] };
      }),
      close: vi.fn(),
    };
  }
  const frame = {} as HTMLVideoElement;
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const detectN = (lm: HandLandmarker, n: number) => {
    for (let i = 0; i < n; i++) lm.detectForVideo(frame, i);
  };

  beforeEach(() => {
    clock = 0;
    spy = vi.spyOn(performance, "now").mockImplementation(() => clock);
  });
  afterEach(() => spy.mockRestore());

  it("keeps the GPU for 19 slow detections and asks for one CPU model at the 20th", async () => {
    create.mockResolvedValueOnce(timed(() => 150) as never).mockResolvedValueOnce(timed(() => 5) as never);
    const { landmarker } = await createHandLandmarker(opts);
    detectN(landmarker, 19);
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
    detectN(landmarker, 1);
    expect(create).toHaveBeenCalledTimes(2);
    expect(delegateOf(1)).toBe("CPU");
  });

  it("a fast stretch restarts the count: 10 slow, 8 fast (the average drops), 13 slow is not enough", async () => {
    // The average is over 8 detections, so a fast stretch only breaks the streak once the window is mostly fast.
    let cost = 150;
    create.mockResolvedValueOnce(timed(() => cost) as never);
    const { landmarker } = await createHandLandmarker(opts);
    detectN(landmarker, 10);
    cost = 5;
    detectN(landmarker, 8);
    cost = 150;
    detectN(landmarker, 13);
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("while the CPU build is pending, more slow detections start no second build and the GPU keeps serving", async () => {
    let resolveCpu!: (v: unknown) => void;
    const gpu = timed(() => 150);
    create.mockResolvedValueOnce(gpu as never).mockReturnValueOnce(new Promise((r) => { resolveCpu = r; }) as never);
    const { landmarker } = await createHandLandmarker(opts);
    detectN(landmarker, 20);
    detectN(landmarker, 30);
    expect(create).toHaveBeenCalledTimes(2);
    expect(gpu.detectForVideo).toHaveBeenCalledTimes(50);
    resolveCpu(timed(() => 5));
    await flush();
  });

  it("when the CPU build arrives, the CPU serves and the GPU instance is closed; no further rebuilds", async () => {
    const gpu = timed(() => 150);
    const cpu = timed(() => 150); // slow on CPU too: still no second rebuild
    create.mockResolvedValueOnce(gpu as never).mockResolvedValueOnce(cpu as never);
    const { landmarker } = await createHandLandmarker(opts);
    detectN(landmarker, 20);
    await flush();
    expect(gpu.close).toHaveBeenCalledTimes(1);
    detectN(landmarker, 40);
    expect(cpu.detectForVideo).toHaveBeenCalledTimes(40);
    expect(create).toHaveBeenCalledTimes(2);
    expect(getDelegateInfo()).toMatchObject({ delegate: "CPU", reason: "slow-gpu", switchState: "switched" });
  });

  it("a failed CPU build keeps the GPU, reports why, and is not retried", async () => {
    const gpu = timed(() => 150);
    create.mockResolvedValueOnce(gpu as never).mockRejectedValueOnce(new Error("cpu failed"));
    const { landmarker } = await createHandLandmarker(opts);
    detectN(landmarker, 20);
    await flush();
    detectN(landmarker, 40);
    expect(gpu.close).not.toHaveBeenCalled();
    expect(gpu.detectForVideo).toHaveBeenCalledTimes(60);
    expect(create).toHaveBeenCalledTimes(2);
    expect(getDelegateInfo()).toMatchObject({ delegate: "GPU", switchState: "failed" });
  });

  it("closing while the CPU build is pending closes the new instance when it arrives", async () => {
    let resolveCpu!: (v: unknown) => void;
    const gpu = timed(() => 150);
    const cpu = timed(() => 5);
    create.mockResolvedValueOnce(gpu as never).mockReturnValueOnce(new Promise((r) => { resolveCpu = r; }) as never);
    const { landmarker } = await createHandLandmarker(opts);
    detectN(landmarker, 20);
    landmarker.close();
    resolveCpu(cpu);
    await flush();
    expect(gpu.close).toHaveBeenCalledTimes(1);
    expect(cpu.close).toHaveBeenCalledTimes(1);
  });
});

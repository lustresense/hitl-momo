/**
 * Single place that builds a MediaPipe HandLandmarker.
 *
 * Delegate policy:
 * - Software WebGL (SwiftShader, llvmpipe, Microsoft Basic Render): CPU straight away. The GPU delegate would copy
 *   every frame through a software GPU, which froze Momo's typing on the lead's CPU profile.
 * - Otherwise GPU first. If createFromOptions rejects, retry ONCE on CPU.
 * - Runtime: on GPU, a moving average above SLOW_GPU_MS for SLOW_GPU_STREAK detections in a row starts ONE rebuild
 *   on CPU. The GPU instance keeps serving until the CPU one is ready, then it is closed. A failed rebuild keeps
 *   the GPU and is not retried.
 *
 * Callers get a stable handle: the runtime switch happens inside it, so no tracker has to swap its instance.
 */
import { FilesetResolver, HandLandmarker, type HandLandmarkerResult, type ImageSource } from "@mediapipe/tasks-vision";
import { DEFAULT_NUM_HANDS, HAND_DETECTION_CONFIDENCE, HAND_PRESENCE_CONFIDENCE, HAND_TRACKING_CONFIDENCE } from "./hand-config";
import { isSoftwareRenderer, readRenderer } from "./gpu-probe";

export type HandDelegate = "GPU" | "CPU";

/** Why this delegate is in use. "slow-gpu": switched at runtime because the GPU was measured too slow. */
export type DelegateReason = "gpu" | "gpu-failed" | "software-renderer" | "slow-gpu";

export type SwitchState = "none" | "rebuilding" | "switched" | "failed";

/**
 * Starting values for the runtime switch (not measured on the exhibition PCs). A detection above 120 ms is about
 * 8 Hz; 20 in a row is about 2.5 s of slow frames, long enough to rule out a single hiccup.
 */
export const SLOW_GPU_MS = 120;
export const SLOW_GPU_STREAK = 20;
/** Moving average window, the same size as the scheduler's. */
const DURATION_WINDOW = 8;

export interface CreateHandLandmarkerOptions {
  wasmRoot: string;
  modelUrl: string;
  numHands?: number;
}

export interface CreatedHandLandmarker {
  /** Only detectForVideo and close are used by callers. Stays valid across a runtime switch. */
  landmarker: HandLandmarker;
  /** The delegate at creation. After a slow-GPU switch, getDelegateInfo() has the current one. */
  delegate: HandDelegate;
  /** True when GPU failed and CPU was used instead. */
  fellBack: boolean;
  /** Set by createHandLandmarker. Optional so hand-made test doubles that predate it still type-check. */
  reason?: DelegateReason;
}

/** Live state of the most recently created landmarker, for the lab page and status text. */
export interface DelegateInfo {
  delegate: HandDelegate | null;
  reason: DelegateReason | null;
  switchState: SwitchState;
  /** Moving average of GPU detections (ms); null before the first one or on CPU. */
  gpuAvgMs: number | null;
  /** Slow GPU detections in a row, counted toward SLOW_GPU_STREAK. */
  slowStreak: number;
  /** Message of the failed CPU rebuild, when it failed. */
  switchError: string | null;
}

const IDLE_INFO: DelegateInfo = {
  delegate: null,
  reason: null,
  switchState: "none",
  gpuAvgMs: null,
  slowStreak: 0,
  switchError: null,
};

let active: DelegateInfo | null = null;

/** The delegate and why it was chosen, for the lab page and status text. A copy: safe to hold. */
export function getDelegateInfo(): DelegateInfo {
  return active ? { ...active } : { ...IDLE_INFO };
}

export async function createHandLandmarker(
  options: CreateHandLandmarkerOptions,
): Promise<CreatedHandLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(options.wasmRoot);
  const numHands = options.numHands ?? DEFAULT_NUM_HANDS;
  const build = (delegate: HandDelegate) =>
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: options.modelUrl, delegate },
      runningMode: "VIDEO",
      numHands,
      minHandDetectionConfidence: HAND_DETECTION_CONFIDENCE,
      minHandPresenceConfidence: HAND_PRESENCE_CONFIDENCE,
      minTrackingConfidence: HAND_TRACKING_CONFIDENCE,
    });

  // The probe is cached, so this costs nothing after the first landmarker on the page.
  if (isSoftwareRenderer(readRenderer())) {
    const cpu = await build("CPU");
    return track(cpu, { delegate: "CPU", fellBack: false, reason: "software-renderer" });
  }
  try {
    const gpu = await build("GPU");
    return track(gpu, { delegate: "GPU", fellBack: false, reason: "gpu" }, () => build("CPU"));
  } catch {
    const cpu = await build("CPU");
    return track(cpu, { delegate: "CPU", fellBack: true, reason: "gpu-failed" });
  }
}

function safeClose(landmarker: HandLandmarker): void {
  try {
    landmarker.close();
  } catch {
    /* best-effort: a closed or broken instance has nothing left to free */
  }
}

/**
 * Wraps a landmarker so the runtime slow-GPU switch can replace it without callers noticing. `rebuildOnCpu` is
 * given only for a GPU instance; a CPU instance is never switched.
 */
function track(
  first: HandLandmarker,
  start: Pick<CreatedHandLandmarker, "delegate" | "fellBack" | "reason">,
  rebuildOnCpu?: () => Promise<HandLandmarker>,
): CreatedHandLandmarker {
  const state: DelegateInfo = { ...IDLE_INFO, delegate: start.delegate, reason: start.reason ?? null };
  active = state;
  let current = first;
  let closed = false;
  const durations: number[] = [];

  const startSwitch = (rebuild: () => Promise<HandLandmarker>) => {
    state.switchState = "rebuilding";
    let pending: Promise<HandLandmarker>;
    try {
      pending = rebuild();
    } catch (err) {
      pending = Promise.reject(err);
    }
    pending.then(
      (cpu) => {
        // The caller closed us while the CPU model was loading: do not keep a model nobody uses.
        if (closed) return safeClose(cpu);
        const old = current;
        current = cpu;
        state.delegate = "CPU";
        state.reason = "slow-gpu";
        state.switchState = "switched";
        state.gpuAvgMs = null;
        safeClose(old);
      },
      (err: unknown) => {
        state.switchState = "failed";
        state.switchError = err instanceof Error ? err.message : String(err);
      },
    );
  };

  const observeGpu = (ms: number) => {
    durations.push(ms);
    if (durations.length > DURATION_WINDOW) durations.shift();
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    state.gpuAvgMs = avg;
    state.slowStreak = avg > SLOW_GPU_MS ? state.slowStreak + 1 : 0;
    if (state.slowStreak >= SLOW_GPU_STREAK && rebuildOnCpu) startSwitch(rebuildOnCpu);
  };

  // Only callers' two methods are part of the contract; the cast is the price of a stable handle.
  const landmarker = {
    detectForVideo(videoFrame: ImageSource, timestamp: number): HandLandmarkerResult {
      const t0 = performance.now();
      const result = current.detectForVideo(videoFrame, timestamp);
      if (rebuildOnCpu && state.delegate === "GPU" && state.switchState === "none") {
        observeGpu(performance.now() - t0);
      }
      return result;
    },
    close(): void {
      if (closed) return;
      closed = true;
      safeClose(current);
    },
  } as unknown as HandLandmarker;

  return { landmarker, delegate: start.delegate, fellBack: start.fellBack, reason: start.reason };
}

/** Short diagnostic suffix, e.g. "GPU", "CPU (cadangan)", "CPU (tanpa GPU)" or "CPU (GPU lambat)". */
export function delegateLabel(
  created: Pick<CreatedHandLandmarker, "delegate" | "fellBack"> & { reason?: DelegateReason },
): string {
  if (created.reason === "software-renderer") return "CPU (tanpa GPU)";
  if (created.reason === "slow-gpu") return "CPU (GPU lambat)";
  return created.fellBack ? `${created.delegate} (cadangan)` : created.delegate;
}

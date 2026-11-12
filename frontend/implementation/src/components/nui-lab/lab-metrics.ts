/**
 * Pure math for the NUI test page (/nui-lab). No DOM and no MediaPipe, so it is unit-tested directly.
 * The owner reads these numbers on his own laptop before the exhibition; they are diagnostics, not a score.
 */
import type { FaceBox, FaceModelStatus } from "@/src/camera/face-anchor";
import { WaveSweep, type WaveFrame } from "@/src/camera/wave-tracker";
import type { ModelInferenceStats } from "@/src/camera/inference-scheduler";
import type { HandPose } from "@/src/input/hand-gesture";
import type { DelegateReason, SwitchState } from "@/src/camera/hand-landmarker";

/** Whole-hand range (x and y, normalised) under which a hand counts as still. Above a tremor, below a move. */
export const LAB_STILL_SPAN = 0.03;

/** The wrist must move this far (normalised) from where the test started before the clock starts. */
export const LAB_MOVE_EPS = 0.02;

/** Nearest-rank percentile. Returns null for no samples; the input array is not changed. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1]!;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Radial standard deviation of points (normalised frame units) converted to px of a canvas `canvasWidthPx` wide.
 * Radial = sqrt(varX + varY), so one number covers both axes. Null with fewer than two points.
 */
export function jitterStdDevPx(points: Point[], canvasWidthPx: number): number | null {
  if (points.length < 2) return null;
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let vx = 0;
  let vy = 0;
  for (const p of points) {
    vx += (p.x - mx) ** 2;
    vy += (p.y - my) ** 2;
  }
  return Math.sqrt((vx + vy) / n) * canvasWidthPx;
}

/** True when every point lies within `span` of the others on both axes (a hand held still). */
export function isStill(points: Point[], span: number): boolean {
  if (points.length === 0) return false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return maxX - minX <= span && maxY - minY <= span;
}

/** Per-frame context the wave rule needs beyond the wrist: the hand size and the player's face (if any). */
export interface WaveFeedOptions {
  handSize?: number;
  face?: FaceBox | null;
}

/**
 * The wave test for the page, on the game's own rule: WaveSweep from wave-tracker.ts is the same code the game
 * runs, so the numbers here are the game's numbers. The sampler adds only what the owner wants to see: the first
 * real movement and the time from it to the detection.
 */
export class WaveLabSampler {
  private readonly sweep = new WaveSweep();
  private progressValue = 0;
  private reversalsValue = 0;
  private detectedValue = false;
  private refX: number | null = null;
  private movedAt: number | null = null;
  private detectedAt: number | null = null;

  /** 0..1, same scale as the cincin lambaian. */
  get progress(): number {
    return this.progressValue;
  }

  /** Swings (direction reversals) counted so far; the game detects at WAVE_MIN_REVERSALS. */
  get reversals(): number {
    return this.reversalsValue;
  }

  get detected(): boolean {
    return this.detectedValue;
  }

  /** Clock time of the first movement in this test, or null while the hand has not moved yet. */
  get movedAtMs(): number | null {
    return this.movedAt;
  }

  /** Milliseconds from the first movement to the detection; null until both have happened. */
  get elapsedMs(): number | null {
    return this.movedAt !== null && this.detectedAt !== null ? this.detectedAt - this.movedAt : null;
  }

  /** `wrist` null = no player hand in this frame. */
  feed(wrist: Point | null, nowMs: number, options: WaveFeedOptions = {}): void {
    if (this.detectedValue) return;
    if (wrist) {
      if (this.refX === null) this.refX = wrist.x;
      if (this.movedAt === null && Math.abs(wrist.x - this.refX) >= LAB_MOVE_EPS) this.movedAt = nowMs;
    }
    const frame: WaveFrame = { handSize: options.handSize, face: options.face ?? null };
    const step = this.sweep.feed(wrist, nowMs, frame);
    this.progressValue = step.progress;
    this.reversalsValue = step.swings;
    if (step.detected) {
      this.detectedValue = true;
      this.detectedAt = nowMs;
    }
  }

  reset(): void {
    this.sweep.reset();
    this.progressValue = 0;
    this.reversalsValue = 0;
    this.detectedValue = false;
    this.refX = null;
    this.movedAt = null;
    this.detectedAt = null;
  }
}

/** Short Indonesian label for a pose, shown next to the live numbers. */
export function poseLabel(pose: HandPose): string {
  switch (pose) {
    case "pinch":
      return "Cubit (coret)";
    case "fist":
      return "Kepal (hapus)";
    case "two-fingers":
      return "Dua jari (mundur)";
    case "one-finger":
      return "Satu jari";
    case "three-fingers":
      return "Tiga jari";
    case "split-palm":
      return "Telapak terbelah (maju)";
    case "open-palm":
      return "Telapak terbuka";
    case "thumb-up":
      return "Jempol";
    case "none":
      return "Belum terbaca";
  }
}

/** Text for the face model when no face is in view: the owner must see a failed model, not a missing face. */
export function faceAbsentText(status: FaceModelStatus): string {
  switch (status) {
    case "loading":
      return "Model wajah sedang dimuat";
    case "unavailable":
      return "Model wajah gagal dimuat";
    case "ready":
      return "Wajah tidak terlihat";
  }
}

/** One detector's readout: its rate in the last second and its average time. */
export function modelReadoutText(m: ModelInferenceStats): string {
  if (m.detections === 0 || m.avgMs === null) return "belum ada deteksi";
  return `${m.effectiveHz} /detik · rata-rata ${Math.round(m.avgMs)} ms`;
}

/** Why the detector runs on the delegate it runs on, in Indonesian for the owner. */
export function delegateReasonText(reason: DelegateReason | null): string {
  switch (reason) {
    case "gpu":
      return "GPU tersedia dan dipakai";
    case "gpu-failed":
      return "GPU gagal dibuka, dipakai CPU cadangan";
    case "software-renderer":
      return "Tidak ada GPU, browser memakai renderer perangkat lunak";
    case "slow-gpu":
      return "GPU terlalu lambat, pindah ke CPU";
    case null:
      return "—";
  }
}

/** Runtime switch from GPU to CPU. After a failed switch the GPU keeps serving, so the text says so. */
export function switchStateText(state: SwitchState, error: string | null): string {
  switch (state) {
    case "none":
      return "tidak ada pindah";
    case "rebuilding":
      return "sedang pindah ke CPU…";
    case "switched":
      return "sudah pindah ke CPU";
    case "failed":
      return `gagal pindah ke CPU, tetap pakai GPU${error ? ` (${error})` : ""}`;
  }
}

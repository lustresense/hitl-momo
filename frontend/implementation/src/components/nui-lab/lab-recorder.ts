/**
 * NUI Lab only (R17 REV4, RD-02): an opt-in, local recorder of NUMBERS, never pictures.
 *
 * What it keeps per frame: the 21 landmarks (x, y), a relative frame time, the hand-session counter, raw and stable pose,
 * finger and thumb readings, the pinch ratio, the tester's own label, the reject reason and the action that really ran.
 * What it never keeps or does: video, images, face data, names, wall-clock dates, a network call. The only way out is a
 * file the tester downloads by hand. Nothing starts without an explicit consent flag, and stop() drops the buffer on demand.
 * Data recorded without consent cannot exist: `start(false)` throws.
 */
import type { Landmark } from "@/src/input/types";
import type { LabSnapshot } from "./lab-analyzer";

export const RECORD_SCHEMA = "nui-landmark-record/1" as const;
export const MAX_RECORD_FRAMES = 20_000;

/** Ground truth the TESTER says is happening. UNLABELLED frames are kept but must not be used to train. */
export const TRUTH_LABELS = ["THREE", "FIVE", "PINCH_NEAR", "PINCH_TOUCH", "NO_GESTURE", "TRANSITION", "NO_LANDMARK", "UNLABELLED"] as const;
export type TruthLabel = (typeof TRUTH_LABELS)[number];
export type FinalAction = "draw" | "erase" | "undo" | "redo" | "none";

export interface RecordFrame {
  /** ms since the recording started (not a date). */
  t: number;
  /** [x, y] x 21, MediaPipe-normalised, rounded to 1e-4. null = no hand locked this frame. */
  lm: Array<[number, number]> | null;
  /** Hand-lock acquisition counter. A session, not a person. */
  session: number;
  lock: string;
  aspect: number;
  rawPose: string;
  stablePose: string;
  fingers: number;
  fingersLegacy: number;
  fingerStates: string[] | null;
  thumb: { legacyRatio: number; lateral: number | null; ipAngleDeg: number | null; open: boolean } | null;
  pinchRatio: number | null;
  truth: TruthLabel;
  reject: string;
  action: FinalAction;
}

export interface RecordFile {
  schema: typeof RECORD_SCHEMA;
  consent: true;
  /** Rules in force while recording, so the readings can be reproduced. */
  mode: "baseline" | "experiment";
  contains: "numeric landmarks and rule readings only; no video, no images, no identity";
  frameCount: number;
  truncated: boolean;
  frames: RecordFrame[];
}

const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;
const ACTIONS: ReadonlySet<string> = new Set(["draw", "erase", "undo", "redo"]);

export class LandmarkRecorder {
  private frames: RecordFrame[] = [];
  private startMs = 0;
  private active = false;
  private truncated = false;
  private mode: "baseline" | "experiment" = "baseline";

  get isRecording(): boolean {
    return this.active;
  }
  get frameCount(): number {
    return this.frames.length;
  }

  /** `consent` must be the tester's explicit yes; anything else throws and nothing is stored. */
  start(consent: boolean, nowMs: number): void {
    if (consent !== true) throw new Error("Rekaman butuh persetujuan eksplisit");
    this.frames = [];
    this.truncated = false;
    this.startMs = nowMs;
    this.active = true;
  }

  stop(): void {
    this.active = false;
  }

  /** Forget everything (the tester pressed "hapus rekaman"). */
  discard(): void {
    this.active = false;
    this.frames = [];
    this.truncated = false;
  }

  /** One frame from the analyzer that has just run. No-op unless recording. */
  add(snap: LabSnapshot, landmarks: Landmark[] | null, truth: TruthLabel, nowMs: number, commandAtMs: number | null = null): void {
    if (!this.active) return;
    if (this.frames.length >= MAX_RECORD_FRAMES) {
      this.truncated = true;
      return;
    }
    this.mode = snap.classifierMode;
    const d = snap.diag;
    const hasHand = landmarks !== null && landmarks.length === 21;
    const lastCommand = d.lastCommand;
    const action: FinalAction =
      lastCommand && commandAtMs !== null && lastCommand.atMs === commandAtMs
        ? lastCommand.kind
        : snap.drawingAction && ACTIONS.has(snap.drawingAction) ? (snap.drawingAction as FinalAction) : "none";
    this.frames.push({
      t: Math.round(nowMs - this.startMs),
      lm: hasHand ? landmarks.map((p): [number, number] => [r4(p.x), r4(p.y)]) : null,
      session: snap.acquisitionId,
      lock: snap.lockStatus,
      aspect: r4(d.aspect),
      rawPose: d.rawPose,
      stablePose: d.stablePose,
      fingers: d.rawFingerCount,
      fingersLegacy: d.legacyFingerCount,
      fingerStates: snap.fingerStates ? [...snap.fingerStates] : null,
      thumb: d.thumb ? { legacyRatio: r4(d.thumb.legacyRatio), lateral: d.thumb.lateral === null ? null : r4(d.thumb.lateral), ipAngleDeg: d.thumb.ipAngleDeg === null ? null : Math.round(d.thumb.ipAngleDeg), open: d.thumb.robustOpen } : null,
      pinchRatio: snap.pinchRatio === null ? null : r4(snap.pinchRatio),
      truth,
      reject: snap.rejectionReason,
      action,
    });
  }

  toFile(): RecordFile {
    return {
      schema: RECORD_SCHEMA,
      consent: true,
      mode: this.mode,
      contains: "numeric landmarks and rule readings only; no video, no images, no identity",
      frameCount: this.frames.length,
      truncated: this.truncated,
      frames: this.frames,
    };
  }

  /** What the tester downloads. Pretty enough to read, one frame per line. */
  toJSON(): string {
    const f = this.toFile();
    const { frames, ...head } = f;
    return `${JSON.stringify(head).slice(0, -1)},"frames":[\n${frames.map((x) => JSON.stringify(x)).join(",\n")}\n]}`;
  }
}

/** Structural check of a record (used by tests and by anyone loading a file before training on it). Returns problems. */
export function validateRecord(file: unknown): string[] {
  const problems: string[] = [];
  const f = file as Partial<RecordFile> | null;
  if (!f || typeof f !== "object") return ["not an object"];
  if (f.schema !== RECORD_SCHEMA) problems.push("schema");
  if (f.consent !== true) problems.push("consent flag missing: this data must not be used");
  if (!Array.isArray(f.frames)) return [...problems, "frames"];
  let last = -1;
  f.frames.forEach((fr, i) => {
    if (fr.t < last) problems.push(`frame ${i}: time goes backwards`);
    last = fr.t;
    if (fr.lm !== null && (fr.lm.length !== 21 || fr.lm.some((p) => p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])))) problems.push(`frame ${i}: landmarks`);
    if (!TRUTH_LABELS.includes(fr.truth)) problems.push(`frame ${i}: truth label`);
    if (fr.lm === null && fr.action !== "none") problems.push(`frame ${i}: action without a hand`);
  });
  if (f.frameCount !== f.frames.length) problems.push("frameCount");
  return problems;
}

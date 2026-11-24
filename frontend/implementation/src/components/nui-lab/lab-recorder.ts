/**
 * NUI Lab only (R17 REV4, RD-02, expanded for R19 G4 Hybrid): an opt-in, local recorder of NUMBERS, never pictures.
 *
 * What it keeps per frame: the 21 landmarks (x, y), a relative frame time, the hand-session counter, raw and stable pose,
 * finger and thumb readings, the pinch ratio, R19 state/subclass/virtual-key event/probabilities, the tester's own label,
 * the reject reason and the action that really ran.
 * What it never keeps or does: video, images, face data, names, wall-clock dates, a network call. The only way out is a
 * file the tester downloads by hand. Nothing starts without an explicit consent flag, and stop() drops the buffer on demand.
 * Data recorded without consent cannot exist: `start(false)` throws.
 */
import type { Landmark } from "@/src/input/types";
import type { LabSnapshot, R19VirtualKeyEvent } from "./lab-analyzer";
import type { R19TelemetryState } from "./lab-metrics";

export const RECORD_SCHEMA = "nui-landmark-record/1" as const;
export const MAX_RECORD_FRAMES = 20_000;

/** Ground truth the TESTER says is happening (R19 canonical list preserved for lab-recorder/1 compatibility). */
export const TRUTH_LABELS = [
  "POINT_READY",
  "POINT_PRESS",
  "OTHER",
  "POINT_RELEASE",
  "DORSAL_RIGHT_LEFT",
  "THREE",
  "FIVE",
  "PINCH_NEAR",
  "PINCH_TOUCH",
  "NO_GESTURE",
  "TRANSITION",
  "NO_LANDMARK",
  "UNLABELLED",
] as const;

/** R22B K4 v1.1 & §7 Guided Capture truth labels accepted by the v2.1 benchmark schema. */
export const K4V11_TRUTH_LABELS = [
  "FIST",
  "ONE",
  "TWO",
  "THREE_IMR",
  "THREE_TIM",
  "THREE_MRP",
  "FOUR",
  "PINCH_CLOSED",
  "PINCH_OK",
  "NEAR_PINCH",
  "NO_HAND",
  "TRANSITION_FIST_ONE",
  "TRANSITION_FIST_TWO",
  "TRANSITION_ONE_FIST",
  "TRANSITION_OPEN_PINCH_CLOSED_OPEN",
  "TRANSITION_PINCH_CLOSED_PINCH_OK",
  "TRANSITION_FIST_PINCH_CLOSED",
  "TRANSITION_PINCH_OK_FIVE",
] as const;

export type TruthLabel =
  | (typeof TRUTH_LABELS)[number]
  | (typeof K4V11_TRUTH_LABELS)[number]
  | `TRANSITION_${string}`;
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
  r19State: R19TelemetryState;
  r19SubClass: string;
  vkeyEvent: R19VirtualKeyEvent;
  r19Probs: { ready: number; press: number; other: number } | null;
  truth: TruthLabel;
  reject: string;
  action: FinalAction;
}

export interface RecordFile {
  schema: typeof RECORD_SCHEMA;
  consent: true;
  /** Classifier engine in force while recording, so the readings can be reproduced. */
  mode: "r19-g4-hybrid";
  contains: "numeric landmarks and rule readings only; no video, no images, no identity";
  frameCount: number;
  truncated: boolean;
  frames: RecordFrame[];
}

const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;
const ACTIONS: ReadonlySet<string> = new Set(["draw", "erase", "undo", "redo"]);
const R19_STATES: ReadonlySet<string> = new Set(["POINT_READY", "POINT_PRESS", "OTHER", "NO_HAND"]);
const VKEY_EVENTS: ReadonlySet<string> = new Set(["KEYDOWN", "HELD", "KEYUP", "RELEASE_ALL", "NONE"]);

/**
 * Pure builder shared by the legacy one-shot recorder and the benchmark session recorder (bench/), so both write the
 * exact same per-frame numbers. `tMs` is milliseconds since that recording started (never a date).
 */
export function buildRecordFrame(
  snap: LabSnapshot,
  landmarks: Landmark[] | null,
  truth: TruthLabel,
  tMs: number,
  commandAtMs: number | null = null,
): RecordFrame {
  const d = snap.diag;
  const hasHand = landmarks !== null && landmarks.length === 21;
  const lastCommand = d.lastCommand;
  const action: FinalAction =
    lastCommand && commandAtMs !== null && lastCommand.atMs === commandAtMs
      ? lastCommand.kind
      : snap.drawingAction && ACTIONS.has(snap.drawingAction) ? (snap.drawingAction as FinalAction) : "none";
  return {
    t: tMs,
    lm: hasHand ? landmarks.map((p): [number, number] => [r4(p.x), r4(p.y)]) : null,
    session: snap.acquisitionId,
    lock: snap.lockStatus,
    aspect: r4(d.aspect),
    rawPose: d.rawPose,
    stablePose: d.stablePose,
    fingers: d.rawFingerCount,
    fingersLegacy: d.legacyFingerCount,
    fingerStates: snap.fingerStates ? [...snap.fingerStates] : null,
    thumb: d.thumb
      ? {
          legacyRatio: r4(d.thumb.legacyRatio),
          lateral: d.thumb.lateral === null ? null : r4(d.thumb.lateral),
          ipAngleDeg: d.thumb.ipAngleDeg === null ? null : Math.round(d.thumb.ipAngleDeg),
          open: d.thumb.robustOpen,
        }
      : null,
    pinchRatio: snap.pinchRatio === null ? null : r4(snap.pinchRatio),
    r19State: snap.r19.state,
    r19SubClass: snap.r19.subClass,
    vkeyEvent: snap.r19.virtualKey.event,
    r19Probs: snap.r19.probs
      ? {
          ready: r4(snap.r19.probs.ready),
          press: r4(snap.r19.probs.press),
          other: r4(snap.r19.probs.other),
        }
      : null,
    truth,
    reject: snap.rejectionReason,
    action,
  };
}

export class LandmarkRecorder {
  private frames: RecordFrame[] = [];
  private startMs = 0;
  private active = false;
  private truncated = false;
  private mode: "r19-g4-hybrid" = "r19-g4-hybrid";

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
    this.frames.push(buildRecordFrame(snap, landmarks, truth, Math.round(nowMs - this.startMs), commandAtMs));
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
    if (fr.lm !== null && (fr.lm.length !== 21 || fr.lm.some((p) => p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])))) {
      problems.push(`frame ${i}: landmarks`);
    }
    if (
      !(TRUTH_LABELS as readonly string[]).includes(fr.truth) &&
      !(K4V11_TRUTH_LABELS as readonly string[]).includes(fr.truth) &&
      !String(fr.truth).startsWith("TRANSITION_")
    ) {
      problems.push(`frame ${i}: truth label`);
    }
    if (fr.lm === null && fr.action !== "none") problems.push(`frame ${i}: action without a hand`);
    if (fr.r19State !== undefined && !R19_STATES.has(fr.r19State)) problems.push(`frame ${i}: r19State`);
    if (fr.vkeyEvent !== undefined && !VKEY_EVENTS.has(fr.vkeyEvent)) problems.push(`frame ${i}: vkeyEvent`);
    if (
      fr.r19Probs !== undefined &&
      fr.r19Probs !== null &&
      (typeof fr.r19Probs !== "object" ||
        !Number.isFinite(fr.r19Probs.ready) ||
        !Number.isFinite(fr.r19Probs.press) ||
        !Number.isFinite(fr.r19Probs.other))
    ) {
      problems.push(`frame ${i}: r19Probs`);
    }
  });
  if (f.frameCount !== f.frames.length) problems.push("frameCount");
  return problems;
}

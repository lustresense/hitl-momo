/**
 * R18-UX3 Exported Model Integrated Pipeline (sandbox candidate).
 * Combines UX1 geometry/plausibility/VirtualKeyFSM/action guards + exported UX3 MLP probabilities.
 */
import {
  SafeSwipeGuard,
  VirtualKeySteeringFSM,
  indexPointAngleAspect,
  isPlausibleHandSkeleton,
  isSafeEraseFrame,
  isSafePinchFrame,
  type VirtualKeyConfig,
} from "./ux1_candidates";
import { UX3_LABELS, Ux3FeatureTracker, type Ux3Label } from "./ux3_features";
import { Ux3Classifier, type Ux3ExportedModel } from "./ux3_model";
import { fingerDiagnosticStates, withAspect, type HandPose } from "../repo/frontend/implementation/src/input/hand-gesture";
import type { DirectionInput, SteerZone } from "../repo/frontend/implementation/src/input/gameplay-gesture";
import type { Landmark } from "../repo/frontend/implementation/src/input/types";

const NO_INPUT: DirectionInput = { left: false, right: false, jump: false };
const IDX_MAP = Object.fromEntries(UX3_LABELS.map((l, i) => [l, i])) as Record<Ux3Label, number>;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export interface Ux3PointingParams {
  tauPoint1f: number;
  tauEmaFloor: number;
  emaAlpha: number;
  vetoOpenPalm: boolean;
}

export const DEFAULT_UX3_POINT_PARAMS: Ux3PointingParams = {
  tauPoint1f: 0.55,
  tauEmaFloor: 0.45,
  emaAlpha: 0.65,
  vetoOpenPalm: true,
};

/**
 * Calibrated neural pointing intent gate.
 * Requires skeleton plausibility + valid aspect-corrected ray + physical non-open/non-pinch
 * AND exported MLP P(POINT_1F) dominance.
 */
export function isUx3IntentionalPointing(
  lm: Landmark[],
  probs: number[],
  p1fEma: number,
  aspect: number,
  params: Ux3PointingParams = DEFAULT_UX3_POINT_PARAMS,
): { ok: boolean; reason: string; angle: number | null } {
  const ang = indexPointAngleAspect(lm, aspect);
  if (ang === null) return { ok: false, reason: "short-vector", angle: null };
  if (!isPlausibleHandSkeleton(lm, aspect)) return { ok: false, reason: "implausible-skeleton", angle: null };

  const g = withAspect(lm, aspect);
  const w = g[0]!;
  const palmScale = Math.max(dist(w, g[9]!), dist(g[5]!, g[17]!));
  if (dist(g[5]!, g[8]!) < 0.18 * palmScale) return { ok: false, reason: "foreshortened-index", angle: null };

  const pinchRatio = dist(g[4]!, g[8]!) / palmScale;
  const idxReach = dist(g[8]!, w);
  const thumbReach = dist(g[4]!, w);
  if (pinchRatio < 0.22 || (pinchRatio < 0.30 && idxReach <= thumbReach * 1.15)) {
    return { ok: false, reason: "pinching", angle: null };
  }

  if (params.vetoOpenPalm) {
    const states = fingerDiagnosticStates(g);
    if (states) {
      const extCount = states.filter((s) => s === "extended").length;
      if (extCount >= 4) return { ok: false, reason: "open-palm", angle: null };
    }
  }

  const p1f = probs[IDX_MAP.POINT_1F]!;
  const p2f = probs[IDX_MAP.POINT_2F]!;
  const pNog = probs[IDX_MAP.NOG]!;
  if (p1f < params.tauPoint1f && (p1fEma < params.tauPoint1f || p1f < params.tauEmaFloor)) {
    return { ok: false, reason: "low-p1f", angle: null };
  }
  if (p1f <= p2f || p1f <= pNog * 0.90) {
    return { ok: false, reason: "non-1f-dominant", angle: null };
  }
  return { ok: true, reason: "ok", angle: ang };
}

/** Hybrid Erase guard: requires UX1 5-finger geometry AND rejects confident resting/throw noise + rapid hand jitter. */
export function isUx3SafeEraseFrame(lm: Landmark[], probs: number[], aspect: number, feats?: number[]): boolean {
  if (!isSafeEraseFrame(lm, aspect)) return false;
  // IPN HandS has no static FIVE class (open static palm maps partly to GRAB_FIST/OPEN_ZOOM/1F/2F),
  // so only veto Erase via calibrated NOG / THROW_SWIPE confidence or high motion jitter (feature 60/67).
  if (probs[IDX_MAP.NOG]! >= 0.50 || probs[IDX_MAP.THROW_SWIPE]! >= 0.45) return false;
  if (feats && feats.length >= 68 && feats[59]! > 0.5) {
    const wristSpeed = feats[60]!;
    const shapeJitter = feats[67]!;
    if (wristSpeed > 1.3 || shapeJitter > 0.9) return false;
  }
  return true;
}

/** Hybrid Pinch guard: preserves static close pinch sensitivity while suppressing unambiguous SWIPE/2F/GRAB noise. */
export function isUx3SafePinchFrame(lm: Landmark[], probs: number[], pinchHeld: boolean, aspect: number): boolean {
  if (!isSafePinchFrame(lm, pinchHeld, aspect)) return false;
  if (probs[IDX_MAP.THROW_SWIPE]! >= 0.60 || probs[IDX_MAP.POINT_2F]! >= 0.70 || probs[IDX_MAP.GRAB_FIST]! >= 0.75) {
    return false;
  }
  return true;
}

/** Unified frame-by-frame runtime pipeline combining feature tracker, exported MLP, VirtualKey FSM, and safety guards. */
export class Ux3RuntimePipeline {
  readonly clf: Ux3Classifier;
  readonly tracker = new Ux3FeatureTracker();
  readonly steerFsm: VirtualKeySteeringFSM;
  readonly swipeGuard = new SafeSwipeGuard();
  private p1fEma = 0;
  private eraseStreak = 0;
  private pinchHeld = false;

  constructor(
    modelJson: Ux3ExportedModel,
    readonly aspect: number = 4 / 3,
    readonly pointParams: Ux3PointingParams = DEFAULT_UX3_POINT_PARAMS,
    fsmOverrides?: Partial<VirtualKeyConfig>,
  ) {
    this.clf = new Ux3Classifier(modelJson);
    this.steerFsm = new VirtualKeySteeringFSM({
      pointingPolicy: "P1_aspect", // Gated explicitly BEFORE FSM via isUx3IntentionalPointing
      jumpPolicy: "J2_edge",
      aspect,
      dwellMs: 50,
      oppositeDwellMs: 66,
      rearmFrames: 3,
      hysteresisDeg: 5,
      ...fsmOverrides,
    });
  }

  reset(): void {
    this.tracker.reset();
    this.steerFsm.reset();
    this.swipeGuard.reset();
    this.p1fEma = 0;
    this.eraseStreak = 0;
    this.pinchHeld = false;
  }

  onPhaseChange(): void {
    this.steerFsm.onPhaseChange();
  }

  step(
    lm: Landmark[] | undefined,
    nowMs: number,
    revPose: HandPose,
    palmCenterX: number,
    palmCenterY: number,
    palmScale: number,
  ): {
    probs: number[] | null;
    topLabel: Ux3Label | "NONE";
    steer: { tracked: boolean; pointingOk: boolean; zone: SteerZone; input: DirectionInput; angle: number | null };
    eraseActive: boolean;
    pinchActive: boolean;
    swipeAction: "undo" | "redo" | null;
  } {
    if (!lm || lm.length < 21) {
      this.tracker.reset();
      this.p1fEma = 0;
      this.eraseStreak = 0;
      this.pinchHeld = false;
      this.swipeGuard.reset();
      const s = this.steerFsm.update(undefined, nowMs);
      return {
        probs: null,
        topLabel: "NONE",
        steer: { tracked: false, pointingOk: false, zone: s.zone, input: s.input, angle: null },
        eraseActive: false,
        pinchActive: false,
        swipeAction: null,
      };
    }

    const feats = this.tracker.extract(lm, nowMs, this.aspect);
    if (!feats) {
      this.p1fEma = 0;
      this.eraseStreak = 0;
      this.pinchHeld = false;
      this.swipeGuard.reset();
      const s = this.steerFsm.update(undefined, nowMs);
      return {
        probs: null,
        topLabel: "NONE",
        steer: { tracked: false, pointingOk: false, zone: s.zone, input: s.input, angle: null },
        eraseActive: false,
        pinchActive: false,
        swipeAction: null,
      };
    }

    const pred = this.clf.predict(feats, 0);
    const probs = pred.probs;
    this.p1fEma = this.pointParams.emaAlpha * probs[IDX_MAP.POINT_1F]! + (1 - this.pointParams.emaAlpha) * this.p1fEma;

    const pt = isUx3IntentionalPointing(lm, probs, this.p1fEma, this.aspect, this.pointParams);
    // Feed VirtualKeySteeringFSM: pass non-pointing stub when UX3 pointing gate declines
    let steerOut: { tracked: boolean; pointingOk: boolean; zone: SteerZone; input: DirectionInput; angle: number | null };
    if (!pt.ok) {
      // Trigger non-pointing fail-safe release without resetting NO_HAND state incorrectly
      const s = this.steerFsm.update(
        Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
        nowMs,
      );
      steerOut = { tracked: true, pointingOk: false, zone: s.zone, input: { ...NO_INPUT }, angle: null };
    } else {
      const s = this.steerFsm.update(lm, nowMs);
      steerOut = { tracked: s.tracked, pointingOk: s.pointingOk, zone: s.zone, input: s.input, angle: s.angle };
    }

    if (isUx3SafeEraseFrame(lm, probs, this.aspect, feats)) {
      this.eraseStreak++;
    } else {
      this.eraseStreak = 0;
    }
    const eraseActive = this.eraseStreak >= 4;

    const pinchOk = isUx3SafePinchFrame(lm, probs, this.pinchHeld, this.aspect);
    this.pinchHeld = pinchOk;

    // Suppress swipe unless model is NOT strongly asserting static/resting NOG noise
    const swipeRaw = this.swipeGuard.feed(revPose, palmCenterX * this.aspect, palmCenterY, palmScale, nowMs);
    const swipeAction = swipeRaw && probs[IDX_MAP.NOG]! < 0.70 ? swipeRaw : null;

    return {
      probs,
      topLabel: pred.label as Ux3Label,
      steer: steerOut,
      eraseActive,
      pinchActive: pinchOk,
      swipeAction,
    };
  }
}

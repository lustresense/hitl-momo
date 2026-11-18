/**
 * R19 Stage P3 — Hybrid `G4` Integrated Pipeline (`G1` Geometry + Exported Calibrated MLP + `PistolVirtualKeyFSM`).
 *
 * Combines:
 *  - Pure R19 causal feature extraction (`R19FeatureTracker`, 82 dims)
 *  - Exported calibrated classifier (`R19Classifier`: LR or ReLU MLP `<= 200 KB`)
 *  - `G1` geometric safety barriers (skeleton plausibility, pinch guard, thumb-up guard, non-pointing rejection)
 *    while allowing calibrated MLP probability rescue on borderline dorsal/pitched Pistol (`POINT_PRESS`) frames
 *  - `PistolVirtualKeyFSM` (`J3_pulse_consumed`, `RIGHT -> RIGHT+JUMP -> RIGHT` horizontal continuity, phase barrier)
 *  - R18 action safety guards (`isSafeEraseFrame`, `isSafePinchFrame`, `SafeSwipeGuard`) vetoed against false triggers
 */
import type { DirectionInput, Landmark, SteerZone } from "./pistol_types";
import { SafeSwipeGuard, isSafeEraseFrame, isSafePinchFrame, type HandPose } from "./r19_safety_guards";
import { classifyPistolGeometry, type PistolClassification, type PistolGeometricState } from "./pistol_geometry";
import { DEFAULT_PISTOL_FSM_CONFIG, PistolVirtualKeyFSM, type PistolFsmConfig, type PistolFsmStep } from "./pistol_fsm";
import { R19_LABELS, R19FeatureTracker, type R19Label } from "./r19_features";
import { R19Classifier, type R19ExportedModel } from "./r19_model";

const NO_INPUT: DirectionInput = { left: false, right: false, jump: false };

export interface R19HybridParams {
  /** Minimum calibrated P(POINT_PRESS) (or EMA) required to sustain/promote PRESS. */
  tauPress: number;
  /** Soft rescue floor when G1 fell back to POINT_READY under dorsal/pitch roll. */
  tauPressRescue: number;
  /** Maximum P(OTHER) allowed before vetoing G1 PRESS into OTHER. */
  otherVetoTau: number;
  /** Minimum geometric P(POINT_READY)+P(POINT_PRESS) pointing signal to prevent non-pointing steer. */
  tauPointAny: number;
  /** Exponential moving average alpha for P(POINT_PRESS) across frames. */
  emaAlpha: number;
  /** Whether to require G1 pure thumbOpen OR allow soft dorsal rescue within geometric bounds. */
  allowSoftDorsalRescue: boolean;
}

export const DEFAULT_R19_HYBRID_PARAMS: R19HybridParams = {
  tauPress: 0.38,
  tauPressRescue: 0.60,
  otherVetoTau: 0.72,
  tauPointAny: 0.40,
  emaAlpha: 0.68,
  allowSoftDorsalRescue: true,
};

function idxOf(labels: string[], target: R19Label): number {
  const i = labels.indexOf(target);
  return i >= 0 ? i : R19_LABELS.indexOf(target);
}

/**
 * Resolve frame-level `G4` Pistol state from geometry + calibrated MLP probabilities.
 * Keeps `G1` pinch/thumb-up/fist/multi-finger barriers sacred while letting calibrated MLP
 * veto tabletop distractors and rescue borderline dorsal/foreshortened `POINT_PRESS`.
 */
export function resolveHybridPistolClassification(
  lm: Landmark[],
  probs: number[],
  labels: string[],
  pressEma: number,
  aspect: number,
  params: R19HybridParams = DEFAULT_R19_HYBRID_PARAMS,
): PistolClassification {
  const g1 = classifyPistolGeometry(lm, aspect);
  if (g1.subClass === "degenerate" || !g1.metrics || !g1.metrics.plausible) return g1;

  // Hard geometric safety barriers never bypassed by MLP logits
  if (
    g1.subClass === "pinch" ||
    g1.subClass === "thumb-up" ||
    g1.subClass === "fist" ||
    g1.subClass === "two-fingers" ||
    g1.subClass === "three" ||
    g1.subClass === "four" ||
    g1.subClass === "five"
  ) {
    return g1;
  }

  const iReady = idxOf(labels, "POINT_READY");
  const iPress = idxOf(labels, "POINT_PRESS");
  const iOther = idxOf(labels, "OTHER");
  const pReady = probs[iReady] ?? 0;
  const pPress = probs[iPress] ?? 0;
  const pOther = probs[iOther] ?? 0;
  const pPointAny = pReady + pPress;

  // Ambiguous finger posture (`g1.subClass === "unknown"`) can promote only if index is straight,
  // zero other fingers are extended, non-pinch, and MLP strongly confirms PRESS.
  const m = g1.metrics;
  const noOtherExtended = !m.middle.isExtended && !m.ring.isExtended && !m.pinky.isExtended;

  if (g1.state === "POINT_PRESS") {
    if (pOther >= params.otherVetoTau && pressEma < params.tauPressRescue) {
      return { state: "OTHER", subClass: "unknown", reason: "mlp-other-veto", angle: null, metrics: m };
    }
    if (pPress >= params.tauPress || pressEma >= params.tauPress) {
      return g1;
    }
    // High confidence that thumb is actually folded -> downgrade PRESS to READY safely
    if (pReady > pPress + 0.25 && m.d4_5 < 0.48) {
      return { state: "POINT_READY", subClass: "ready", reason: "mlp-ready-downgrade", angle: g1.angle, metrics: m };
    }
    return g1;
  }

  if (g1.state === "POINT_READY") {
    if (pOther >= params.otherVetoTau && pPointAny < params.tauPointAny) {
      return { state: "OTHER", subClass: "unknown", reason: "mlp-other-veto-ready", angle: null, metrics: m };
    }
    if (
      params.allowSoftDorsalRescue &&
      g1.angle !== null &&
      m.d4_8 >= 0.42 &&
      m.d4_5 >= 0.30 &&
      m.d4_9 >= 0.36 &&
      (pPress >= params.tauPressRescue || (pPress >= 0.55 && pressEma >= 0.55)) &&
      pPress > pReady + 0.12 &&
      pOther < 0.45
    ) {
      return { state: "POINT_PRESS", subClass: "pistol", reason: "mlp-dorsal-rescue", angle: g1.angle, metrics: m };
    }
    return g1;
  }

  // g1.state === "OTHER" && subClass === "unknown"
  if (
    params.allowSoftDorsalRescue &&
    m.indexStraight &&
    noOtherExtended &&
    !m.isPinch &&
    g1.angle !== null &&
    m.d4_8 >= 0.45 &&
    m.d4_5 >= 0.34 &&
    m.d4_9 >= 0.42 &&
    pPress >= params.tauPressRescue &&
    pOther < 0.35
  ) {
    return { state: "POINT_PRESS", subClass: "pistol", reason: "mlp-unknown-rescue", angle: g1.angle, metrics: m };
  }
  return g1;
}

export class R19RuntimePipeline {
  readonly clf: R19Classifier;
  readonly tracker = new R19FeatureTracker();
  readonly fsm: PistolVirtualKeyFSM;
  readonly swipeGuard = new SafeSwipeGuard();
  private pressEma = 0;
  private eraseStreak = 0;
  private pinchHeld = false;

  constructor(
    modelJson: R19ExportedModel,
    readonly aspect: number = DEFAULT_PISTOL_FSM_CONFIG.aspect,
    readonly hybridParams: R19HybridParams = DEFAULT_R19_HYBRID_PARAMS,
    fsmOverrides?: Partial<PistolFsmConfig>,
  ) {
    this.clf = new R19Classifier(modelJson);
    this.fsm = new PistolVirtualKeyFSM({ aspect, ...fsmOverrides });
  }

  reset(): void {
    this.tracker.reset();
    this.fsm.reset();
    this.swipeGuard.reset();
    this.pressEma = 0;
    this.eraseStreak = 0;
    this.pinchHeld = false;
  }

  onPhaseChange(): void {
    this.fsm.onPhaseChange();
  }

  notifyJumpConsumed(): void {
    this.fsm.notifyJumpConsumed();
  }

  step(
    lm: Landmark[] | undefined,
    nowMs: number,
    revPose: HandPose = "none",
    palmCenterX = 0,
    palmCenterY = 0,
    palmScale = 0,
  ): {
    probs: number[] | null;
    topLabel: R19Label | "NONE";
    geomState: PistolGeometricState;
    hybridCls: PistolClassification | null;
    fsm: PistolFsmStep;
    steer: { tracked: boolean; pointingOk: boolean; zone: SteerZone; input: DirectionInput; angle: number | null };
    eraseActive: boolean;
    pinchActive: boolean;
    swipeAction: "undo" | "redo" | null;
  } {
    if (!lm || lm.length < 21) {
      this.tracker.reset();
      this.pressEma = 0;
      this.eraseStreak = 0;
      this.pinchHeld = false;
      this.swipeGuard.reset();
      const fsmStep = this.fsm.update(undefined, nowMs);
      return {
        probs: null,
        topLabel: "NONE",
        geomState: "OTHER",
        hybridCls: null,
        fsm: fsmStep,
        steer: { tracked: false, pointingOk: false, zone: "stop", input: { ...NO_INPUT }, angle: null },
        eraseActive: false,
        pinchActive: false,
        swipeAction: null,
      };
    }

    const feats = this.tracker.extract(lm, nowMs, this.aspect);
    if (!feats) {
      this.pressEma = 0;
      this.eraseStreak = 0;
      this.pinchHeld = false;
      this.swipeGuard.reset();
      const fsmStep = this.fsm.update(undefined, nowMs);
      return {
        probs: null,
        topLabel: "NONE",
        geomState: "OTHER",
        hybridCls: null,
        fsm: fsmStep,
        steer: { tracked: false, pointingOk: false, zone: "stop", input: { ...NO_INPUT }, angle: null },
        eraseActive: false,
        pinchActive: false,
        swipeAction: null,
      };
    }

    const pred = this.clf.predict(feats, 0);
    const probs = pred.probs;
    const pPress = probs[idxOf(this.clf.labels, "POINT_PRESS")] ?? 0;
    const pOther = probs[idxOf(this.clf.labels, "OTHER")] ?? 0;
    this.pressEma = this.hybridParams.emaAlpha * pPress + (1 - this.hybridParams.emaAlpha) * this.pressEma;

    const hybridCls = resolveHybridPistolClassification(
      lm,
      probs,
      this.clf.labels,
      this.pressEma,
      this.aspect,
      this.hybridParams,
    );
    const fsmStep = this.fsm.update(lm, nowMs, hybridCls);

    if (isSafeEraseFrame(lm, this.aspect) && hybridCls.subClass !== "pistol" && hybridCls.subClass !== "ready") {
      this.eraseStreak++;
    } else {
      this.eraseStreak = 0;
    }
    const eraseActive = this.eraseStreak >= 4;

    const pinchOk = isSafePinchFrame(lm, this.pinchHeld, this.aspect) && hybridCls.state === "OTHER";
    this.pinchHeld = pinchOk;

    const swipeRaw = this.swipeGuard.feed(revPose, palmCenterX * this.aspect, palmCenterY, palmScale, nowMs);
    const swipeAction = swipeRaw && hybridCls.state === "OTHER" && pOther >= 0.25 ? swipeRaw : null;

    return {
      probs,
      topLabel: pred.label as R19Label,
      geomState: hybridCls.state,
      hybridCls,
      fsm: fsmStep,
      steer: {
        tracked: fsmStep.tracked,
        pointingOk: fsmStep.geomState === "POINT_PRESS",
        zone: fsmStep.zone,
        input: fsmStep.input,
        angle: fsmStep.angle,
      },
      eraseActive,
      pinchActive: pinchOk,
      swipeAction,
    };
  }
}

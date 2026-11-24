/**
 * Trial aggregation for the NUI Lab benchmark (Contract K8, B09, E05).
 * ONE implementation is used live (dashboard), at trial end (stored summary), and when an exported file is
 * re-analysed, so a stored summary can always be re-derived from raw records.
 *
 * Strict E05 / A06 / B06 rules:
 *  - Separates `rawNoHandRate` from `activeWindowMissRate` (between first & last detected hand in each segment,
 *    excluding lead-in and tail absence).
 *  - Breaks down active-window no-hand streaks into `<= 3` flicker, `4..15` short loss, and `> 15` long absence.
 *  - NEVER derives accuracy, precision, recall, confusion matrix, or `falsePressFrames: 0` from model predictions
 *    or `UNLABELLED` user frames! When independent GT is absent, `independentGroundTruthAvailable` is `false` and
 *    supervised fields remain `null`, reporting action-level invariants/proxies only.
 */
import {
  R22_BLUR_SHARPNESS_WARN_MIN,
  R22_DIM_RECOVERY_LUMA,
  R22_GLARE_NEAR_WHITE_WARN_PCT,
  R22_NOISE_MAD_WARN_MAX,
} from "./r20-lowlight";
import type {
  ActiveWindowSummary,
  BenchEvent,
  BenchFrameInput,
  LabelSource,
  PerfSample,
  Quantiles,
  TrialSummary,
} from "./schema";

export function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const v = sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
  return v;
}

const r3 = (v: number | null): number | null => (v === null ? null : Math.round(v * 1000) / 1000);

export class Samples {
  private v: number[] = [];
  push(x: number | null | undefined): void {
    if (typeof x === "number" && Number.isFinite(x)) this.v.push(x);
  }
  get count(): number {
    return this.v.length;
  }
  quantiles(): Quantiles {
    if (this.v.length === 0) return { n: 0, mean: null, p50: null, p95: null, max: null };
    const s = [...this.v].sort((a, b) => a - b);
    const sum = s.reduce((a, b) => a + b, 0);
    return {
      n: s.length,
      mean: r3(sum / s.length),
      p50: r3(quantile(s, 0.5)),
      p95: r3(quantile(s, 0.95)),
      max: r3(s[s.length - 1]!),
    };
  }
}

/** Truth labels for which a POINT_PRESS prediction is wrong when genuine external/tester GT is present. */
export const EXPECT_NOT_PRESS: ReadonlySet<string> = new Set([
  "POINT_READY",
  "OTHER",
  "POINT_RELEASE",
  "THREE",
  "FIVE",
  "PINCH_NEAR",
  "PINCH_TOUCH",
  "NO_GESTURE",
  "NO_LANDMARK",
]);
const UNLABELLED_LIKE: ReadonlySet<string> = new Set(["UNLABELLED", "TRANSITION"]);

const inc = (m: Record<string, number>, k: string, by = 1): void => {
  m[k] = (m[k] ?? 0) + by;
};

/**
 * Derives rule-based sensor condition tags (E03). These are strictly `RULE_DERIVED` post-AE proxies,
 * NEVER ground-truth room lighting measurements.
 */
export function deriveConditionTags(q: {
  lumaP50: number | null;
  lumaP95: number | null;
  nearWhiteHandPct: number | null;
  blurProxy: number | null;
  noiseProxy: number | null;
  backlight: boolean;
}): string[] {
  const tags: string[] = [];
  if (q.lumaP50 !== null && q.lumaP50 < R22_DIM_RECOVERY_LUMA) tags.push("DIM_CANDIDATE");
  if (q.backlight) tags.push("BACKLIGHT_CANDIDATE");
  // R22B B7.1 recalibration: GLARE_CANDIDATE = nearWhiteHandPct >= 25% (removed p95 >= 0.94 which fired on ~99% of frames).
  if (q.nearWhiteHandPct !== null && q.nearWhiteHandPct >= R22_GLARE_NEAR_WHITE_WARN_PCT) {
    tags.push("GLARE_CANDIDATE");
  }
  if (q.blurProxy !== null && q.blurProxy < R22_BLUR_SHARPNESS_WARN_MIN) tags.push("BLUR_CANDIDATE");
  if (q.noiseProxy !== null && q.noiseProxy >= R22_NOISE_MAD_WARN_MAX) tags.push("NOISE_CANDIDATE");
  return tags;
}

interface SegmentPoint {
  t: number;
  hasHand: boolean;
  hidden: boolean;
  bystanderAmbiguous: boolean;
  ownerReject: boolean;
}

function emptyActiveWindow(): ActiveWindowSummary {
  return {
    frames: 0,
    durationMs: 0,
    missFrames: 0,
    missRate: null,
    leadInNoHandFrames: 0,
    tailNoHandFrames: 0,
    flickerStreaks_1_3: 0,
    shortLossStreaks_4_15: 0,
    longAbsenceStreaks_gt15: 0,
    flickerFrames_1_3: 0,
    shortLossFrames_4_15: 0,
    longAbsenceFrames_gt15: 0,
  };
}

function accumulateSegmentActiveWindow(
  seg: SegmentPoint[],
  out: ActiveWindowSummary,
  breakdown: { activeWindowUnknownMissFrames: number },
): void {
  if (seg.length === 0) return;
  let firstHand = -1;
  let lastHand = -1;
  for (let i = 0; i < seg.length; i++) {
    if (seg[i]!.hasHand) {
      if (firstHand === -1) firstHand = i;
      lastHand = i;
    }
  }
  if (firstHand === -1) {
    out.leadInNoHandFrames += seg.length;
    return;
  }
  out.leadInNoHandFrames += firstHand;
  out.tailNoHandFrames += seg.length - 1 - lastHand;
  const core = seg.slice(firstHand, lastHand + 1);
  out.frames += core.length;
  out.durationMs += Math.max(0, Math.round(core[core.length - 1]!.t - core[0]!.t));

  let streak = 0;
  const flushStreak = () => {
    if (streak === 0) return;
    out.missFrames += streak;
    if (streak <= 3) {
      out.flickerStreaks_1_3++;
      out.flickerFrames_1_3 += streak;
    } else if (streak <= 15) {
      out.shortLossStreaks_4_15++;
      out.shortLossFrames_4_15 += streak;
    } else {
      out.longAbsenceStreaks_gt15++;
      out.longAbsenceFrames_gt15 += streak;
    }
    streak = 0;
  };

  for (const pt of core) {
    if (!pt.hasHand) {
      streak++;
      if (!pt.hidden && !pt.bystanderAmbiguous && !pt.ownerReject) {
        breakdown.activeWindowUnknownMissFrames++;
      }
    } else {
      flushStreak();
    }
  }
  flushStreak();
}

export class TrialAggregator {
  readonly trialId: string;
  private endReason: string | null = null;
  private readonly route: string | null = null;
  private frames = 0;
  private handFrames = 0;
  private missFrames = 0;
  private rawNoHandFrames = 0;
  private lockedFrames = 0;
  private handLoss = 0;
  private reacq = 0;
  private prevLock: string | null = null;
  private prevAcq: number | null = null;
  private firstT: number | null = null;
  private lastT: number | null = null;
  private durAcc = 0;
  private stepsAcc = 0;
  private segFrames = 0;
  private currentSeg: SegmentPoint[] = [];
  private closedActiveWindow = emptyActiveWindow();
  private closedActiveUnknownMiss = 0;

  private hiddenFrames = 0;
  private hiddenDurationMs = 0;
  private bystanderAmbiguousFrames = 0;
  private ownerRejectFrames = 0;
  private missReasons: Record<string, number> = {};

  private duplicateSkipped = 0;
  private droppedBusy = 0;
  private initSetOptions = 0;
  private runtimeSetOptions = 0;
  private uniqueCaptureFpsS = new Samples();
  private frameAgeS = new Samples();

  private handHist: Record<string, number> = {};
  private rejects: Record<string, number> = {};
  private passes: Record<string, number> = {};
  private mp = new Samples();
  private pre = new Samples();
  private cls = new Samples();
  private pipe = new Samples();
  private lumaS = new Samples();
  private lumaP10S = new Samples();
  private lumaP50S = new Samples();
  private lumaP95S = new Samples();
  private nearWhiteS = new Samples();
  private blurS = new Samples();
  private noiseS = new Samples();
  private backlight = 0;
  private conditionTags = new Set<string>();

  private keydown = 0;
  private keyup = 0;
  private relAll = 0;
  private held = 0;
  private datasetGtFrames = 0;
  private labelled = 0;
  private falsePress = 0;
  private missedPress = 0;
  private confusion: Record<string, Record<string, number>> = {};

  private noHandActions = 0;
  private nearPinchStrokeStarts = 0;
  private pistolRejectsOnCanvas = 0;
  private predictionDist: Record<string, number> = {};
  private labelSourceCounts: Record<string, number> = {};

  private strokes = 0;
  private strokePts = new Samples();
  private strokePath = new Samples();
  private strokeDur = new Samples();
  private unexpectedBreaks = 0;
  private gapDuringStroke = 0;
  private continuedAfterGrace = 0;
  private strokeGapEvents = 0;
  private strokeEndReasons: Record<string, number> = {};
  private strokeGapReasons: Record<string, number> = {};
  private erases = 0;
  private eraseHits = 0;
  private eraseMisses = 0;
  private undo = 0;
  private redo = 0;
  private undoVia: Record<string, number> = {};
  private redoVia: Record<string, number> = {};
  private rejected = 0;
  private actionRejectedReasons: Record<string, number> = {};
  private pointerStrokes = 0;
  private gestureStrokes = 0;
  private actionLat = new Samples();
  private jRaw = new Samples();
  private jInk = new Samples();
  private inStroke = false;
  private warnings = new Set<string>();

  constructor(trialId: string, endReason: string | null = null, route: string | null = null) {
    this.trialId = trialId;
    this.endReason = endReason;
    this.route = route;
  }

  setEndReason(reason: string | null): void {
    this.endReason = reason;
  }

  /** Called between trials when one aggregator spans several (group totals): continuity state must not leak across. */
  breakContinuity(): void {
    if (this.firstT !== null && this.lastT !== null) {
      this.durAcc += Math.max(0, this.lastT - this.firstT);
      this.stepsAcc += Math.max(0, this.segFrames - 1);
    }
    const extra = { activeWindowUnknownMissFrames: 0 };
    accumulateSegmentActiveWindow(this.currentSeg, this.closedActiveWindow, extra);
    this.closedActiveUnknownMiss += extra.activeWindowUnknownMissFrames;
    this.currentSeg = [];
    this.firstT = null;
    this.lastT = null;
    this.segFrames = 0;
    this.prevLock = null;
    this.prevAcq = null;
    this.inStroke = false;
  }

  addFrame(f: BenchFrameInput): void {
    this.frames++;
    this.segFrames++;
    if (this.firstT === null) this.firstT = f.t;
    this.lastT = f.t;

    const hasHand = f.det === "HAND";
    const hasDetectorHand = f.hands > 0 || hasHand;
    if (hasHand) this.handFrames++;
    else this.missFrames++;
    if (!hasDetectorHand) this.rawNoHandFrames++;

    const trackingState = f.trackingState ?? (hasHand ? (f.lock === "locked" ? "LOCKED" : "ACQUIRING") : "NO_HAND");
    const hidden = trackingState === "HIDDEN" || f.missReason === "tab-hidden";
    const bystanderAmbiguous =
      trackingState === "AMBIGUOUS_HOLD" ||
      f.missReason === "ambiguous-two-hands" ||
      f.lock === "ambiguous" ||
      (!hasDetectorHand && f.hands >= 2);
    const ownerReject =
      f.missReason === "owner-jump-reject" ||
      f.missReason === "owner-size-reject";

    if (hidden) this.hiddenFrames++;
    if (bystanderAmbiguous) this.bystanderAmbiguousFrames++;
    if (ownerReject) this.ownerRejectFrames++;
    if (!hasDetectorHand) {
      const mReason = f.missReason ?? (hidden ? "tab-hidden" : bystanderAmbiguous ? "ambiguous-two-hands" : "no-hand");
      inc(this.missReasons, mReason);
    }

    this.currentSeg.push({
      t: f.t,
      hasHand: hasDetectorHand,
      hidden,
      bystanderAmbiguous,
      ownerReject,
    });

    inc(this.handHist, String(f.hands));
    inc(this.rejects, f.reject || "—");
    const pass = f.preprocessPass ?? f.luma.pass ?? "—";
    inc(this.passes, pass);

    if (f.lock === "locked") this.lockedFrames++;
    if (this.prevLock === "locked" && f.lock !== "locked") this.handLoss++;
    if (this.prevAcq !== null && f.session > this.prevAcq) this.reacq++;
    this.prevLock = f.lock;
    this.prevAcq = f.session;

    this.mp.push(f.timing.mpMs);
    this.pre.push(f.timing.preMs);
    this.cls.push(f.timing.classifierMs);
    this.pipe.push(f.timing.pipelineMs);

    const lMean = f.luma.mean;
    const lP10 = f.lumaP10 ?? f.luma.p10 ?? null;
    const lP50 = f.lumaP50 ?? f.luma.p50 ?? lMean;
    const lP95 = f.lumaP95 ?? f.luma.p95 ?? null;
    const nwHand = hasHand ? (f.nearWhiteHandPct ?? f.luma.nearWhiteHandPct ?? null) : null;
    const blur = f.blurProxy ?? f.luma.blurProxy ?? null;
    const noise = f.noiseProxy ?? f.luma.noiseProxy ?? null;
    const isBacklight = Boolean(f.backlightCandidate ?? f.luma.backlight);

    this.lumaS.push(lMean);
    this.lumaP10S.push(lP10);
    this.lumaP50S.push(lP50);
    this.lumaP95S.push(lP95);
    this.nearWhiteS.push(nwHand);
    this.blurS.push(blur);
    this.noiseS.push(noise);
    if (isBacklight) this.backlight++;

    const frameTags =
      f.captureQualityTags && f.captureQualityTags.length > 0
        ? f.captureQualityTags
        : deriveConditionTags({
            lumaP50: lP50,
            lumaP95: lP95,
            nearWhiteHandPct: nwHand,
            blurProxy: blur,
            noiseProxy: noise,
            backlight: isBacklight,
          });
    for (const tag of frameTags) this.conditionTags.add(tag);

    this.duplicateSkipped += f.framesSkippedDuplicate ?? 0;
    this.droppedBusy += f.droppedSincePrev ?? 0;
    this.initSetOptions = Math.max(this.initSetOptions, f.initSetOptionsCalls ?? 0);
    this.runtimeSetOptions += f.runtimeSetOptionsCalls ?? 0;
    if (typeof f.uniqueCaptureFps === "number" && f.uniqueCaptureFps > 0) {
      this.uniqueCaptureFpsS.push(f.uniqueCaptureFps);
    }
    this.frameAgeS.push(f.frameAgeMs);

    if (f.vkeyEvent === "HELD") this.held++;
    if (f.jitter) {
      this.jRaw.push(f.jitter.raw);
      this.jInk.push(f.jitter.ink);
    }
    if (this.inStroke && f.det === "DETECTOR_MISS") this.gapDuringStroke++;

    // Action invariants & provenance (never claims accuracy without GT)
    if (!hasHand && (f.action !== "none" || f.vkeyEvent === "KEYDOWN" || f.vkeyEvent === "HELD")) {
      this.noHandActions++;
    }
    if (f.pinchRatio !== null && f.pinchRatio > 0.3 && f.pinchRatio <= 0.5 && f.action === "draw") {
      this.nearPinchStrokeStarts++;
    }
    if (
      this.route === "canvas" &&
      (f.reject === "Mode pistol aktif: tinta dinonaktifkan" || f.reject === "Cubit ditolak gate R19")
    ) {
      this.pistolRejectsOnCanvas++;
    }
    const posePred = f.posePred ?? (f.r19State !== "NO_HAND" ? f.r19State : f.stablePose || "NO_HAND");
    inc(this.predictionDist, posePred);
    const labelSrc: LabelSource = f.labelSource ?? "UNKNOWN";
    inc(this.labelSourceCounts, labelSrc);

    const truthSource = f.labelSources?.truth;
    const isSelfPredAsGt = truthSource === "MODEL_PREDICTION" || truthSource === "RULE_DERIVED";
    if (!UNLABELLED_LIKE.has(f.truth) && !String(f.truth).startsWith("TRANSITION_") && !f.truthMasked && !isSelfPredAsGt) {
      if (truthSource === "DATASET_GT") this.datasetGtFrames++;
      this.labelled++;
      const row = (this.confusion[f.truth] ??= {});
      inc(row, f.r19State);
      if (EXPECT_NOT_PRESS.has(f.truth) && f.r19State === "POINT_PRESS") this.falsePress++;
      if (f.truth === "POINT_PRESS" && f.r19State !== "POINT_PRESS") this.missedPress++;
    }
  }

  addEvent(e: BenchEvent): void {
    const d = e.data ?? {};
    switch (e.type) {
      case "VISIBILITY_VISIBLE":
        if (typeof d.hiddenDurationMs === "number" && Number.isFinite(d.hiddenDurationMs) && d.hiddenDurationMs > 0) {
          this.hiddenDurationMs += d.hiddenDurationMs;
        }
        break;
      case "KEYDOWN":
        this.keydown++;
        break;
      case "KEYUP":
        this.keyup++;
        break;
      case "RELEASE_ALL":
        this.relAll++;
        break;
      case "STROKE_START":
        this.inStroke = true;
        if (typeof d.latencyMs === "number") this.actionLat.push(d.latencyMs);
        if (typeof d.pinchRatio === "number" && d.pinchRatio > 0.3 && d.pinchRatio <= 0.5 && e.source !== "pointer") {
          this.nearPinchStrokeStarts++;
        }
        break;
      case "STROKE_GAP":
        this.strokeGapEvents++;
        if (typeof d.gapReason === "string" && d.gapReason) {
          inc(this.strokeGapReasons, d.gapReason);
        }
        break;
      case "STROKE_RESUME":
        this.continuedAfterGrace++;
        if (typeof d.gapReason === "string" && d.gapReason) {
          inc(this.strokeGapReasons, d.gapReason);
        }
        break;
      case "STROKE_END": {
        this.inStroke = false;
        this.strokes++;
        this.strokePts.push(typeof d.points === "number" ? d.points : null);
        this.strokePath.push(typeof d.pathPx === "number" ? d.pathPx : null);
        this.strokeDur.push(typeof d.durMs === "number" ? d.durMs : null);
        if (e.source === "pointer") this.pointerStrokes++;
        else this.gestureStrokes++;
        if (d.unexpectedBreak === true) this.unexpectedBreaks++;
        if (typeof d.endReason === "string" && d.endReason) {
          inc(this.strokeEndReasons, d.endReason);
        }
        if (typeof d.gapReason === "string" && d.gapReason) {
          inc(this.strokeGapReasons, d.gapReason);
        }
        break;
      }
      case "ERASE_START":
        this.erases++;
        if (typeof d.latencyMs === "number") this.actionLat.push(d.latencyMs);
        break;
      case "ERASE_HIT":
        this.eraseHits++;
        break;
      case "ERASE_MISS":
        this.eraseMisses++;
        break;
      case "UNDO":
        this.undo++;
        inc(this.undoVia, typeof d.via === "string" && d.via ? d.via : e.source === "pointer" ? "button" : "unknown");
        if (typeof d.latencyMs === "number") this.actionLat.push(d.latencyMs);
        break;
      case "REDO":
        this.redo++;
        inc(this.redoVia, typeof d.via === "string" && d.via ? d.via : e.source === "pointer" ? "button" : "unknown");
        if (typeof d.latencyMs === "number") this.actionLat.push(d.latencyMs);
        break;
      case "ACTION_REJECTED":
        this.rejected++;
        if (typeof d.reason === "string" && d.reason) {
          inc(this.actionRejectedReasons, d.reason);
        }
        break;
      default:
        break;
    }
  }

  addPerf(p: PerfSample): void {
    if (typeof p.runtimeSetOptionsCalls === "number" && p.runtimeSetOptionsCalls > this.runtimeSetOptions) {
      this.runtimeSetOptions = p.runtimeSetOptionsCalls;
    }
    if (typeof p.initSetOptionsCalls === "number" && p.initSetOptionsCalls > this.initSetOptions) {
      this.initSetOptions = p.initSetOptionsCalls;
    }
  }

  summary(perf: PerfSample[] = []): TrialSummary {
    for (const p of perf) this.addPerf(p);

    let dur = this.durAcc;
    let steps = this.stepsAcc;
    if (this.firstT !== null && this.lastT !== null) {
      dur += Math.max(0, this.lastT - this.firstT);
      steps += Math.max(0, this.segFrames - 1);
    }
    const hz = steps > 0 && dur > 0 ? (steps * 1000) / dur : null;

    // Clone closed active window and fold in current segment non-destructively
    const activeWindow: ActiveWindowSummary = { ...this.closedActiveWindow };
    const extraUnknown = { activeWindowUnknownMissFrames: this.closedActiveUnknownMiss };
    accumulateSegmentActiveWindow(this.currentSeg, activeWindow, extraUnknown);
    activeWindow.missRate = activeWindow.frames > 0 ? r3(activeWindow.missFrames / activeWindow.frames) : null;

    const rawNoHandRate = this.frames > 0 ? r3(this.rawNoHandFrames / this.frames) : null;
    const missingHandRate = this.frames > 0 ? r3(this.missFrames / this.frames) : null;
    const independentGt = this.datasetGtFrames > 0;
    const warnings = [...this.warnings];
    if (this.frames === 0) warnings.push("no-frames");
    if (this.labelled === 0) {
      warnings.push("no-independent-ground-truth: action invariants and proxies only (predictions are never used as GT)");
    }
    if (this.runtimeSetOptions > 0) {
      warnings.push(`runtime-setOptions-thrashing:${this.runtimeSetOptions}`);
    }

    return {
      trialId: this.trialId,
      endReason: this.endReason,
      independentGroundTruthAvailable: independentGt,
      frames: this.frames,
      durationMs: Math.round(dur),
      handFrames: this.handFrames,
      detectorMissFrames: this.missFrames,
      missingHandRate,
      rawNoHandRate,
      activeWindowMissRate: activeWindow.missRate,
      flickerStreaks_1_3: activeWindow.flickerStreaks_1_3,
      shortLossStreaks_4_15: activeWindow.shortLossStreaks_4_15,
      longAbsenceStreaks_gt15: activeWindow.longAbsenceStreaks_gt15,
      hiddenDurationMs: Math.round(this.hiddenDurationMs),
      duplicateFrameSkippedCount: this.duplicateSkipped,
      initSetOptionsCalls: this.initSetOptions,
      runtimeSetOptionsCalls: this.runtimeSetOptions,
      autoConditionTags: [...this.conditionTags].sort(),
      autoConditionTagsSource: "RULE_DERIVED",
      activeWindow,
      missingBreakdown: {
        hiddenFrames: this.hiddenFrames,
        hiddenDurationMs: Math.round(this.hiddenDurationMs),
        bystanderAmbiguousFrames: this.bystanderAmbiguousFrames,
        ownerRejectFrames: this.ownerRejectFrames,
        leadInTailNoHandFrames: activeWindow.leadInNoHandFrames + activeWindow.tailNoHandFrames,
        activeWindowUnknownMissFrames: extraUnknown.activeWindowUnknownMissFrames,
        missReasons: { ...this.missReasons },
      },
      freshness: {
        uniqueCaptureFps: this.uniqueCaptureFpsS.quantiles(),
        frameAgeMs: this.frameAgeS.quantiles(),
        duplicateFrameSkippedCount: this.duplicateSkipped,
        framesDroppedBusy: this.droppedBusy,
      },
      quality: {
        lumaP10: this.lumaP10S.quantiles(),
        lumaP50: this.lumaP50S.quantiles(),
        lumaP95: this.lumaP95S.quantiles(),
        nearWhiteHandPct: this.nearWhiteS.quantiles(),
        blurProxy: this.blurS.quantiles(),
        noiseProxy: this.noiseS.quantiles(),
      },
      actionInvariants: {
        noHandActionsCount: this.noHandActions,
        nearPinchStrokeStarts: this.nearPinchStrokeStarts,
        pistolRejectsOnCanvas: this.pistolRejectsOnCanvas,
        runtimeSetOptionsCalls: this.runtimeSetOptions,
        predictionDistribution: { ...this.predictionDist },
        labelSourceCounts: { ...this.labelSourceCounts },
      },
      lockedFrames: this.lockedFrames,
      handLossEvents: this.handLoss,
      reacquisitions: this.reacq,
      handCountHistogram: { ...this.handHist },
      rejectReasons: { ...this.rejects },
      preprocessPasses: { ...this.passes },
      mpMs: this.mp.quantiles(),
      preMs: this.pre.quantiles(),
      classifierMs: this.cls.quantiles(),
      pipelineMs: this.pipe.quantiles(),
      detectHzMean: hz === null ? null : r3(hz),
      lumaMean: this.lumaS.quantiles(),
      backlightFrames: this.backlight,
      gesture: {
        keydowns: this.keydown,
        keyups: this.keyup,
        releaseAlls: this.relAll,
        heldFrames: this.held,
        labelledFrames: this.labelled,
        falsePressFrames: this.labelled > 0 ? this.falsePress : null,
        missedPressFrames: this.labelled > 0 ? this.missedPress : null,
        confusion:
          this.labelled > 0
            ? (JSON.parse(JSON.stringify(this.confusion)) as Record<string, Record<string, number>>)
            : null,
      },
      canvas: {
        strokes: this.strokes,
        strokePointsMean: this.strokePts.quantiles().mean,
        strokePathPxMean: this.strokePath.quantiles().mean,
        strokeDurMsMean: this.strokeDur.quantiles().mean,
        unexpectedStrokeBreaks: this.unexpectedBreaks,
        gapFramesDuringStroke: this.gapDuringStroke,
        continuedStrokesAfterGrace: this.continuedAfterGrace,
        strokeGapEvents: this.strokeGapEvents,
        strokeEndReasons: { ...this.strokeEndReasons },
        strokeGapReasons: { ...this.strokeGapReasons },
        eraseActions: this.erases,
        eraseHits: this.eraseHits,
        eraseMisses: this.eraseMisses,
        undo: this.undo,
        redo: this.redo,
        undoVia: { ...this.undoVia },
        redoVia: { ...this.redoVia },
        actionsRejected: this.rejected,
        actionRejectedReasons: { ...this.actionRejectedReasons },
        pointerStrokes: this.pointerStrokes,
        gestureStrokes: this.gestureStrokes,
        actionLatencyMs: this.actionLat.quantiles(),
        jitterRawPx: this.jRaw.quantiles(),
        jitterInkPx: this.jInk.quantiles(),
      },
      warnings,
    };
  }
}

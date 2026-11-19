/**
 * Trial aggregation for the NUI Lab benchmark. ONE implementation is used live (dashboard), at trial end (stored
 * summary) and when an exported file is re-analysed, so a stored summary can always be re-derived from raw records.
 */
import type { BenchEvent, BenchFrame, PerfSample, Quantiles, TrialSummary } from "./schema";

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
    return { n: s.length, mean: r3(sum / s.length), p50: r3(quantile(s, 0.5)), p95: r3(quantile(s, 0.95)), max: r3(s[s.length - 1]!) };
  }
}

/** Truth labels for which a POINT_PRESS prediction is wrong. Tester labels lag real motion: these are only as good as the labeller. */
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

export class TrialAggregator {
  readonly trialId: string;
  private frames = 0;
  private handFrames = 0;
  private missFrames = 0;
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
  private handHist: Record<string, number> = {};
  private rejects: Record<string, number> = {};
  private passes: Record<string, number> = {};
  private mp = new Samples();
  private pre = new Samples();
  private cls = new Samples();
  private pipe = new Samples();
  private lumaS = new Samples();
  private backlight = 0;
  private keydown = 0;
  private keyup = 0;
  private relAll = 0;
  private held = 0;
  private labelled = 0;
  private falsePress = 0;
  private missedPress = 0;
  private confusion: Record<string, Record<string, number>> = {};
  private strokes = 0;
  private strokePts = new Samples();
  private strokePath = new Samples();
  private strokeDur = new Samples();
  private unexpectedBreaks = 0;
  private gapDuringStroke = 0;
  private erases = 0;
  private eraseHits = 0;
  private eraseMisses = 0;
  private undo = 0;
  private redo = 0;
  private rejected = 0;
  private pointerStrokes = 0;
  private gestureStrokes = 0;
  private actionLat = new Samples();
  private jRaw = new Samples();
  private jInk = new Samples();
  private inStroke = false;
  private warnings = new Set<string>();

  constructor(trialId: string) {
    this.trialId = trialId;
  }

  /** Called between trials when one aggregator spans several (group totals): continuity state must not leak across. */
  breakContinuity(): void {
    if (this.firstT !== null && this.lastT !== null) {
      this.durAcc += Math.max(0, this.lastT - this.firstT);
      this.stepsAcc += Math.max(0, this.segFrames - 1);
    }
    this.firstT = null;
    this.lastT = null;
    this.segFrames = 0;
    this.prevLock = null;
    this.prevAcq = null;
    this.inStroke = false;
  }

  addFrame(f: BenchFrame): void {
    this.frames++;
    this.segFrames++;
    if (this.firstT === null) this.firstT = f.t;
    this.lastT = f.t;
    if (f.det === "HAND") this.handFrames++;
    else this.missFrames++;
    inc(this.handHist, String(f.hands));
    inc(this.rejects, f.reject || "—");
    inc(this.passes, f.luma.pass || "—");
    if (f.lock === "locked") this.lockedFrames++;
    if (this.prevLock === "locked" && f.lock !== "locked") this.handLoss++;
    if (this.prevAcq !== null && f.session > this.prevAcq) this.reacq++;
    this.prevLock = f.lock;
    this.prevAcq = f.session;
    this.mp.push(f.timing.mpMs);
    this.pre.push(f.timing.preMs);
    this.cls.push(f.timing.classifierMs);
    this.pipe.push(f.timing.pipelineMs);
    this.lumaS.push(f.luma.mean);
    if (f.luma.backlight) this.backlight++;
    if (f.vkeyEvent === "HELD") this.held++;
    if (f.jitter) {
      this.jRaw.push(f.jitter.raw);
      this.jInk.push(f.jitter.ink);
    }
    if (this.inStroke && f.det === "DETECTOR_MISS") this.gapDuringStroke++;
    if (!UNLABELLED_LIKE.has(f.truth)) {
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
        if (typeof d.latencyMs === "number") this.actionLat.push(d.latencyMs);
        break;
      case "REDO":
        this.redo++;
        if (typeof d.latencyMs === "number") this.actionLat.push(d.latencyMs);
        break;
      case "ACTION_REJECTED":
        this.rejected++;
        break;
      default:
        break;
    }
  }

  summary(perf: PerfSample[] = []): TrialSummary {
    let dur = this.durAcc;
    let steps = this.stepsAcc;
    if (this.firstT !== null && this.lastT !== null) {
      dur += Math.max(0, this.lastT - this.firstT);
      steps += Math.max(0, this.segFrames - 1);
    }
    const hz = steps > 0 && dur > 0 ? (steps * 1000) / dur : null;
    const warnings = [...this.warnings];
    if (this.frames === 0) warnings.push("no-frames");
    if (this.labelled === 0) warnings.push("no-ground-truth-labels: confusion/false-press need tester labels");
    void perf;
    return {
      trialId: this.trialId,
      frames: this.frames,
      durationMs: Math.round(dur),
      handFrames: this.handFrames,
      detectorMissFrames: this.missFrames,
      missingHandRate: this.frames ? r3(this.missFrames / this.frames) : null,
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
        falsePressFrames: this.falsePress,
        missedPressFrames: this.missedPress,
        confusion: JSON.parse(JSON.stringify(this.confusion)) as Record<string, Record<string, number>>,
      },
      canvas: {
        strokes: this.strokes,
        strokePointsMean: this.strokePts.quantiles().mean,
        strokePathPxMean: this.strokePath.quantiles().mean,
        strokeDurMsMean: this.strokeDur.quantiles().mean,
        unexpectedStrokeBreaks: this.unexpectedBreaks,
        gapFramesDuringStroke: this.gapDuringStroke,
        eraseActions: this.erases,
        eraseHits: this.eraseHits,
        eraseMisses: this.eraseMisses,
        undo: this.undo,
        redo: this.redo,
        actionsRejected: this.rejected,
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

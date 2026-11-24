/**
 * R22 Pure-TypeScript CPU Causal Temporal Buffer & Classifier (`r22-temporal.ts`).
 *
 * Implements Contract K5 (`r22-temporal-146d-v1`), Contract K6 (honest metadata + model
 * validation), and §A2 behind-interface compatibility with `PistolSource` / `PoseSource`.
 *
 * Strict runtime guarantees:
 *  - Pure TypeScript / Float64Array CPU execution (zero WebGL/ONNX/OpenCV/WASM dependencies).
 *  - Strictly causal (0-lookahead) left-padded depthwise-separable 1D-TCN + multi-scale readout
 *    supporting `window_size` W in {3, 5, 8} (or any W >= 1).
 *  - Uses ONLY real frame timestamps (`nowMs` / `dtMs`) and observable 21 landmarks.
 *    NEVER invents `landmark.visibility` (MediaPipe web HandLandmarker does not output it).
 *  - Automatic temporal state reset on loss timeout (`lossResetMs`), non-monotonic timestamps,
 *    or sudden wrist teleport (`maxJumpNorm`), while masking short `NO_HAND` tracking blinks
 *    (`<= lossResetMs`) via `valid_frame_mask = 0` and returning fail-closed outputs.
 */
import { thumbLateral, withAspect, type Landmark } from "../r19/pistol_types";
import { R19_FEATURE_COUNT, R19_FEATURE_NAMES, R19_LABELS, R19FeatureTracker, type R19Label } from "../r19/r19_features";

export const R22_TEMPORAL_ENCODER_VERSION = "r22-temporal-146d-v1" as const;
export const R22_TEMPORAL_FEATURE_DIM = 146; // 82D r19_features + 63D dt-norm velocity + 1D valid_frame_mask

export type R22LabelSource = "MODEL_PREDICTION" | "RULE_DERIVED" | "USER_ACTION" | "DATASET_GT" | "UNKNOWN";
export type R22CanvasPoseLabel = "FIST" | "ONE" | "TWO" | "FIVE" | "OTHER";
export const R22_CANVAS_POSE_LABELS: readonly R22CanvasPoseLabel[] = ["FIST", "ONE", "TWO", "FIVE", "OTHER"] as const;

export const R22_TEMPORAL_FEATURE_NAMES: readonly string[] = (() => {
  const names = [...R19_FEATURE_NAMES];
  for (let i = 0; i < 21; i++) {
    names.push(`vx${i}`, `vy${i}`, `vz${i}`);
  }
  names.push("valid_frame_mask");
  return names;
})();

const TIPS = [4, 8, 12, 16, 20] as const;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const dist2 = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

export interface TemporalFrameQualityHint {
  lumaP50?: number;
  nearWhiteHandPct?: number | null;
  blurProxy?: number;
  noiseProxy?: number;
}

export interface DerivedQualityGate {
  plausible: boolean;
  qualityScore: number;
  lowQualityWarning: boolean;
  rejectReason: string | null;
}

/**
 * Derived landmark plausibility & quality gate computed strictly from observable 21 landmarks
 * and optional observable image quality proxies (NEVER invents `landmark.visibility`).
 */
export function computeDerivedQualityGate(
  lm: Landmark[] | undefined | null,
  aspect: number,
  hint?: TemporalFrameQualityHint,
): DerivedQualityGate {
  if (!lm || lm.length < 21) {
    return { plausible: false, qualityScore: 0, lowQualityWarning: false, rejectReason: "no-hand" };
  }
  for (let i = 0; i < 21; i++) {
    const p = lm[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      return { plausible: false, qualityScore: 0, lowQualityWarning: false, rejectReason: "non-finite-xy" };
    }
  }
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const gx0 = lm[0]!.x * a;
  const gy0 = lm[0]!.y;
  const span = dist2(lm[9]!.x * a, lm[9]!.y, gx0, gy0);
  const knuckle = dist2(lm[17]!.x * a, lm[17]!.y, lm[5]!.x * a, lm[5]!.y);
  const palmScale = Math.max(span, knuckle);
  if (!(palmScale > 1e-4)) {
    return { plausible: false, qualityScore: 0, lowQualityWarning: false, rejectReason: "degenerate-palm" };
  }
  const ratioKnuckle = knuckle / palmScale;
  const ratioSpan = span / palmScale;
  if (ratioKnuckle < 0.08 || ratioSpan < 0.12) {
    return { plausible: false, qualityScore: 0, lowQualityWarning: false, rejectReason: "collapsed-palm-aspect" };
  }
  let maxReach = 0;
  for (const t of TIPS) {
    const r = dist2(lm[t]!.x * a, lm[t]!.y, gx0, gy0) / palmScale;
    if (r > maxReach) maxReach = r;
  }
  if (maxReach > 4.2 || maxReach < 0.35) {
    return { plausible: false, qualityScore: 0, lowQualityWarning: false, rejectReason: "implausible-finger-reach" };
  }

  let sizeScore = clamp((palmScale - 0.02) / 0.1, 0, 1);
  let lowQualityWarning = false;
  if (hint) {
    // Thresholds aligned with r20-lowlight.ts (R22_BLUR_SHARPNESS_WARN_MIN=40, R22_GLARE_NEAR_WHITE_WARN_PCT=8.0, R22_NOISE_MAD_WARN_MAX=5.0)
    if (typeof hint.blurProxy === "number" && Number.isFinite(hint.blurProxy) && hint.blurProxy < 40) {
      lowQualityWarning = true;
      sizeScore *= 0.85;
    }
    if (typeof hint.nearWhiteHandPct === "number" && Number.isFinite(hint.nearWhiteHandPct) && hint.nearWhiteHandPct >= 8.0) {
      lowQualityWarning = true;
      sizeScore *= 0.85;
    }
    if (typeof hint.noiseProxy === "number" && Number.isFinite(hint.noiseProxy) && hint.noiseProxy > 5.0) {
      lowQualityWarning = true;
      sizeScore *= 0.9;
    }
    if (typeof hint.lumaP50 === "number" && Number.isFinite(hint.lumaP50) && hint.lumaP50 < 0.12) {
      lowQualityWarning = true;
      sizeScore *= 0.85;
    }
  }
  return {
    plausible: true,
    qualityScore: 0.5 + 0.5 * sizeScore,
    lowQualityWarning,
    rejectReason: null,
  };
}

export interface R22TemporalExtractorOptions {
  /** Automatically reset temporal history after NO_HAND / frame gap exceeds this timeout (ms). Default: 350 ms. */
  lossResetMs?: number;
  /** Upper bound for dt (seconds) when normalizing velocities inside an active window. Default: 5.0 s. */
  maxVelDtSec?: number;
  /** Maximum normalized wrist jump before assuming owner/hand discontinuity and resetting. Default: 0.45. */
  maxJumpNorm?: number;
}

export interface TemporalFeatureStep {
  features: Float32Array;
  valid: boolean;
  didReset: boolean;
  resetReason: string | null;
  dtMs: number;
  lossElapsedMs: number;
  qualityGate: DerivedQualityGate;
}

/**
 * Stateful causal K5 `r22-temporal-146d-v1` feature extractor matching Python `R22TemporalFeatureExtractorPy`
 * to `< 1e-6` numerical parity.
 */
export class R22TemporalFeatureExtractor {
  private readonly r19 = new R19FeatureTracker();
  private readonly lossResetMs: number;
  private readonly maxVelDtSec: number;
  private readonly maxJumpNorm: number;

  private prevTMs: number | null = null;
  private prevWrist: [number, number, number] | null = null;
  private prevCanonX: Float64Array | null = null;
  private prevCanonY: Float64Array | null = null;
  private prevCanonZ: Float64Array | null = null;
  private lastValidTMs: number | null = null;

  constructor(opts: R22TemporalExtractorOptions = {}) {
    this.lossResetMs = opts.lossResetMs ?? 350;
    this.maxVelDtSec = opts.maxVelDtSec ?? 5.0;
    this.maxJumpNorm = opts.maxJumpNorm ?? 0.45;
  }

  reset(): void {
    this.r19.reset();
    this.prevTMs = null;
    this.prevWrist = null;
    this.prevCanonX = null;
    this.prevCanonY = null;
    this.prevCanonZ = null;
    this.lastValidTMs = null;
  }

  step(
    lm: Landmark[] | undefined | null,
    nowMs: number,
    aspect: number,
    hint?: TemporalFrameQualityHint,
    forceNoResetGap = false,
  ): TemporalFeatureStep {
    let didReset = false;
    let resetReason: string | null = null;
    const lossElapsedMs = this.lastValidTMs === null ? 0 : Math.max(0, nowMs - this.lastValidTMs);
    const dtMs = this.prevTMs === null ? 0 : nowMs - this.prevTMs;

    if (this.lastValidTMs !== null && !forceNoResetGap) {
      if (nowMs < this.lastValidTMs) {
        this.reset();
        didReset = true;
        resetReason = "non-monotonic-timestamp";
      } else if (nowMs - this.lastValidTMs > this.lossResetMs) {
        this.reset();
        didReset = true;
        resetReason = "loss-timeout";
      }
    }

    const qualityGate = computeDerivedQualityGate(lm, aspect, hint);
    if (!qualityGate.plausible || !lm) {
      this.r19.reset();
      return {
        features: new Float32Array(R22_TEMPORAL_FEATURE_DIM),
        valid: false,
        didReset,
        resetReason,
        dtMs,
        lossElapsedMs,
        qualityGate,
      };
    }

    const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    const g = withAspect(lm, a);
    const wx = g[0]!.x;
    const wy = g[0]!.y;
    const wz = Number.isFinite(g[0]!.z) ? (g[0]!.z as number) : 0;
    const span = dist2(g[9]!.x, g[9]!.y, wx, wy);
    const knuckle = dist2(g[17]!.x, g[17]!.y, g[5]!.x, g[5]!.y);
    const palmScale = Math.max(span, knuckle);
    if (!(palmScale > 1e-4)) {
      this.r19.reset();
      return {
        features: new Float32Array(R22_TEMPORAL_FEATURE_DIM),
        valid: false,
        didReset,
        resetReason,
        dtMs,
        lossElapsedMs,
        qualityGate: { plausible: false, qualityScore: 0, lowQualityWarning: false, rejectReason: "degenerate-palm" },
      };
    }

    if (this.prevWrist !== null && !forceNoResetGap) {
      const wristJump = Math.hypot(wx - this.prevWrist[0], wy - this.prevWrist[1]) / Math.max(1.0, a);
      if (wristJump > this.maxJumpNorm) {
        this.reset();
        didReset = true;
        resetReason = "owner-jump-reset";
      }
    }

    const r19Vec = this.r19.extract(lm, nowMs, a);
    if (!r19Vec || r19Vec.length !== R19_FEATURE_COUNT) {
      this.r19.reset();
      return {
        features: new Float32Array(R22_TEMPORAL_FEATURE_DIM),
        valid: false,
        didReset,
        resetReason,
        dtMs,
        lossElapsedMs,
        qualityGate: { plausible: false, qualityScore: 0, lowQualityWarning: false, rejectReason: "r19-extract-failed" },
      };
    }

    // Canonical local 3D coordinates (exact mirror of Python R22TemporalFeatureExtractorPy)
    let ux = span > 1e-4 ? (g[9]!.x - wx) / span : -(g[17]!.y - g[5]!.y) / palmScale;
    let uy = span > 1e-4 ? (g[9]!.y - wy) / span : (g[17]!.x - g[5]!.x) / palmScale;
    const un = Math.hypot(ux, uy) || 1;
    ux /= un;
    uy /= un;

    const cx = new Float64Array(21);
    const cy = new Float64Array(21);
    const cz = new Float64Array(21);
    let allZFinite = true;
    for (let i = 0; i < 21; i++) {
      if (g[i]!.z !== undefined && !Number.isFinite(g[i]!.z)) {
        allZFinite = false;
        break;
      }
    }
    for (let i = 0; i < 21; i++) {
      const dx = g[i]!.x - wx;
      const dy = g[i]!.y - wy;
      cx[i] = (dx * -uy + dy * ux) / palmScale;
      cy[i] = -(dx * ux + dy * uy) / palmScale;
      const zi = allZFinite && g[i]!.z !== undefined ? (g[i]!.z as number) : 0;
      const z0 = allZFinite ? wz : 0;
      cz[i] = (zi - z0) / palmScale;
    }
    if (cx[5]! > cx[17]!) {
      for (let i = 0; i < 21; i++) cx[i] = -cx[i]!;
    }

    const out = new Float32Array(R22_TEMPORAL_FEATURE_DIM);
    for (let i = 0; i < 82; i++) out[i] = r19Vec[i]!;

    // 63D dt-normalized joint velocity
    if (
      this.prevCanonX !== null &&
      this.prevCanonY !== null &&
      this.prevCanonZ !== null &&
      this.prevWrist !== null &&
      this.prevTMs !== null
    ) {
      const curDtMs = nowMs - this.prevTMs;
      if (curDtMs > 0) {
        const dtSec = clamp(curDtMs / 1000, 0.016, this.maxVelDtSec);
        const curWz = allZFinite ? wz : 0;
        out[82] = clamp((wx - this.prevWrist[0]) / palmScale / dtSec, -10, 10);
        out[83] = clamp((wy - this.prevWrist[1]) / palmScale / dtSec, -10, 10);
        out[84] = clamp((curWz - this.prevWrist[2]) / palmScale / dtSec, -10, 10);
        for (let i = 1; i < 21; i++) {
          const base = 82 + i * 3;
          out[base] = clamp((cx[i]! - this.prevCanonX[i]!) / dtSec, -10, 10);
          out[base + 1] = clamp((cy[i]! - this.prevCanonY[i]!) / dtSec, -10, 10);
          out[base + 2] = clamp((cz[i]! - this.prevCanonZ[i]!) / dtSec, -10, 10);
        }
      }
    }
    out[145] = 1.0;

    for (let i = 0; i < R22_TEMPORAL_FEATURE_DIM; i++) {
      if (!Number.isFinite(out[i]!)) {
        return {
          features: new Float32Array(R22_TEMPORAL_FEATURE_DIM),
          valid: false,
          didReset,
          resetReason,
          dtMs,
          lossElapsedMs,
          qualityGate: { plausible: false, qualityScore: 0, lowQualityWarning: false, rejectReason: "non-finite-feature" },
        };
      }
    }

    this.prevTMs = nowMs;
    this.prevWrist = [wx, wy, allZFinite ? wz : 0];
    this.prevCanonX = cx;
    this.prevCanonY = cy;
    this.prevCanonZ = cz;
    this.lastValidTMs = nowMs;

    return {
      features: out,
      valid: true,
      didReset,
      resetReason,
      dtMs: dtMs > 0 ? dtMs : 0,
      lossElapsedMs: 0,
      qualityGate,
    };
  }
}

export interface R22TemporalTcnBlock {
  kernel_size: number;
  dilation: number;
  dw_W: number[][]; // [C_in, K]
  dw_b: number[];   // [C_in]
  pw_W: number[][]; // [C_in, C_out]
  pw_b: number[];   // [C_out]
  residual: boolean;
}

export interface R22ExportedTemporalModel {
  name: string;
  version: string;
  encoder_version: string;
  license_provenance: string;
  split_contract?: string;
  task: "pistol_3class" | "pose_5class" | string;
  window_size: number;
  feature_dim: number;
  loss_reset_ms: number;
  labels: string[];
  feature_names: string[];
  mean: number[];
  std: number[];
  temperature: number;
  proj: { W: number[][]; b: number[] }; // [146, C0]
  tcn_blocks: R22TemporalTcnBlock[];
  head_layers: Array<{ W: number[][]; b: number[] }>;
}

export function validateR22TemporalModel(raw: unknown): R22ExportedTemporalModel {
  if (!raw || typeof raw !== "object") {
    throw new Error("R22 temporal model invalid: expected object");
  }
  const m = raw as Partial<R22ExportedTemporalModel>;
  if (m.encoder_version !== R22_TEMPORAL_ENCODER_VERSION) {
    throw new Error(`R22 temporal model encoder mismatch: expected ${R22_TEMPORAL_ENCODER_VERSION}, got ${String(m.encoder_version)}`);
  }
  if (!Number.isInteger(m.window_size) || (m.window_size ?? 0) < 1 || (m.window_size ?? 0) > 32) {
    throw new Error(`R22 temporal model invalid window_size: ${String(m.window_size)}`);
  }
  if (m.feature_dim !== R22_TEMPORAL_FEATURE_DIM) {
    throw new Error(`R22 temporal model invalid feature_dim: ${String(m.feature_dim)}`);
  }
  if (!Array.isArray(m.mean) || !Array.isArray(m.std) || m.mean.length !== R22_TEMPORAL_FEATURE_DIM || m.std.length !== R22_TEMPORAL_FEATURE_DIM) {
    throw new Error("R22 temporal model mean/std dimension mismatch");
  }
  if (!Array.isArray(m.labels) || m.labels.length < 2) {
    throw new Error("R22 temporal model labels missing");
  }
  if (!m.proj || !Array.isArray(m.proj.W) || !Array.isArray(m.proj.b)) {
    throw new Error("R22 temporal model proj layer missing");
  }
  if (!Array.isArray(m.tcn_blocks) || !Array.isArray(m.head_layers) || m.head_layers.length === 0) {
    throw new Error("R22 temporal model tcn_blocks or head_layers missing");
  }
  return m as R22ExportedTemporalModel;
}

export interface R22TemporalStepResult {
  label: string;
  conf: number;
  probs: number[];
  valid: boolean;
  failClosed: boolean;
  windowSize: number;
  windowFilled: number;
  validFramesInWindow: number;
  didReset: boolean;
  resetReason: string | null;
  dtMs: number;
  lossElapsedMs: number;
  labelSource: R22LabelSource;
  qualityGate: DerivedQualityGate;
}

interface CompiledTcnBlock {
  k: number;
  d: number;
  cIn: number;
  cOut: number;
  residual: boolean;
  dwW: Float64Array;
  dwB: Float64Array;
  pwW: Float64Array;
  pwB: Float64Array;
  dwBuf: Float64Array;
  outBuf: Float64Array;
}

/**
 * Pure-TypeScript CPU Causal 1D-TCN Classifier with integrated causal ring buffer & loss-reset logic.
 * Zero per-frame heap allocations inside the forward pass (`evalWindow`).
 */
export class R22TemporalClassifier {
  readonly model: R22ExportedTemporalModel;
  readonly windowSize: number;
  readonly featureDim: number;
  readonly labels: string[];
  readonly extractor: R22TemporalFeatureExtractor;

  private readonly mean: Float64Array;
  private readonly invStd: Float64Array;
  private readonly temp: number;

  private readonly c0: number;
  private readonly projW: Float64Array;
  private readonly projB: Float64Array;
  private readonly projBuf: Float64Array; // [W * C0]

  private readonly blocks: CompiledTcnBlock[];
  private readonly cLast: number;
  private readonly readoutBuf: Float64Array; // [2 * C_last + C0]

  private readonly headDims: number[];
  private readonly headW: Float64Array[];
  private readonly headB: Float64Array[];
  private readonly headBufs: Float64Array[];

  private readonly zBuf: Float64Array; // [W * 146]
  private readonly maskBuf: Float64Array; // [W]
  private readonly otherIdx: number;

  private history: Float32Array[] = [];
  private resetCount = 0;

  constructor(modelJson: unknown, extractorOpts?: R22TemporalExtractorOptions) {
    const model = validateR22TemporalModel(modelJson);
    this.model = model;
    this.windowSize = model.window_size;
    this.featureDim = model.feature_dim;
    this.labels = [...model.labels];
    this.temp = Number.isFinite(model.temperature) && model.temperature > 0 ? model.temperature : 1.0;

    this.extractor = new R22TemporalFeatureExtractor({
      lossResetMs: extractorOpts?.lossResetMs ?? model.loss_reset_ms ?? 350,
      maxVelDtSec: extractorOpts?.maxVelDtSec ?? 5.0,
      maxJumpNorm: extractorOpts?.maxJumpNorm ?? 0.45,
    });

    this.mean = Float64Array.from(model.mean);
    this.invStd = new Float64Array(this.featureDim);
    for (let i = 0; i < this.featureDim; i++) {
      const s = model.std[i]!;
      this.invStd[i] = s > 1e-6 ? 1.0 / s : 1.0;
    }

    this.c0 = model.proj.b.length;
    this.projW = Float64Array.from(model.proj.W.flat());
    this.projB = Float64Array.from(model.proj.b);
    this.projBuf = new Float64Array(this.windowSize * this.c0);

    let prevC = this.c0;
    this.blocks = model.tcn_blocks.map((blk) => {
      const cIn = blk.dw_b.length;
      const cOut = blk.pw_b.length;
      if (cIn !== prevC) {
        throw new Error(`R22 TCN channel mismatch: expected ${prevC}, got ${cIn}`);
      }
      prevC = cOut;
      return {
        k: blk.kernel_size,
        d: blk.dilation,
        cIn,
        cOut,
        residual: Boolean(blk.residual) && cIn === cOut,
        dwW: Float64Array.from(blk.dw_W.flat()),
        dwB: Float64Array.from(blk.dw_b),
        pwW: Float64Array.from(blk.pw_W.flat()),
        pwB: Float64Array.from(blk.pw_b),
        dwBuf: new Float64Array(this.windowSize * cIn),
        outBuf: new Float64Array(this.windowSize * cOut),
      };
    });
    this.cLast = prevC;
    const readoutDim = this.cLast * 2 + this.c0;
    this.readoutBuf = new Float64Array(readoutDim);

    this.headDims = [readoutDim, ...model.head_layers.map((l) => l.b.length)];
    this.headW = model.head_layers.map((l) => Float64Array.from(l.W.flat()));
    this.headB = model.head_layers.map((l) => Float64Array.from(l.b));
    this.headBufs = this.headDims.slice(1).map((d) => new Float64Array(d));

    this.zBuf = new Float64Array(this.windowSize * this.featureDim);
    this.maskBuf = new Float64Array(this.windowSize);
    const oi = this.labels.indexOf("OTHER");
    this.otherIdx = oi >= 0 ? oi : this.labels.length - 1;
  }

  get totalResets(): number {
    return this.resetCount;
  }

  get currentBufferLength(): number {
    return this.history.length;
  }

  reset(): void {
    this.extractor.reset();
    this.history = [];
    this.resetCount++;
  }

  /**
   * Pure stateless forward pass over a causal window of shape `[W, 146]` (oldest -> newest).
   * If fewer than `W` frames are passed, left-pads with zero-masked frames (`valid_frame_mask = 0`).
   */
  probaWindow(windowFrames: ReadonlyArray<ArrayLike<number>>): number[] {
    const W = this.windowSize;
    const D = this.featureDim;
    const nProvided = windowFrames.length;
    const padLeft = Math.max(0, W - nProvided);
    const srcOffset = Math.max(0, nProvided - W);

    // 1) Standardize valid frames; keep masked/padded frames strictly 0
    for (let t = 0; t < W; t++) {
      const dstBase = t * D;
      if (t < padLeft) {
        this.maskBuf[t] = 0;
        for (let d = 0; d < D; d++) this.zBuf[dstBase + d] = 0;
      } else {
        const frame = windowFrames[srcOffset + (t - padLeft)]!;
        const mask = frame[D - 1]! > 0.5 ? 1 : 0;
        this.maskBuf[t] = mask;
        if (mask === 0) {
          for (let d = 0; d < D; d++) this.zBuf[dstBase + d] = 0;
        } else {
          for (let d = 0; d < D; d++) {
            this.zBuf[dstBase + d] = (frame[d]! - this.mean[d]!) * this.invStd[d]!;
          }
        }
      }
    }

    // 2) Per-frame 1x1 projection + ReLU (zeroed on masked frames)
    const c0 = this.c0;
    const projW = this.projW;
    const projB = this.projB;
    const projBuf = this.projBuf;
    for (let t = 0; t < W; t++) {
      const pBase = t * c0;
      if (this.maskBuf[t]! < 0.5) {
        for (let o = 0; o < c0; o++) projBuf[pBase + o] = 0;
        continue;
      }
      const xBase = t * D;
      for (let o = 0; o < c0; o++) projBuf[pBase + o] = projB[o]!;
      for (let i = 0; i < D; i++) {
        const v = this.zBuf[xBase + i]!;
        const wRow = i * c0;
        for (let o = 0; o < c0; o++) projBuf[pBase + o] = projBuf[pBase + o]! + v * projW[wRow + o]!;
      }
      for (let o = 0; o < c0; o++) {
        if (projBuf[pBase + o]! < 0) projBuf[pBase + o] = 0;
      }
    }

    // 3) Causal Depthwise-Separable 1D-TCN Blocks
    let curBuf: Float64Array = projBuf;
    for (let bIdx = 0; bIdx < this.blocks.length; bIdx++) {
      const blk = this.blocks[bIdx]!;
      const { k, d, cIn, cOut, residual, dwW, dwB, pwW, pwB, dwBuf, outBuf } = blk;

      // Depthwise causal conv (strict left-only padding) + ReLU
      for (let t = 0; t < W; t++) {
        const dstBase = t * cIn;
        for (let c = 0; c < cIn; c++) {
          let acc = dwB[c]!;
          const wBase = c * k;
          for (let ki = 0; ki < k; ki++) {
            const srcT = t - (k - 1 - ki) * d;
            if (srcT >= 0) {
              acc += curBuf[srcT * cIn + c]! * dwW[wBase + ki]!;
            }
          }
          dwBuf[dstBase + c] = acc > 0 ? acc : 0;
        }
      }

      // Pointwise 1x1 conv + optional residual + ReLU
      for (let t = 0; t < W; t++) {
        const inBase = t * cIn;
        const outBase = t * cOut;
        for (let o = 0; o < cOut; o++) outBuf[outBase + o] = pwB[o]!;
        for (let c = 0; c < cIn; c++) {
          const v = dwBuf[inBase + c]!;
          if (v === 0) continue;
          const wRow = c * cOut;
          for (let o = 0; o < cOut; o++) outBuf[outBase + o] = outBuf[outBase + o]! + v * pwW[wRow + o]!;
        }
        if (residual) {
          for (let o = 0; o < cOut; o++) {
            const val = outBuf[outBase + o]! + curBuf[inBase + o]!;
            outBuf[outBase + o] = val > 0 ? val : 0;
          }
        } else {
          for (let o = 0; o < cOut; o++) {
            if (outBuf[outBase + o]! < 0) outBuf[outBase + o] = 0;
          }
        }
      }
      curBuf = outBuf;
    }

    // 4) Causal Multi-Scale Readout: [curBuf[W-1], masked_mean(curBuf), projBuf[W-1]]
    const cLast = this.cLast;
    const lastOffset = (W - 1) * cLast;
    const ro = this.readoutBuf;
    for (let c = 0; c < cLast; c++) {
      ro[c] = curBuf[lastOffset + c]!;
      ro[cLast + c] = 0;
    }
    let validCount = 0;
    for (let t = 0; t < W; t++) {
      if (this.maskBuf[t]! > 0.5) {
        validCount++;
        const tBase = t * cLast;
        for (let c = 0; c < cLast; c++) ro[cLast + c] = ro[cLast + c]! + curBuf[tBase + c]!;
      }
    }
    const invCount = validCount > 0 ? 1.0 / validCount : 1.0;
    for (let c = 0; c < cLast; c++) ro[cLast + c] = ro[cLast + c]! * invCount;

    const projLastOffset = (W - 1) * c0;
    for (let c = 0; c < c0; c++) ro[2 * cLast + c] = projBuf[projLastOffset + c]!;

    // 5) Head MLP + temperature-calibrated softmax
    let prev: Float64Array = ro;
    for (let l = 0; l < this.headW.length; l++) {
      const din = this.headDims[l]!;
      const dout = this.headDims[l + 1]!;
      const w = this.headW[l]!;
      const b = this.headB[l]!;
      const out = this.headBufs[l]!;
      for (let j = 0; j < dout; j++) out[j] = b[j]!;
      for (let i = 0; i < din; i++) {
        const v = prev[i]!;
        if (v === 0) continue;
        const row = i * dout;
        for (let j = 0; j < dout; j++) out[j] = out[j]! + v * w[row + j]!;
      }
      if (l < this.headW.length - 1) {
        for (let j = 0; j < dout; j++) if (out[j]! < 0) out[j] = 0;
      }
      prev = out;
    }

    let mx = -Infinity;
    for (let j = 0; j < prev.length; j++) {
      const z = prev[j]! / this.temp;
      if (z > mx) mx = z;
    }
    const probs = new Array<number>(prev.length);
    let sum = 0;
    for (let j = 0; j < prev.length; j++) {
      const e = Math.exp(prev[j]! / this.temp - mx);
      probs[j] = e;
      sum += e;
    }
    for (let j = 0; j < prev.length; j++) probs[j] = probs[j]! / sum;
    return probs;
  }

  /**
   * Streaming causal update for one video frame.
   * Handles automatic loss-timeout reset, short-blink masking, and fail-closed `NO_HAND` output.
   */
  step(
    lm: Landmark[] | undefined | null,
    nowMs: number,
    aspect: number,
    hint?: TemporalFrameQualityHint,
    forceNoResetGap = false,
  ): R22TemporalStepResult {
    const featStep = this.extractor.step(lm, nowMs, aspect, hint, forceNoResetGap);
    if (featStep.didReset) {
      this.history = [];
      this.resetCount++;
    }

    if (!featStep.valid) {
      // During short blink (<= lossResetMs) where history is still active, push zero-masked slot
      // so the causal window reflects the true missingness without inventing landmarks.
      if (this.history.length > 0) {
        this.history.push(featStep.features);
        if (this.history.length > this.windowSize) this.history.shift();
      }
      const probs = new Array<number>(this.labels.length).fill(0);
      probs[this.otherIdx] = 1.0;
      return {
        label: this.labels[this.otherIdx] ?? "OTHER",
        conf: 1.0,
        probs,
        valid: false,
        failClosed: true,
        windowSize: this.windowSize,
        windowFilled: this.history.length,
        validFramesInWindow: this.countValidInHistory(),
        didReset: featStep.didReset,
        resetReason: featStep.resetReason,
        dtMs: featStep.dtMs,
        lossElapsedMs: featStep.lossElapsedMs,
        labelSource: "MODEL_PREDICTION",
        qualityGate: featStep.qualityGate,
      };
    }

    this.history.push(featStep.features);
    if (this.history.length > this.windowSize) this.history.shift();

    const probs = this.probaWindow(this.history);
    let bestIdx = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i]! > probs[bestIdx]!) bestIdx = i;
    }

    return {
      label: this.labels[bestIdx]!,
      conf: probs[bestIdx]!,
      probs,
      valid: true,
      failClosed: false,
      windowSize: this.windowSize,
      windowFilled: this.history.length,
      validFramesInWindow: this.countValidInHistory(),
      didReset: featStep.didReset,
      resetReason: featStep.resetReason,
      dtMs: featStep.dtMs,
      lossElapsedMs: featStep.lossElapsedMs,
      labelSource: "MODEL_PREDICTION",
      qualityGate: featStep.qualityGate,
    };
  }

  private countValidInHistory(): number {
    let n = 0;
    for (let i = 0; i < this.history.length; i++) {
      if (this.history[i]![R22_TEMPORAL_FEATURE_DIM - 1]! > 0.5) n++;
    }
    return n;
  }
}

// =============================================================================
// §A2 Behind-Interface Adapters (`PistolSource` & `PoseSource` — Single Source of Decision)
// =============================================================================

export interface R22PistolSourceOutput {
  state: R19Label;
  conf: number;
  probs: number[];
  valid: boolean;
  failClosed: boolean;
  windowFilled: number;
  didReset: boolean;
  labelSource: R22LabelSource;
  qualityGate: DerivedQualityGate;
}

export interface R22PistolSource {
  readonly id: string;
  classify(lm: Landmark[] | undefined | null, nowMs: number, aspect: number, hint?: TemporalFrameQualityHint): R22PistolSourceOutput;
  reset(): void;
}

export interface R22PoseSourceOutput {
  pose: R22CanvasPoseLabel;
  fingerCount: 0 | 1 | 2 | 3 | 4 | 5 | null;
  conf: number;
  probs: number[];
  valid: boolean;
  failClosed: boolean;
  windowFilled: number;
  didReset: boolean;
  labelSource: R22LabelSource;
  qualityGate: DerivedQualityGate;
}

export interface R22PoseSource {
  readonly id: string;
  classify(lm: Landmark[] | undefined | null, nowMs: number, aspect: number, hint?: TemporalFrameQualityHint): R22PoseSourceOutput;
  reset(): void;
}

/**
 * Behind-interface `PistolSource` adapter wrapping `R22TemporalClassifier` (for `route === "gesture"` ONLY;
 * NEVER attached as a parallel veto on Canvas per §A2 & Contract K3).
 */
export class TemporalPistolSource implements R22PistolSource {
  readonly id: string;
  readonly clf: R22TemporalClassifier;

  constructor(modelJson: unknown, extractorOpts?: R22TemporalExtractorOptions) {
    this.clf = new R22TemporalClassifier(modelJson, extractorOpts);
    this.id = this.clf.model.name;
  }

  reset(): void {
    this.clf.reset();
  }

  classify(
    lm: Landmark[] | undefined | null,
    nowMs: number,
    aspect: number,
    hint?: TemporalFrameQualityHint,
  ): R22PistolSourceOutput {
    const step = this.clf.step(lm, nowMs, aspect, hint);
    const state: R19Label =
      step.label === "POINT_READY" || step.label === "POINT_PRESS" || step.label === "OTHER"
        ? step.label
        : "OTHER";
    return {
      state,
      conf: step.conf,
      probs: step.probs,
      valid: step.valid,
      failClosed: step.failClosed,
      windowFilled: step.windowFilled,
      didReset: step.didReset,
      labelSource: step.labelSource,
      qualityGate: step.qualityGate,
    };
  }
}

/**
 * Behind-interface `PoseSource` adapter wrapping a 5-class `R22TemporalClassifier` (`FIST/ONE/TWO/FIVE/OTHER`)
 * so a promoted temporal pose head replaces the geometry pose source behind the exact same §A2 contract.
 */
export class TemporalPoseSource implements R22PoseSource {
  readonly id: string;
  readonly clf: R22TemporalClassifier;

  constructor(modelJson: unknown, extractorOpts?: R22TemporalExtractorOptions) {
    this.clf = new R22TemporalClassifier(modelJson, extractorOpts);
    this.id = this.clf.model.name;
  }

  reset(): void {
    this.clf.reset();
  }

  classify(
    lm: Landmark[] | undefined | null,
    nowMs: number,
    aspect: number,
    hint?: TemporalFrameQualityHint,
  ): R22PoseSourceOutput {
    const step = this.clf.step(lm, nowMs, aspect, hint);
    const pose: R22CanvasPoseLabel =
      step.label === "FIST" ||
      step.label === "ONE" ||
      step.label === "TWO" ||
      step.label === "FIVE" ||
      step.label === "OTHER"
        ? step.label
        : "OTHER";
    const fingerCount: 0 | 1 | 2 | 3 | 4 | 5 | null =
      !step.valid
        ? null
        : pose === "FIST"
          ? 0
          : pose === "ONE"
            ? 1
            : pose === "TWO"
              ? 2
              : pose === "FIVE"
                ? 5
                : null;
    return {
      pose,
      fingerCount,
      conf: step.conf,
      probs: step.probs,
      valid: step.valid,
      failClosed: step.failClosed,
      windowFilled: step.windowFilled,
      didReset: step.didReset,
      labelSource: step.labelSource,
      qualityGate: step.qualityGate,
    };
  }
}

export { R19_LABELS, thumbLateral };

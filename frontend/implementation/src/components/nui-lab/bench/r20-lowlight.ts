/**
 * R20/R22 CPU Photometric Preprocessing & Quality Diagnostics (`r20-lowlight.ts`).
 *
 * Existing A4v2 Pipeline Inventory (preserved intact; NOT renamed to A5 — Acceptance ID P01):
 *   1. 320px downscale (`R20_ENHANCE_WIDTH = 320`)
 *   2. Motion-gated temporal EMA (`motionGatedTemporalEmaInPlace`, thresh=24/28, blends static noise)
 *   3. Exact 6-comparison separable 1D median-of-5 (`sepMedian5RgbaInPlace`, impulse spike removal)
 *   4. Conditional 3x3 binomial denoise (`denoise3x3RgbaInPlace`, only when `meanLuma < 0.14`)
 *   5. Chroma-preserving Reinhard tone-mapping LUT (`reinhardExposureLutInPlace`, target=0.48)
 *
 * R22 Fixes & New Candidate Stages (Acceptance IDs P02–P06, P10, G01, G04):
 *   - T2 Audit Fix: `R20_DIM_RECOVERY_LUMA` was 0.52, causing A4 to fire under normal room lighting
 *     (`meanLuma ~ 0.47`). Lowered default activation threshold to `R22_DIM_RECOVERY_LUMA = 0.32`
 *     (configurable; `R20_LEGACY_DIM_RECOVERY_LUMA = 0.52` preserved for audit traceability),
 *     activating only in genuinely dim light or backlight/shadow conditions.
 *   - Pre-LUT Diagnostics (`analyzeFrameLuma`): luma percentiles (`p10`, `p50`, `p95`),
 *     `nearWhiteHandPct` (% pixels with luma >= 250 inside hand ROI, or null if no hand ROI),
 *     `blurProxy` (subsampled 3x3 Laplacian variance sharpness), and `noiseProxy` (local HF MAD).
 *   - `suppressShadowChromaNoiseInPlace`: clamps random RGB chroma spikes in ultra-dark pixels
 *     (`luma < 0.08`) so dark walls aren't lifted into false skin tones.
 *   - `applyHighlightSoftKneeInPlace` & `reinhardWithSoftKneeInPlace`: prevents monitor-lit hand
 *     highlights (`luma > 0.78`) from blowing out to 255 clipping in dark rooms with screen glare.
 *   - `probeCameraExposureCapabilities`: opportunistic, fail-safe inspection of UVC track capabilities.
 */

export const R20_ENHANCE_WIDTH = 320;
export const R20_DARK_LUMA = 0.28;
/** Historical R20 threshold that caused A4 to engage in normal room lighting (~0.47 luma; T2 audit). */
export const R20_LEGACY_DIM_RECOVERY_LUMA = 0.52;
/** R22 calibrated threshold: engage automatic dark recovery only in genuinely dim light (< 0.32) or backlight. */
export const R22_DIM_RECOVERY_LUMA = 0.32;
/** Alias kept for worker compatibility; uses the calibrated R22 threshold (0.32). */
export const R20_DIM_RECOVERY_LUMA = R22_DIM_RECOVERY_LUMA;
export const R20_BACKLIGHT_CENTER_MAX = 0.36;
export const R20_BACKLIGHT_LUMA_GAP = 0.18;
export const R20_LUMA_SAMPLE_INTERVAL_MS = 400;

export const R22_HIGHLIGHT_KNEE_START = 0.78;
export const R22_HIGHLIGHT_KNEE_CEILING = 0.94;
export const R22_SHADOW_CHROMA_MAX_LUMA = 0.045;
export const R22_BLUR_SHARPNESS_WARN_MIN = 40;
export const R22_NOISE_MAD_WARN_MAX = 5.0;
/** R22B B7.1 recalibrated glare threshold (was 8% + p95>=0.94 which fired on ~99% of frames). */
export const R22_GLARE_NEAR_WHITE_WARN_PCT = 25.0;
/** R22B B7.1 recalibrated backlight thresholds (diagnostic only, never gates actions). */
export const R22B_CLIPPED_LUMA_NORM = 0.96;
export const R22B_CLIPPED_LUMA_BYTE = Math.round(R22B_CLIPPED_LUMA_NORM * 255); // 245
export const R22B_BACKLIGHT_CLIPPED_MIN_PCT = 8.0;
export const R22B_BACKLIGHT_ROI_LUMA_MAX = 0.35;

/** Explicit P01 inventory of the existing A4v2 stages (kept as A4v2, never silently renamed). */
export const A4V2_PIPELINE_INVENTORY = Object.freeze({
  id: "A4_denoise_reinhard320",
  enhanceWidth: R20_ENHANCE_WIDTH,
  legacyDimThreshold: R20_LEGACY_DIM_RECOVERY_LUMA,
  calibratedDimThreshold: R22_DIM_RECOVERY_LUMA,
  stages: [
    "downscale320",
    "motionGatedTemporalEmaInPlace",
    "sepMedian5RgbaInPlace",
    "denoise3x3RgbaInPlace(meanLuma<0.14)",
    "reinhardExposureLutInPlace",
  ] as const,
});

export type R22PreprocessPassId =
  | "A0_raw"
  | "A2_clahe320"
  | "A4_denoise_reinhard320"
  | "R22_softknee_shadowclamp320";

export interface NormalizedBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Point2DLike {
  x: number;
  y: number;
}

export interface AnalyzeFrameLumaOptions {
  /** Subsampling stride (default 2). */
  step?: number;
  /** Optional normalized [0,1] hand ROI bounding box. */
  handRoi?: NormalizedBBox | null;
  /** Optional last known hand ROI (used on lost frames, expanded x1.5, for `lastRoiLumaP50`). */
  lastHandRoi?: NormalizedBBox | null;
  /** Optional normalized 21-pt hand landmarks used to derive hand ROI if `handRoi` is not supplied. */
  handLandmarks?: ReadonlyArray<Point2DLike> | null;
  /** Configurable dim-recovery threshold (defaults to `R22_DIM_RECOVERY_LUMA = 0.32`). */
  dimThreshold?: number;
}

export interface FrameLumaDiagnostics {
  meanLuma: number;
  centerLuma: number;
  p10: number;
  p50: number;
  p95: number;
  /** R22B B3/B7.1: % [0..100] of sampled frame pixels with luma >= 0.96 (>= 245/255). */
  clippedPct: number;
  /** R22B B3/B7.1: median luma [0..1] inside active hand ROI bbox, or null when no hand ROI exists. */
  handRoiLumaP50: number | null;
  /** R22B B3/B7.1: median luma [0..1] inside last hand ROI expanded x1.5 on lost frames, else null. */
  lastRoiLumaP50: number | null;
  /** Percentage [0..100] of pixels with luma >= 250 inside hand ROI, or null when no hand ROI is available. */
  nearWhiteHandPct: number | null;
  /** Subsampled 3x3 discrete Laplacian variance on [0..255] luma (higher = sharper). */
  blurProxy: number;
  /** Local high-frequency MAD noise estimate in [0..255] luma units (higher = noisier). */
  noiseProxy: number;
  isDark: boolean;
  isBacklight: boolean;
  isGlareRisk: boolean;
  isBlurry: boolean;
  isNoisy: boolean;
  shouldActivateDimRecovery: boolean;
}

export interface CameraExposureCapabilities {
  supported: boolean;
  hasGetCapabilities: boolean;
  exposureMode: string[] | null;
  exposureTime: { min: number; max: number; step: number } | null;
  exposureCompensation: { min: number; max: number; step: number } | null;
  whiteBalanceMode: string[] | null;
  brightness: { min: number; max: number; step: number } | null;
  contrast: { min: number; max: number; step: number } | null;
  currentExposureMode: string | null;
  currentExposureTime: number | null;
  currentExposureCompensation: number | null;
  currentWhiteBalanceMode: string | null;
  currentBrightness: number | null;
  currentContrast: number | null;
  canAdjustExposure: boolean;
  canLockExposureTime: boolean;
  error: string | null;
}

export function computeMeanAndCenterLuma(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  step = 2,
): { meanLuma: number; centerLuma: number } {
  const x0 = Math.floor(width * 0.25);
  const x1 = Math.min(width, Math.max(x0 + 1, Math.ceil(width * 0.75)));
  const y0 = Math.floor(height * 0.20);
  const y1 = Math.min(height, Math.max(y0 + 1, Math.ceil(height * 0.85)));

  let sumAll = 0;
  let countAll = 0;
  let sumCenter = 0;
  let countCenter = 0;

  for (let y = 0; y < height; y += step) {
    const inY = y >= y0 && y < y1;
    const rowOff = y * width;
    for (let x = 0; x < width; x += step) {
      const idx = (rowOff + x) << 2;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;
      const l = (77 * r + 150 * g + 29 * b + 128) >> 8;
      sumAll += l;
      countAll++;
      if (inY && x >= x0 && x < x1) {
        sumCenter += l;
        countCenter++;
      }
    }
  }
  return {
    meanLuma: countAll > 0 ? sumAll / (countAll * 255) : 0,
    centerLuma: countCenter > 0 ? sumCenter / (countCenter * 255) : 0,
  };
}

/** Derives a padded [0,1] bounding box from 2D hand landmarks, returning null if empty. */
export function handRoiFromLandmarks(
  landmarks: ReadonlyArray<Point2DLike> | null | undefined,
  padding = 0.04,
): NormalizedBBox | null {
  if (!landmarks || landmarks.length === 0) return null;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  let valid = 0;
  for (const pt of landmarks) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
    valid++;
  }
  if (valid === 0) return null;
  return {
    minX: Math.max(0, minX - padding),
    minY: Math.max(0, minY - padding),
    maxX: Math.min(1, maxX + padding),
    maxY: Math.min(1, maxY + padding),
  };
}

function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

function percentileFromHist(hist: Uint32Array, total: number, q: number): number {
  if (total <= 0) return 0;
  const target = Math.max(0, Math.min(total - 1, Math.floor(q * (total - 1))));
  let cum = 0;
  for (let i = 0; i < 256; i++) {
    cum += hist[i]!;
    if (cum > target) return i / 255;
  }
  return 1;
}

function lumaAt(rgba: Uint8ClampedArray, pixIdx: number): number {
  const i = pixIdx << 2;
  return (77 * (rgba[i] ?? 0) + 150 * (rgba[i + 1] ?? 0) + 29 * (rgba[i + 2] ?? 0) + 128) >> 8;
}

/** Expands a normalized [0,1] bounding box around its center by `scaleFactor` (default 1.5x for B3 lastRoiLumaP50). */
export function expandNormalizedBBox(roi: NormalizedBBox, scaleFactor = 1.5): NormalizedBBox {
  const cx = (roi.minX + roi.maxX) * 0.5;
  const cy = (roi.minY + roi.maxY) * 0.5;
  const hw = Math.max(0.01, (roi.maxX - roi.minX) * 0.5 * scaleFactor);
  const hh = Math.max(0.01, (roi.maxY - roi.minY) * 0.5 * scaleFactor);
  return {
    minX: Math.max(0, cx - hw),
    minY: Math.max(0, cy - hh),
    maxX: Math.min(1, cx + hw),
    maxY: Math.min(1, cy + hh),
  };
}

/** Computes median luma [0..1] and near-white % (luma >= 250) inside a normalized [0,1] ROI. */
export function computeRoiLumaStats(
  rgba: Uint8ClampedArray | null | undefined,
  width: number,
  height: number,
  roi: NormalizedBBox | null | undefined,
): { nearWhitePct: number | null; lumaP50: number | null } {
  if (!rgba || !roi || width <= 0 || height <= 0) {
    return { nearWhitePct: null, lumaP50: null };
  }
  const rx0 = Math.max(0, Math.min(width - 1, Math.floor(roi.minX * width)));
  const rx1 = Math.max(rx0 + 1, Math.min(width, Math.ceil(roi.maxX * width)));
  const ry0 = Math.max(0, Math.min(height - 1, Math.floor(roi.minY * height)));
  const ry1 = Math.max(ry0 + 1, Math.min(height, Math.ceil(roi.maxY * height)));
  const hist = new Uint32Array(256);
  let roiCount = 0;
  let whiteCount = 0;
  for (let y = ry0; y < ry1; y++) {
    const rowOff = y * width;
    for (let x = rx0; x < rx1; x++) {
      const l = lumaAt(rgba, rowOff + x);
      const cl = l < 0 ? 0 : l > 255 ? 255 : l;
      hist[cl]!++;
      roiCount++;
      if (cl >= 250) whiteCount++;
    }
  }
  if (roiCount === 0) return { nearWhitePct: null, lumaP50: null };
  return {
    nearWhitePct: roundTo((whiteCount / roiCount) * 100, 2),
    lumaP50: roundTo(percentileFromHist(hist, roiCount, 0.5), 4),
  };
}

/** R22B B7.1 recalibrated backlight diagnostic rule (diagnostic only, never gates actions). */
export function isBacklightCandidateR22B(
  clippedPct: number | null | undefined,
  handRoiLumaP50: number | null | undefined,
  lastRoiLumaP50: number | null | undefined,
): boolean {
  if (typeof clippedPct !== "number" || !Number.isFinite(clippedPct)) return false;
  if (clippedPct < R22B_BACKLIGHT_CLIPPED_MIN_PCT) return false;
  const handDark =
    typeof handRoiLumaP50 === "number" &&
    Number.isFinite(handRoiLumaP50) &&
    handRoiLumaP50 <= R22B_BACKLIGHT_ROI_LUMA_MAX;
  const lastDark =
    typeof lastRoiLumaP50 === "number" &&
    Number.isFinite(lastRoiLumaP50) &&
    lastRoiLumaP50 <= R22B_BACKLIGHT_ROI_LUMA_MAX;
  return handDark || lastDark;
}

/** R22B B7.1 recalibrated glare diagnostic rule (diagnostic only, never gates actions). */
export function isGlareCandidateR22B(nearWhiteHandPct: number | null | undefined): boolean {
  return (
    typeof nearWhiteHandPct === "number" &&
    Number.isFinite(nearWhiteHandPct) &&
    nearWhiteHandPct >= R22_GLARE_NEAR_WHITE_WARN_PCT
  );
}

/**
 * Pre-LUT lighting, glare, sharpness, and noise diagnostics (Acceptance IDs P04, P05, P06, K2, B7.1).
 * Uses zero-allocation integer histograms for O(N) percentile and MAD calculation.
 */
export function analyzeFrameLuma(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: AnalyzeFrameLumaOptions = {},
): FrameLumaDiagnostics {
  const step = Math.max(1, options.step ?? 2);
  const dimThreshold = options.dimThreshold ?? R22_DIM_RECOVERY_LUMA;
  const x0 = Math.floor(width * 0.25);
  const x1 = Math.min(width, Math.max(x0 + 1, Math.ceil(width * 0.75)));
  const y0 = Math.floor(height * 0.20);
  const y1 = Math.min(height, Math.max(y0 + 1, Math.ceil(height * 0.85)));

  const hist = new Uint32Array(256);
  let sumAll = 0;
  let countAll = 0;
  let sumCenter = 0;
  let countCenter = 0;
  let clippedCount = 0;

  for (let y = 0; y < height; y += step) {
    const inY = y >= y0 && y < y1;
    const rowOff = y * width;
    for (let x = 0; x < width; x += step) {
      const l = lumaAt(rgba, rowOff + x);
      const clampedL = l < 0 ? 0 : l > 255 ? 255 : l;
      hist[clampedL]!++;
      sumAll += clampedL;
      countAll++;
      if (clampedL >= R22B_CLIPPED_LUMA_BYTE) clippedCount++;
      if (inY && x >= x0 && x < x1) {
        sumCenter += clampedL;
        countCenter++;
      }
    }
  }

  const meanLuma = countAll > 0 ? sumAll / (countAll * 255) : 0;
  const centerLuma = countCenter > 0 ? sumCenter / (countCenter * 255) : 0;
  const p10 = percentileFromHist(hist, countAll, 0.1);
  const p50 = percentileFromHist(hist, countAll, 0.5);
  const p95 = percentileFromHist(hist, countAll, 0.95);
  const clippedPct = countAll > 0 ? roundTo((clippedCount / countAll) * 100, 2) : 0;

  // Hand ROI near-white glare & median luma (B3 / B7.1)
  const roi = options.handRoi ?? handRoiFromLandmarks(options.handLandmarks);
  let nearWhiteHandPct: number | null = null;
  let handRoiLumaP50: number | null = null;
  let lastRoiLumaP50: number | null = null;
  if (roi && width > 0 && height > 0) {
    const roiStats = computeRoiLumaStats(rgba, width, height, roi);
    nearWhiteHandPct = roiStats.nearWhitePct;
    handRoiLumaP50 = roiStats.lumaP50;
  } else if (options.lastHandRoi && width > 0 && height > 0) {
    const expanded = expandNormalizedBBox(options.lastHandRoi, 1.5);
    lastRoiLumaP50 = computeRoiLumaStats(rgba, width, height, expanded).lumaP50;
  }

  // Subsampled 1-pixel discrete Laplacian variance (sharpness) and local high-frequency MAD (noise)
  let lapSum = 0;
  let lapSqSum = 0;
  let lapCount = 0;
  // Residual histogram in quarter-luma units: |4*c - (l+r+u+d)| in [0..1020]
  const resHist = new Uint32Array(1024);

  if (width >= 3 && height >= 3) {
    for (let y = 1; y < height - 1; y += step) {
      const rowOff = y * width;
      for (let x = 1; x < width - 1; x += step) {
        const p = rowOff + x;
        const c = lumaAt(rgba, p);
        const l = lumaAt(rgba, p - 1);
        const r = lumaAt(rgba, p + 1);
        const u = lumaAt(rgba, p - width);
        const d = lumaAt(rgba, p + width);
        const lap = 4 * c - l - r - u - d;
        lapSum += lap;
        lapSqSum += lap * lap;
        lapCount++;
        const absLap = lap < 0 ? -lap : lap;
        resHist[absLap < 1024 ? absLap : 1023]!++;
      }
    }
  }

  const blurProxy =
    lapCount > 0
      ? Math.max(0, lapSqSum / lapCount - (lapSum / lapCount) ** 2)
      : 0;

  let noiseProxy = 0;
  if (lapCount > 0) {
    const target = Math.floor(lapCount * 0.5);
    let cum = 0;
    let medQuarter = 0;
    for (let i = 0; i < 1024; i++) {
      cum += resHist[i]!;
      if (cum > target) {
        medQuarter = i;
        break;
      }
    }
    // Convert |lap| = 4 * |c - mean4| to sigma estimate: 1.4826 / sqrt(1.25) / 4 ≈ 0.3315
    noiseProxy = medQuarter * 0.3315;
  }

  // B7.1 recalibrated diagnostic rules:
  //  - backlightCandidate = clippedPct >= 8% AND (handRoiLumaP50 <= 0.35 OR lastRoiLumaP50 <= 0.35)
  //  - GLARE_CANDIDATE = nearWhiteHandPct >= 25%
  const isBacklight = isBacklightCandidateR22B(clippedPct, handRoiLumaP50, lastRoiLumaP50);
  const isDark = meanLuma < R20_DARK_LUMA || isBacklight;
  const isGlareRisk = isGlareCandidateR22B(nearWhiteHandPct);
  const isBlurry = lapCount > 0 && blurProxy < R22_BLUR_SHARPNESS_WARN_MIN;
  const isNoisy = noiseProxy >= R22_NOISE_MAD_WARN_MAX;
  const shouldActivateDimRecovery = meanLuma < dimThreshold || isBacklight;

  return {
    meanLuma: roundTo(meanLuma, 4),
    centerLuma: roundTo(centerLuma, 4),
    p10: roundTo(p10, 4),
    p50: roundTo(p50, 4),
    p95: roundTo(p95, 4),
    clippedPct,
    handRoiLumaP50,
    lastRoiLumaP50,
    nearWhiteHandPct,
    blurProxy: roundTo(blurProxy, 2),
    noiseProxy: roundTo(noiseProxy, 2),
    isDark,
    isBacklight,
    isGlareRisk,
    isBlurry,
    isNoisy,
    shouldActivateDimRecovery,
  };
}

/** Exact median of 5 bytes using a 6-comparison sorting network (zero allocations). */
export function median5(a: number, b: number, c: number, d: number, e: number): number {
  let t: number;
  if (a > b) {
    t = a;
    a = b;
    b = t;
  }
  if (c > d) {
    t = c;
    c = d;
    d = t;
  }
  if (a > c) {
    t = a;
    a = c;
    c = t;
    t = b;
    b = d;
    d = t;
  }
  if (e > b) {
    t = e;
    e = b;
    b = t;
  }
  return e <= c ? (b < c ? b : c) : e < d ? e : d;
}

/**
 * Separable 1D median-of-5 (horizontal then vertical) on RGB channels.
 * Removes low-light Poisson/read impulse spikes while preserving finger edges.
 */
export function sepMedian5RgbaInPlace(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  scratch?: Uint8ClampedArray,
): void {
  if (width < 5 || height < 5) return;
  const nBytes = width * height * 4;
  const tmp = scratch && scratch.length >= nBytes ? scratch : new Uint8ClampedArray(nBytes);

  // Horizontal 5-tap median -> tmp
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const x0 = x < 2 ? 0 : x - 2;
      const x1 = x < 1 ? 0 : x - 1;
      const x3 = x + 1 >= width ? width - 1 : x + 1;
      const x4 = x + 2 >= width ? width - 1 : x + 2;
      const o = (row + x) << 2;
      const i0 = (row + x0) << 2;
      const i1 = (row + x1) << 2;
      const i3 = (row + x3) << 2;
      const i4 = (row + x4) << 2;
      tmp[o] = median5(rgba[i0]!, rgba[i1]!, rgba[o]!, rgba[i3]!, rgba[i4]!);
      tmp[o + 1] = median5(rgba[i0 + 1]!, rgba[i1 + 1]!, rgba[o + 1]!, rgba[i3 + 1]!, rgba[i4 + 1]!);
      tmp[o + 2] = median5(rgba[i0 + 2]!, rgba[i1 + 2]!, rgba[o + 2]!, rgba[i3 + 2]!, rgba[i4 + 2]!);
      tmp[o + 3] = 255;
    }
  }

  // Vertical 5-tap median -> rgba
  for (let y = 0; y < height; y++) {
    const y0 = y < 2 ? 0 : y - 2;
    const y1 = y < 1 ? 0 : y - 1;
    const y3 = y + 1 >= height ? height - 1 : y + 1;
    const y4 = y + 2 >= height ? height - 1 : y + 2;
    const r0 = y0 * width;
    const r1 = y1 * width;
    const r2 = y * width;
    const r3 = y3 * width;
    const r4 = y4 * width;
    for (let x = 0; x < width; x++) {
      const o = (r2 + x) << 2;
      const i0 = (r0 + x) << 2;
      const i1 = (r1 + x) << 2;
      const i3 = (r3 + x) << 2;
      const i4 = (r4 + x) << 2;
      rgba[o] = median5(tmp[i0]!, tmp[i1]!, tmp[o]!, tmp[i3]!, tmp[i4]!);
      rgba[o + 1] = median5(tmp[i0 + 1]!, tmp[i1 + 1]!, tmp[o + 1]!, tmp[i3 + 1]!, tmp[i4 + 1]!);
      rgba[o + 2] = median5(tmp[i0 + 2]!, tmp[i1 + 2]!, tmp[o + 2]!, tmp[i3 + 2]!, tmp[i4 + 2]!);
    }
  }
}

/** 3x3 binomial denoise on RGB channels (used only in near-black scenes after median). */
export function denoise3x3RgbaInPlace(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  scratch?: Uint8ClampedArray,
): void {
  const nBytes = width * height * 4;
  const copy = scratch && scratch.length >= nBytes ? scratch : new Uint8ClampedArray(nBytes);
  copy.set(rgba.subarray(0, nBytes));
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const cIdx = (y * width + x) << 2;
      for (let ch = 0; ch < 3; ch++) {
        const sum =
          (copy[((y - 1) * width + (x - 1)) * 4 + ch]! +
            (copy[((y - 1) * width + x) * 4 + ch]! << 1) +
            copy[((y - 1) * width + (x + 1)) * 4 + ch]! +
            (copy[(y * width + (x - 1)) * 4 + ch]! << 1) +
            (copy[cIdx + ch]! << 2) +
            (copy[(y * width + (x + 1)) * 4 + ch]! << 1) +
            copy[((y + 1) * width + (x - 1)) * 4 + ch]! +
            (copy[((y + 1) * width + x) * 4 + ch]! << 1) +
            copy[((y + 1) * width + (x + 1)) * 4 + ch]! +
            8) >>
          4;
        rgba[cIdx + ch] = sum;
      }
    }
  }
}

/**
 * Motion-gated temporal EMA on the 320px RGBA buffer.
 * Blends current pixel with previous temporal buffer ONLY when |curr - prev| < motionThresh,
 * suppressing stationary/slow low-light shot noise while preventing motion ghosting on moving hands.
 */
export function motionGatedTemporalEmaInPlace(
  rgba: Uint8ClampedArray,
  prev: Uint8ClampedArray | null,
  motionThresh = 28,
): Uint8ClampedArray {
  const n = rgba.length;
  if (!prev || prev.length !== n) {
    return new Uint8ClampedArray(rgba);
  }
  for (let i = 0; i < n; i += 4) {
    const dr = Math.abs(rgba[i]! - prev[i]!);
    const dg = Math.abs(rgba[i + 1]! - prev[i + 1]!);
    const db = Math.abs(rgba[i + 2]! - prev[i + 2]!);
    if (dr < motionThresh && dg < motionThresh && db < motionThresh) {
      const nr = (rgba[i]! * 3 + prev[i]! * 5 + 4) >> 3;
      const ng = (rgba[i + 1]! * 3 + prev[i + 1]! * 5 + 4) >> 3;
      const nb = (rgba[i + 2]! * 3 + prev[i + 2]! * 5 + 4) >> 3;
      rgba[i] = nr;
      rgba[i + 1] = ng;
      rgba[i + 2] = nb;
      prev[i] = nr;
      prev[i + 1] = ng;
      prev[i + 2] = nb;
    } else {
      prev[i] = rgba[i]!;
      prev[i + 1] = rgba[i + 1]!;
      prev[i + 2] = rgba[i + 2]!;
    }
  }
  return prev;
}

/**
 * Deep-shadow chroma noise clamp (R22 candidate stage, P06):
 * Pulls spurious RGB chroma spikes in ultra-dark background pixels (`luma < maxLumaNorm`)
 * smoothly toward neutral luma while leaving lit skin (`luma >= maxLumaNorm`) untouched.
 */
export function suppressShadowChromaNoiseInPlace(
  rgba: Uint8ClampedArray,
  maxLumaNorm = R22_SHADOW_CHROMA_MAX_LUMA,
  strength = 0.85,
): void {
  const maxLumaByte = Math.max(1, Math.round(maxLumaNorm * 255));
  const clampedStrength = Math.max(0, Math.min(1, strength));
  if (clampedStrength <= 0) return;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const l = (77 * r + 150 * g + 29 * b + 128) >> 8;
    if (l < maxLumaByte) {
      const w = clampedStrength * (1 - l / maxLumaByte);
      rgba[i] = Math.round(r + w * (l - r));
      rgba[i + 1] = Math.round(g + w * (l - g));
      rgba[i + 2] = Math.round(b + w * (l - b));
    }
  }
}

/**
 * Highlight soft-knee protection (R22 candidate stage, P04):
 * Smoothly compresses bright monitor-lit highlights (`peak > kneeStart`) below `kneeCeiling`
 * using uniform channel scaling so RGB chromaticity stays intact without 255 white clipping.
 * Pixels with peak <= `kneeStart` are untouched.
 */
export function applyHighlightSoftKneeInPlace(
  rgba: Uint8ClampedArray,
  kneeStart = R22_HIGHLIGHT_KNEE_START,
  kneeCeiling = R22_HIGHLIGHT_KNEE_CEILING,
  strength = 1.0,
): void {
  const ks = Math.max(0.5, Math.min(0.95, kneeStart));
  const kc = Math.max(ks + 0.02, Math.min(0.99, kneeCeiling));
  const clampedStrength = Math.max(0, Math.min(1, strength));
  if (clampedStrength <= 0) return;

  const headroom = 1 - ks;
  const targetHeadroom = kc - ks;
  const kneeByte = Math.floor(ks * 255);
  const scaleLut = new Float32Array(256);
  scaleLut.fill(1);

  if (headroom > 1e-6) {
    const c = headroom / targetHeadroom - 1;
    for (let i = kneeByte + 1; i < 256; i++) {
      const x = i / 255;
      const u = (x - ks) / headroom;
      const s = u / (1 + c * u);
      const yKnee = ks + targetHeadroom * s;
      const y = x + clampedStrength * (yKnee - x);
      scaleLut[i] = y / x;
    }
  }

  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const peak = r >= g ? (r >= b ? r : b) : g >= b ? g : b;
    if (peak > kneeByte) {
      const sc = scaleLut[peak]!;
      rgba[i] = Math.round(r * sc);
      rgba[i + 1] = Math.round(g * sc);
      rgba[i + 2] = Math.round(b * sc);
    }
  }
}

/**
 * Chroma-preserving Reinhard tone-mapping LUT: y = (k * x) / (1 + (k - 1) * x).
 * Maps [0, 1] -> [0, 1] smoothly without hard highlight clipping or skin-tone desaturation.
 */
export function reinhardExposureLutInPlace(
  rgba: Uint8ClampedArray,
  meanLuma: number,
  targetLuma = 0.48,
): void {
  const m = Math.max(meanLuma, 0.015);
  const k = Math.max(1.0, Math.min(14.0, targetLuma / m));
  if (k <= 1.04) return;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    const y = (k * x) / (1 + (k - 1) * x);
    const v = Math.round(y * 255);
    lut[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = lut[rgba[i]!]!;
    rgba[i + 1] = lut[rgba[i + 1]!]!;
    rgba[i + 2] = lut[rgba[i + 2]!]!;
  }
}

/**
 * Reinhard tone-mapping LUT combined with C1-monotone highlight soft-knee protection (P04):
 * lifts dark shadows/midtones while keeping bright highlights (`x > kneeStart`) below `kneeCeiling`
 * so monitor glare does not saturate finger shading to 255 white.
 */
export function reinhardWithSoftKneeInPlace(
  rgba: Uint8ClampedArray,
  meanLuma: number,
  targetLuma = 0.48,
  kneeStart = R22_HIGHLIGHT_KNEE_START,
  kneeCeiling = R22_HIGHLIGHT_KNEE_CEILING,
): void {
  const m = Math.max(meanLuma, 0.015);
  const k = Math.max(1.0, Math.min(14.0, targetLuma / m));
  if (k <= 1.04) {
    applyHighlightSoftKneeInPlace(rgba, kneeStart, kneeCeiling, 1.0);
    return;
  }
  const ks = Math.max(0.5, Math.min(0.95, kneeStart));
  const kc = Math.max(ks + 0.02, Math.min(0.99, kneeCeiling));
  const headroom = 1 - ks;
  const targetHeadroom = kc - ks;
  const c = headroom > 1e-6 ? headroom / targetHeadroom - 1 : 0;

  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    const yRaw = (k * x) / (1 + (k - 1) * x);
    let y = yRaw;
    if (yRaw > ks && headroom > 1e-6) {
      const u = (yRaw - ks) / headroom;
      const s = u / (1 + c * u);
      y = ks + targetHeadroom * s;
    }
    const v = Math.round(y * 255);
    lut[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = lut[rgba[i]!]!;
    rgba[i + 1] = lut[rgba[i + 1]!]!;
    rgba[i + 2] = lut[rgba[i + 2]!]!;
  }
}

/** Legacy 8x8 tile CLAHE on luma (kept as explicit comparator mode "clahe"). */
export function claheRgbaInPlace(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  clipLimit = 2.0,
): void {
  const tx = Math.max(1, Math.min(8, width));
  const ty = Math.max(1, Math.min(8, height));
  const nPix = width * height;
  const luma = new Uint8Array(nPix);
  for (let i = 0; i < nPix; i++) {
    const j = i << 2;
    luma[i] = (77 * rgba[j]! + 150 * rgba[j + 1]! + 29 * rgba[j + 2]! + 128) >> 8;
  }
  const lut = new Uint8Array(ty * tx * 256);
  const hist = new Int32Array(256);
  for (let tyi = 0; tyi < ty; tyi++) {
    const y0 = Math.floor((tyi * height) / ty);
    const y1 = Math.floor(((tyi + 1) * height) / ty);
    for (let txi = 0; txi < tx; txi++) {
      const x0 = Math.floor((txi * width) / tx);
      const x1 = Math.floor(((txi + 1) * width) / tx);
      hist.fill(0);
      for (let y = y0; y < y1; y++) {
        const row = y * width;
        for (let x = x0; x < x1; x++) hist[luma[row + x]!]!++;
      }
      const area = Math.max(1, (y1 - y0) * (x1 - x0));
      const limit = Math.max(1, Math.floor((clipLimit * area) / 256));
      let excess = 0;
      for (let b = 0; b < 256; b++) {
        if (hist[b]! > limit) {
          excess += hist[b]! - limit;
          hist[b] = limit;
        }
      }
      const batch = Math.floor(excess / 256);
      const residual = excess % 256;
      for (let b = 0; b < 256; b++) hist[b]! += batch;
      if (residual > 0) {
        const step = Math.max(1, Math.floor(256 / residual));
        let left = residual;
        for (let b = 0; b < 256 && left > 0; b += step) {
          hist[b]!++;
          left--;
        }
      }
      const baseOff = (tyi * tx + txi) * 256;
      let cum = 0;
      for (let b = 0; b < 256; b++) {
        const h = hist[b]!;
        const mapped = Math.round(((cum + h * 0.5) * 255) / area);
        lut[baseOff + b] = mapped < 0 ? 0 : mapped > 255 ? 255 : mapped;
        cum += h;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    const fy = ((y + 0.5) * ty) / height - 0.5;
    let ya = Math.floor(fy);
    let wy = fy - ya;
    if (ya < 0) {
      ya = 0;
      wy = 0;
    } else if (ya >= ty - 1) {
      ya = ty - 1;
      wy = 0;
    }
    const yb = Math.min(ya + 1, ty - 1);
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const fx = ((x + 0.5) * tx) / width - 0.5;
      let xa = Math.floor(fx);
      let wx = fx - xa;
      if (xa < 0) {
        xa = 0;
        wx = 0;
      } else if (xa >= tx - 1) {
        xa = tx - 1;
        wx = 0;
      }
      const xb = Math.min(xa + 1, tx - 1);
      const p = row + x;
      const lv = luma[p]!;
      const l00 = lut[(ya * tx + xa) * 256 + lv]!;
      const l01 = lut[(ya * tx + xb) * 256 + lv]!;
      const l10 = lut[(yb * tx + xa) * 256 + lv]!;
      const l11 = lut[(yb * tx + xb) * 256 + lv]!;
      const mapped = Math.round(l00 + (l01 - l00) * wx + (l10 + (l11 - l10) * wx - (l00 + (l01 - l00) * wx)) * wy);
      const delta = mapped - lv;
      const j = p << 2;
      const r = rgba[j]! + delta;
      const g = rgba[j + 1]! + delta;
      const b = rgba[j + 2]! + delta;
      rgba[j] = r < 0 ? 0 : r > 255 ? 255 : r;
      rgba[j + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      rgba[j + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  }
}

/**
 * Full A4v2 chroma-preserving low-light enhancement in-place on 320px RGBA buffer.
 */
export function applyA4ChromaRecoveryInPlace(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  meanLuma: number,
  temporalPrev: Uint8ClampedArray | null,
  scratch?: Uint8ClampedArray,
): Uint8ClampedArray {
  const nextPrev = motionGatedTemporalEmaInPlace(rgba, temporalPrev, 24);
  sepMedian5RgbaInPlace(rgba, width, height, scratch);
  if (meanLuma < 0.14) {
    denoise3x3RgbaInPlace(rgba, width, height, scratch);
  }
  reinhardExposureLutInPlace(rgba, meanLuma, 0.48);
  return nextPrev;
}

export interface R22CandidateRecoveryOptions {
  /** Select `"a4"` for A4v2 or `"r22_softknee_shadowclamp"` for the R22 candidate (default). */
  variant?: "a4" | "r22_softknee_shadowclamp";
  kneeStart?: number;
  kneeCeiling?: number;
  shadowChromaMaxLuma?: number;
  shadowChromaStrength?: number;
}

/**
 * R22 Candidate Preprocessing Pipeline (`R22_softknee_shadowclamp320`):
 * Builds transparently on A4v2 by adding pre-EMA shadow chroma clamping (`luma < 0.08`)
 * and highlight soft-knee protection (`luma > 0.78`) around Reinhard exposure lift.
 */
export function applyR22CandidateRecoveryInPlace(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  meanLuma: number,
  temporalPrev: Uint8ClampedArray | null,
  scratch?: Uint8ClampedArray,
  options: R22CandidateRecoveryOptions = {},
): Uint8ClampedArray {
  if (options.variant === "a4") {
    return applyA4ChromaRecoveryInPlace(rgba, width, height, meanLuma, temporalPrev, scratch);
  }
  suppressShadowChromaNoiseInPlace(
    rgba,
    options.shadowChromaMaxLuma ?? R22_SHADOW_CHROMA_MAX_LUMA,
    options.shadowChromaStrength ?? 0.65,
  );
  const nextPrev = motionGatedTemporalEmaInPlace(rgba, temporalPrev, 24);
  sepMedian5RgbaInPlace(rgba, width, height, scratch);
  if (meanLuma < 0.14) {
    denoise3x3RgbaInPlace(rgba, width, height, scratch);
  }
  reinhardWithSoftKneeInPlace(
    rgba,
    meanLuma,
    0.48,
    options.kneeStart ?? R22_HIGHLIGHT_KNEE_START,
    options.kneeCeiling ?? R22_HIGHLIGHT_KNEE_CEILING,
  );
  return nextPrev;
}

function parseRangeCapability(raw: unknown): { min: number; max: number; step: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.min === "number" && typeof r.max === "number" && Number.isFinite(r.min) && Number.isFinite(r.max)) {
    return {
      min: r.min,
      max: r.max,
      step: typeof r.step === "number" && Number.isFinite(r.step) ? r.step : 0.1,
    };
  }
  return null;
}

function parseStringList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const items = raw.filter((v): v is string => typeof v === "string");
  return items.length > 0 ? items : null;
}

/**
 * Opportunistic UVC camera capability probe (P10):
 * Safely inspects `track.getCapabilities?.()` and `track.getSettings?.()` for exposure & white-balance
 * controls without throwing or depending on hardware support.
 */
export function probeCameraExposureCapabilities(
  track: MediaStreamTrack | null | undefined,
): CameraExposureCapabilities {
  const empty: CameraExposureCapabilities = {
    supported: false,
    hasGetCapabilities: false,
    exposureMode: null,
    exposureTime: null,
    exposureCompensation: null,
    whiteBalanceMode: null,
    brightness: null,
    contrast: null,
    currentExposureMode: null,
    currentExposureTime: null,
    currentExposureCompensation: null,
    currentWhiteBalanceMode: null,
    currentBrightness: null,
    currentContrast: null,
    canAdjustExposure: false,
    canLockExposureTime: false,
    error: null,
  };
  if (!track) return empty;
  const hasGetCapabilities = typeof track.getCapabilities === "function";
  let caps: Record<string, unknown> = {};
  let settings: Record<string, unknown> = {};
  try {
    if (hasGetCapabilities) {
      caps = (track.getCapabilities() ?? {}) as Record<string, unknown>;
    }
    if (typeof track.getSettings === "function") {
      settings = (track.getSettings() ?? {}) as Record<string, unknown>;
    }
  } catch (err) {
    return {
      ...empty,
      hasGetCapabilities,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const exposureMode = parseStringList(caps.exposureMode);
  const exposureTime = parseRangeCapability(caps.exposureTime);
  const exposureCompensation = parseRangeCapability(caps.exposureCompensation);
  const whiteBalanceMode = parseStringList(caps.whiteBalanceMode);
  const brightness = parseRangeCapability(caps.brightness);
  const contrast = parseRangeCapability(caps.contrast);
  const canLockExposureTime = Boolean(exposureMode?.includes("manual") && exposureTime !== null);
  const canAdjustExposure = Boolean(exposureCompensation || canLockExposureTime || (exposureMode && exposureMode.includes("manual")));
  const supported = Boolean(
    hasGetCapabilities && (exposureMode || exposureTime || exposureCompensation || whiteBalanceMode || brightness || contrast),
  );

  return {
    supported,
    hasGetCapabilities,
    exposureMode,
    exposureTime,
    exposureCompensation,
    whiteBalanceMode,
    brightness,
    contrast,
    currentExposureMode: typeof settings.exposureMode === "string" ? settings.exposureMode : null,
    currentExposureTime:
      typeof settings.exposureTime === "number" && Number.isFinite(settings.exposureTime)
        ? settings.exposureTime
        : null,
    currentExposureCompensation:
      typeof settings.exposureCompensation === "number" && Number.isFinite(settings.exposureCompensation)
        ? settings.exposureCompensation
        : null,
    currentWhiteBalanceMode: typeof settings.whiteBalanceMode === "string" ? settings.whiteBalanceMode : null,
    currentBrightness:
      typeof settings.brightness === "number" && Number.isFinite(settings.brightness)
        ? settings.brightness
        : null,
    currentContrast:
      typeof settings.contrast === "number" && Number.isFinite(settings.contrast)
        ? settings.contrast
        : null,
    canAdjustExposure,
    canLockExposureTime,
    error: null,
  };
}

// =========================================================================
// R23B-HF3 Low-Light Camera Helpers ("tajam dulu, baru terang")
// =========================================================================

export const HF3_EXPOSURE_LOW_FPS_THRESHOLD = 20;
export const HF3_EXPOSURE_LOW_FPS_DURATION_MS = 2000;
export const HF3_EXPOSURE_VERIFY_WINDOW_MS = 3000;

export const HF3_AUTO_PREPROCESS_PASS = "A4_denoise_reinhard320" as const;
export const HF3_AUTO_PREPROCESS_ON_LUMA = 0.15;
export const HF3_AUTO_PREPROCESS_ON_DUR_MS = 1000;
export const HF3_AUTO_PREPROCESS_OFF_LUMA = 0.22;
export const HF3_AUTO_PREPROCESS_OFF_DUR_MS = 2000;

export const HF3_BLACK_FRAME_DURATION_MS = 2000;
export const HF3_CAMERA_BLACK_MESSAGE = "Kamera hitam. Cek penutup kamera atau pilih kamera lain.";

export type ExposureTimeUnit = "s" | "ms" | "100us" | "us";

/**
 * Computes the nearest valid `exposureTime` step that fits 30 fps (<= 33.3 ms), respecting
 * the capability's reported range & inferred unit (W3C Image Capture standard is 100 us units).
 */
export function computeTargetExposureTimeFor30Fps(range: {
  min: number;
  max: number;
  step: number;
}): { target: number; unit: ExposureTimeUnit; maxFor30Fps: number } {
  let unit: ExposureTimeUnit;
  let maxFor30Fps: number;
  if (range.max <= 2) {
    unit = "s";
    maxFor30Fps = 1 / 30;
  } else if (range.max <= 250) {
    unit = "ms";
    maxFor30Fps = 1000 / 30;
  } else if (range.max <= 50_000) {
    unit = "100us";
    maxFor30Fps = 10_000 / 30; // W3C Image Capture standard: 1 unit = 100 us -> 33.33 ms = 333.33
  } else {
    unit = "us";
    maxFor30Fps = 1_000_000 / 30;
  }

  if (maxFor30Fps <= range.min) {
    return { target: range.min, unit, maxFor30Fps };
  }
  if (maxFor30Fps >= range.max) {
    return { target: range.max, unit, maxFor30Fps };
  }

  const step = range.step > 0 && Number.isFinite(range.step) ? range.step : unit === "s" ? 0.001 : 1;
  const k = Math.floor((maxFor30Fps - range.min + 1e-9) / step);
  const raw = Math.min(range.max, Math.max(range.min, range.min + k * step));
  const decimals = unit === "s" ? 6 : 3;
  const factor = 10 ** decimals;
  const target = Math.round(raw * factor) / factor;
  return { target, unit, maxFor30Fps };
}

export type ExposureControlState =
  | "unsupported"
  | "monitoring"
  | "locking"
  | "locked_verifying"
  | "locked_ok"
  | "reverted";

export interface ExposureControlStatus {
  supported: boolean;
  state: ExposureControlState;
  attempted: boolean;
  locked: boolean;
  reverted: boolean;
  targetExposureTime: number | null;
  unit: ExposureTimeUnit | null;
  beforeExposureMode: string | null;
  beforeExposureTime: number | null;
  afterExposureMode: string | null;
  afterExposureTime: number | null;
  reason: string | null;
}

export interface ExposureControllerCallbacks {
  onLocked?: (detail: {
    beforeExposureMode: string | null;
    beforeExposureTime: number | null;
    afterExposureMode: "manual";
    afterExposureTime: number;
    unit: ExposureTimeUnit;
    fpsBeforeLock: number;
  }) => void;
  onReverted?: (detail: {
    reason: "fps-did-not-rise" | "apply-constraints-error";
    beforeExposureMode: string | null;
    beforeExposureTime: number | null;
    afterExposureMode: string;
    fpsBeforeLock: number;
    fpsAtRevert: number | null;
    error: string | null;
  }) => void;
  onStatusChange?: (status: ExposureControlStatus) => void;
}

/**
 * R23B-HF3 Step 2 controller:
 * Watches `uniqueCaptureFps`. If FPS stays `< 20` for `>= 2 s` and the track supports
 * `exposureMode: "manual"` + `exposureTime`, locks `exposureTime` to <= 33.3 ms (30 fps).
 * If FPS does not rise within `3 s` or `applyConstraints` fails, reverts to auto (`continuous`).
 */
export class CameraExposureController {
  private readonly track: MediaStreamTrack | null;
  private readonly caps: CameraExposureCapabilities;
  private readonly callbacks: ExposureControllerCallbacks;
  private state: ExposureControlState;
  private lowFpsSinceMs: number | null = null;
  private lockedAtMs: number | null = null;
  private fpsBeforeLock = 0;
  private attempted = false;
  private locked = false;
  private reverted = false;
  private targetExposureTime: number | null = null;
  private unit: ExposureTimeUnit | null = null;
  private beforeExposureMode: string | null;
  private beforeExposureTime: number | null;
  private afterExposureMode: string | null = null;
  private afterExposureTime: number | null = null;
  private reason: string | null = null;
  private disposed = false;

  constructor(
    track: MediaStreamTrack | null | undefined,
    caps?: CameraExposureCapabilities | null,
    callbacks: ExposureControllerCallbacks = {},
  ) {
    this.track = track ?? null;
    this.caps = caps ?? probeCameraExposureCapabilities(this.track);
    this.callbacks = callbacks;
    this.beforeExposureMode = this.caps.currentExposureMode;
    this.beforeExposureTime = this.caps.currentExposureTime;

    const hasApply = Boolean(this.track && typeof this.track.applyConstraints === "function");
    if (this.caps.canLockExposureTime && this.caps.exposureTime && hasApply) {
      const computed = computeTargetExposureTimeFor30Fps(this.caps.exposureTime);
      this.targetExposureTime = computed.target;
      this.unit = computed.unit;
      this.state = "monitoring";
    } else {
      this.state = "unsupported";
      this.reason = !this.caps.hasGetCapabilities
        ? "no-getCapabilities"
        : !this.caps.exposureMode?.includes("manual")
          ? "no-manual-exposureMode"
          : !this.caps.exposureTime
            ? "no-exposureTime"
            : "no-applyConstraints";
    }
  }

  /** True once Step 2 has finished (either unsupported, locked_ok, or reverted). Used to gate Momo ASK_LIGHT. */
  get hasAttemptedOrUnsupported(): boolean {
    return this.state === "unsupported" || this.state === "locked_ok" || this.state === "reverted";
  }

  getStatus(): ExposureControlStatus {
    return {
      supported: this.state !== "unsupported",
      state: this.state,
      attempted: this.attempted,
      locked: this.locked,
      reverted: this.reverted,
      targetExposureTime: this.targetExposureTime,
      unit: this.unit,
      beforeExposureMode: this.beforeExposureMode,
      beforeExposureTime: this.beforeExposureTime,
      afterExposureMode: this.afterExposureMode,
      afterExposureTime: this.afterExposureTime,
      reason: this.reason,
    };
  }

  dispose(): void {
    this.disposed = true;
  }

  private emitStatus(): void {
    this.callbacks.onStatusChange?.(this.getStatus());
  }

  async update(uniqueCaptureFps: number | null, nowMs: number): Promise<ExposureControlStatus> {
    if (this.disposed || this.state === "unsupported" || this.state === "locking" || this.state === "locked_ok" || this.state === "reverted") {
      return this.getStatus();
    }
    if (uniqueCaptureFps === null || !Number.isFinite(uniqueCaptureFps)) {
      return this.getStatus();
    }

    if (this.state === "monitoring") {
      if (uniqueCaptureFps > 0 && uniqueCaptureFps < HF3_EXPOSURE_LOW_FPS_THRESHOLD) {
        if (this.lowFpsSinceMs === null) {
          this.lowFpsSinceMs = nowMs;
        } else if (nowMs - this.lowFpsSinceMs >= HF3_EXPOSURE_LOW_FPS_DURATION_MS) {
          await this.lockExposure(uniqueCaptureFps, nowMs);
        }
      } else {
        this.lowFpsSinceMs = null;
      }
      return this.getStatus();
    }

    if (this.state === "locked_verifying" && this.lockedAtMs !== null) {
      const elapsed = nowMs - this.lockedAtMs;
      const fpsRose =
        uniqueCaptureFps >= HF3_EXPOSURE_LOW_FPS_THRESHOLD ||
        (uniqueCaptureFps >= Math.max(12, this.fpsBeforeLock + 4));
      if (fpsRose && elapsed > 0) {
        this.state = "locked_ok";
        this.reason = "fps-recovered";
        this.emitStatus();
        return this.getStatus();
      }
      if (elapsed >= HF3_EXPOSURE_VERIFY_WINDOW_MS) {
        await this.revertToAuto("fps-did-not-rise", uniqueCaptureFps, null);
      }
    }

    return this.getStatus();
  }

  private async lockExposure(fpsNow: number, nowMs: number): Promise<void> {
    if (!this.track || this.targetExposureTime === null || this.unit === null) return;
    this.state = "locking";
    this.attempted = true;
    this.fpsBeforeLock = Math.round(fpsNow * 10) / 10;

    // Refresh current settings immediately before lock if available
    const latest = probeCameraExposureCapabilities(this.track);
    this.beforeExposureMode = latest.currentExposureMode ?? this.beforeExposureMode;
    this.beforeExposureTime = latest.currentExposureTime ?? this.beforeExposureTime;

    const target = this.targetExposureTime;
    try {
      await this.track.applyConstraints({
        advanced: [{ exposureMode: "manual", exposureTime: target } as MediaTrackConstraintSet],
      });
      if (this.disposed) return;
      const after = probeCameraExposureCapabilities(this.track);
      this.locked = true;
      this.lockedAtMs = nowMs;
      this.afterExposureMode = after.currentExposureMode ?? "manual";
      this.afterExposureTime = after.currentExposureTime ?? target;
      this.state = "locked_verifying";
      this.reason = "locked-awaiting-fps";
      this.callbacks.onLocked?.({
        beforeExposureMode: this.beforeExposureMode,
        beforeExposureTime: this.beforeExposureTime,
        afterExposureMode: "manual",
        afterExposureTime: this.afterExposureTime,
        unit: this.unit,
        fpsBeforeLock: this.fpsBeforeLock,
      });
      this.emitStatus();
    } catch (err) {
      if (this.disposed) return;
      const msg = err instanceof Error ? err.message : String(err);
      await this.revertToAuto("apply-constraints-error", fpsNow, msg);
    }
  }

  private async revertToAuto(
    reason: "fps-did-not-rise" | "apply-constraints-error",
    fpsAtRevert: number | null,
    errorMsg: string | null,
  ): Promise<void> {
    const revertMode = this.caps.exposureMode?.includes("continuous")
      ? "continuous"
      : (this.beforeExposureMode ?? "continuous");
    const prevMode = this.afterExposureMode ?? "manual";
    const prevTime = this.afterExposureTime ?? this.targetExposureTime;

    if (this.track && typeof this.track.applyConstraints === "function") {
      try {
        await this.track.applyConstraints({
          advanced: [{ exposureMode: revertMode } as MediaTrackConstraintSet],
        });
      } catch {
        /* best-effort revert */
      }
    }
    if (this.disposed) return;
    this.locked = false;
    this.reverted = true;
    this.state = "reverted";
    this.afterExposureMode = revertMode;
    this.afterExposureTime = null;
    this.reason = reason;
    this.callbacks.onReverted?.({
      reason,
      beforeExposureMode: prevMode,
      beforeExposureTime: prevTime,
      afterExposureMode: revertMode,
      fpsBeforeLock: this.fpsBeforeLock,
      fpsAtRevert: fpsAtRevert !== null ? Math.round(fpsAtRevert * 10) / 10 : null,
      error: errorMsg,
    });
    this.emitStatus();
  }
}

export interface AutoPreprocessStatus {
  mode: typeof HF3_AUTO_PREPROCESS_PASS;
  onThresholdLuma: number;
  offThresholdLuma: number;
  active: boolean;
  onCount: number;
  offCount: number;
  lastLumaSource: "handRoiLumaP50" | "lumaP50" | "none";
  lastEffectiveLuma: number | null;
}

export interface AutoPreprocessUpdateResult {
  active: boolean;
  transition: "ON" | "OFF" | null;
  effectiveLuma: number | null;
  lumaSource: "handRoiLumaP50" | "lumaP50" | "none";
  status: AutoPreprocessStatus;
}

/**
 * R23B-HF3 Step 3 auto-brightener hysteresis controller (using existing A4v2 `A4_denoise_reinhard320`).
 *  - Turns ON when `handRoiLumaP50` (or `lumaP50` if ROI unavailable) < 0.15 continuously for >= 1 s.
 *  - Turns OFF when effective luma > 0.22 continuously for >= 2 s.
 *  - Evaluates raw pre-LUT luma so brightening never self-oscillates.
 */
export class AutoPreprocessHysteresis {
  private isActive = false;
  private belowSinceMs: number | null = null;
  private aboveSinceMs: number | null = null;
  private onCount = 0;
  private offCount = 0;
  private lastLumaSource: "handRoiLumaP50" | "lumaP50" | "none" = "none";
  private lastEffectiveLuma: number | null = null;

  get active(): boolean {
    return this.isActive;
  }

  reset(): void {
    this.isActive = false;
    this.belowSinceMs = null;
    this.aboveSinceMs = null;
    this.onCount = 0;
    this.offCount = 0;
    this.lastLumaSource = "none";
    this.lastEffectiveLuma = null;
  }

  getStatus(): AutoPreprocessStatus {
    return {
      mode: HF3_AUTO_PREPROCESS_PASS,
      onThresholdLuma: HF3_AUTO_PREPROCESS_ON_LUMA,
      offThresholdLuma: HF3_AUTO_PREPROCESS_OFF_LUMA,
      active: this.isActive,
      onCount: this.onCount,
      offCount: this.offCount,
      lastLumaSource: this.lastLumaSource,
      lastEffectiveLuma: this.lastEffectiveLuma,
    };
  }

  update(input: {
    nowMs: number;
    handRoiLumaP50?: number | null;
    lumaP50?: number | null;
  }): AutoPreprocessUpdateResult {
    let effectiveLuma: number | null = null;
    let lumaSource: "handRoiLumaP50" | "lumaP50" | "none" = "none";

    if (
      input.handRoiLumaP50 !== null &&
      input.handRoiLumaP50 !== undefined &&
      Number.isFinite(input.handRoiLumaP50)
    ) {
      effectiveLuma = input.handRoiLumaP50;
      lumaSource = "handRoiLumaP50";
    } else if (
      input.lumaP50 !== null &&
      input.lumaP50 !== undefined &&
      Number.isFinite(input.lumaP50)
    ) {
      effectiveLuma = input.lumaP50;
      lumaSource = "lumaP50";
    }

    this.lastLumaSource = lumaSource;
    this.lastEffectiveLuma = effectiveLuma !== null ? Math.round(effectiveLuma * 10000) / 10000 : null;

    let transition: "ON" | "OFF" | null = null;
    if (effectiveLuma !== null) {
      if (!this.isActive) {
        if (effectiveLuma < HF3_AUTO_PREPROCESS_ON_LUMA) {
          if (this.belowSinceMs === null) {
            this.belowSinceMs = input.nowMs;
          } else if (input.nowMs - this.belowSinceMs >= HF3_AUTO_PREPROCESS_ON_DUR_MS) {
            this.isActive = true;
            this.belowSinceMs = null;
            this.aboveSinceMs = null;
            this.onCount++;
            transition = "ON";
          }
        } else {
          this.belowSinceMs = null;
        }
      } else {
        if (effectiveLuma > HF3_AUTO_PREPROCESS_OFF_LUMA) {
          if (this.aboveSinceMs === null) {
            this.aboveSinceMs = input.nowMs;
          } else if (input.nowMs - this.aboveSinceMs >= HF3_AUTO_PREPROCESS_OFF_DUR_MS) {
            this.isActive = false;
            this.aboveSinceMs = null;
            this.belowSinceMs = null;
            this.offCount++;
            transition = "OFF";
          }
        } else {
          this.aboveSinceMs = null;
        }
      }
    }

    return {
      active: this.isActive,
      transition,
      effectiveLuma: this.lastEffectiveLuma,
      lumaSource,
      status: this.getStatus(),
    };
  }
}

export interface BlackFrameResult {
  isBlack: boolean;
  justTriggered: boolean;
  durationMs: number;
  message: string | null;
}

/**
 * R23B-HF3 Step 6 black-frame detector:
 * Emits `CAMERA_BLACK` and user warning when `lumaP50 === 0` continuously for >= 2 s.
 */
export class BlackFrameDetector {
  private blackSinceMs: number | null = null;
  private active = false;

  reset(): void {
    this.blackSinceMs = null;
    this.active = false;
  }

  get isBlack(): boolean {
    return this.active;
  }

  update(lumaP50: number | null | undefined, nowMs: number): BlackFrameResult {
    if (lumaP50 === null || lumaP50 === undefined || !Number.isFinite(lumaP50)) {
      return {
        isBlack: this.active,
        justTriggered: false,
        durationMs: this.blackSinceMs !== null ? Math.max(0, Math.round(nowMs - this.blackSinceMs)) : 0,
        message: this.active ? HF3_CAMERA_BLACK_MESSAGE : null,
      };
    }

    if (lumaP50 === 0) {
      if (this.blackSinceMs === null) {
        this.blackSinceMs = nowMs;
      }
      const durationMs = Math.max(0, Math.round(nowMs - this.blackSinceMs));
      if (durationMs >= HF3_BLACK_FRAME_DURATION_MS) {
        const justTriggered = !this.active;
        this.active = true;
        return {
          isBlack: true,
          justTriggered,
          durationMs,
          message: HF3_CAMERA_BLACK_MESSAGE,
        };
      }
      return {
        isBlack: false,
        justTriggered: false,
        durationMs,
        message: null,
      };
    }

    this.blackSinceMs = null;
    this.active = false;
    return {
      isBlack: false,
      justTriggered: false,
      durationMs: 0,
      message: null,
    };
  }
}

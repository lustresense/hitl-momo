/**
 * R20 Low-Light CPU Photometric Candidate Cascade (`r20_lowlight_frame_source.ts`).
 *
 * Implements §6 & §13.1 paired low-light preprocessing modes on CPU Canvas2D / TypedArray:
 *  - `A0 ("off")`                      : Native RAW `<video>` (0 ms preprocessing; preview untouched)
 *  - `A1 ("scaled")`                   : Downscaled `RAW 320` (isolates resize from photometric enhancement)
 *  - `A2 ("clahe320")`                 : Existing `CLAHE 320` (`tiles=8x8`, `clipLimit=2.0`)
 *  - `A3 ("gamma-denoise-clahe320")`   : Luma-aware mild 3x3 box denoise (when `meanLuma < 0.22`) +
 *                                        noise-floor soft clamp + moderated CLAHE (`clipLimit=1.6..2.0`) +
 *                                        adaptive gamma LUT (`gamma=0.72..0.85`). Prevents near-black
 *                                        Poisson/read-noise amplification (MDPI 2026, §13.1).
 *  - `A4 ("adaptive-fallback")`        : Keeps fast `A0 RAW` while hand tracking succeeds; on a detector
 *                                        miss (`consecutiveMisses >= 1`) in dim/backlight scenes
 *                                        (`meanLuma < 0.36` or `backlightCandidate`), probes ONE frame
 *                                        with `A3 (gamma-denoise-clahe320)` on the next detection (§13.1).
 */

export type R20DetectionSurface = HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas;

export type R20LowLightMode =
  | "off"
  | "scaled"
  | "clahe320"
  | "gamma-denoise-clahe320"
  | "adaptive-fallback";

export const R20_ENHANCE_WIDTH = 320;
export const R20_DARK_LUMA = 0.28;
/** R20-FIX P0.1: fire miss-driven A4v2 recovery up to moderate indoor noise/dimness (zero cost while A0_raw tracks). */
export const R20_DIM_RECOVERY_LUMA = 0.52;
export const R20_BACKLIGHT_CENTER_MAX = 0.36;
export const R20_BACKLIGHT_LUMA_GAP = 0.18;
export const R20_LUMA_SAMPLE_INTERVAL_MS = 400;

export interface R20FrameSourceStats {
  mode: R20LowLightMode;
  activePass: "A0_raw" | "A1_raw320" | "A2_clahe320" | "A3_gamma_denoise_clahe320";
  lastLuma: number | null;
  lastCenterLuma: number | null;
  backlightCandidate: boolean;
  darkCandidate: boolean;
  consecutiveMisses: number;
  recommendedBackoffMs: number;
  lastPreprocessMs: number | null;
  enhancing: boolean;
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
      const r = rgba[idx]!;
      const g = rgba[idx + 1]!;
      const b = rgba[idx + 2]!;
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

/** Exact median of 5 bytes using a 6-comparison sorting network (zero allocations). */
export function median5(a: number, b: number, c: number, d: number, e: number): number {
  let t: number;
  if (a > b) { t = a; a = b; b = t; }
  if (c > d) { t = c; c = d; d = t; }
  if (a > c) { t = a; a = c; c = t; t = b; b = d; d = t; }
  if (e > b) { t = e; e = b; b = t; }
  return e <= c ? (b < c ? b : c) : e < d ? e : d;
}

/** Separable 1D median-of-5 (horizontal then vertical) on RGB channels. */
export function sepMedian5RgbaInPlace(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  scratch?: Uint8ClampedArray,
): void {
  if (width < 5 || height < 5) return;
  const nBytes = width * height * 4;
  const tmp = scratch && scratch.length >= nBytes ? scratch : new Uint8ClampedArray(nBytes);
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
  for (let y = 0; y < height; y++) {
    const y0 = y < 2 ? 0 : y - 2;
    const y1 = y < 1 ? 0 : y - 1;
    const y3 = y + 1 >= height ? height - 1 : y + 1;
    const y4 = y + 2 >= height ? height - 1 : y + 2;
    const r0 = y0 * width, r1 = y1 * width, r2 = y * width, r3 = y3 * width, r4 = y4 * width;
    for (let x = 0; x < width; x++) {
      const o = (r2 + x) << 2;
      const i0 = (r0 + x) << 2, i1 = (r1 + x) << 2, i3 = (r3 + x) << 2, i4 = (r4 + x) << 2;
      rgba[o] = median5(tmp[i0]!, tmp[i1]!, tmp[o]!, tmp[i3]!, tmp[i4]!);
      rgba[o + 1] = median5(tmp[i0 + 1]!, tmp[i1 + 1]!, tmp[o + 1]!, tmp[i3 + 1]!, tmp[i4 + 1]!);
      rgba[o + 2] = median5(tmp[i0 + 2]!, tmp[i1 + 2]!, tmp[o + 2]!, tmp[i3 + 2]!, tmp[i4 + 2]!);
    }
  }
}

/** Motion-gated temporal EMA on 320px RGBA buffer (reduces stationary low-light noise without ghosting). */
export function motionGatedTemporalEmaInPlace(
  rgba: Uint8ClampedArray,
  prev: Uint8ClampedArray | null,
  motionThresh = 28,
): Uint8ClampedArray {
  const n = rgba.length;
  if (!prev || prev.length !== n) return new Uint8ClampedArray(rgba);
  for (let i = 0; i < n; i += 4) {
    const dr = Math.abs(rgba[i]! - prev[i]!);
    const dg = Math.abs(rgba[i + 1]! - prev[i + 1]!);
    const db = Math.abs(rgba[i + 2]! - prev[i + 2]!);
    if (dr < motionThresh && dg < motionThresh && db < motionThresh) {
      const nr = (rgba[i]! * 3 + prev[i]! * 5 + 4) >> 3;
      const ng = (rgba[i + 1]! * 3 + prev[i + 1]! * 5 + 4) >> 3;
      const nb = (rgba[i + 2]! * 3 + prev[i + 2]! * 5 + 4) >> 3;
      rgba[i] = nr; rgba[i + 1] = ng; rgba[i + 2] = nb;
      prev[i] = nr; prev[i + 1] = ng; prev[i + 2] = nb;
    } else {
      prev[i] = rgba[i]!; prev[i + 1] = rgba[i + 1]!; prev[i + 2] = rgba[i + 2]!;
    }
  }
  return prev;
}

/** Chroma-preserving Reinhard tone-mapping LUT: y = (k*x)/(1+(k-1)*x), preserving skin-tone chromaticity. */
export function reinhardExposureLutInPlace(rgba: Uint8ClampedArray, meanLuma: number, targetLuma = 0.48): void {
  const m = Math.max(meanLuma, 0.015);
  const k = Math.max(1.0, Math.min(14.0, targetLuma / m));
  if (k <= 1.04) return;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    const v = Math.round(((k * x) / (1 + (k - 1) * x)) * 255);
    lut[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = lut[rgba[i]!]!;
    rgba[i + 1] = lut[rgba[i + 1]!]!;
    rgba[i + 2] = lut[rgba[i + 2]!]!;
  }
}

/** Full R20-FIX A4v2 chroma-preserving low-light recovery in-place on 320px RGBA buffer. */
export function applyA4ChromaRecoveryInPlace(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  meanLuma: number,
  temporalPrev: Uint8ClampedArray | null,
  scratch?: Uint8ClampedArray,
): Uint8ClampedArray {
  const nextPrev = motionGatedTemporalEmaInPlace(rgba, temporalPrev, 28);
  sepMedian5RgbaInPlace(rgba, width, height, scratch);
  if (meanLuma < 0.14) denoise3x3RgbaInPlace(rgba, width, height);
  reinhardExposureLutInPlace(rgba, meanLuma, 0.48);
  return nextPrev;
}

/** Separable 3x3 box/Gaussian denoise on RGB channels in-place (suppresses near-black sensor noise before CLAHE). */
export function denoise3x3RgbaInPlace(rgba: Uint8ClampedArray, width: number, height: number): void {
  const copy = new Uint8ClampedArray(rgba);
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

/** Exact integer-LUT 8x8 CLAHE on luma + optional noise-floor soft clamp & gamma curve in-place. */
export function claheAndGammaRgbaInPlace(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  clipLimit = 2.0,
  gamma = 1.0,
  noiseFloor = 0,
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

  const gammaLut = new Uint8Array(256);
  const useGamma = Math.abs(gamma - 1.0) > 0.02 || noiseFloor > 0;
  if (useGamma) {
    const denom = Math.max(1, 255 - noiseFloor);
    for (let i = 0; i < 256; i++) {
      const norm = Math.max(0, (i - noiseFloor) / denom);
      gammaLut[i] = Math.min(255, Math.max(0, Math.round(255 * Math.pow(norm, gamma))));
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
      const top = l00 + (l01 - l00) * wx;
      const bot = l10 + (l11 - l10) * wx;
      let mapped = Math.round(top + (bot - top) * wy);
      if (useGamma) mapped = gammaLut[mapped]!;
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

export class R20LowLightFrameSource {
  private mode: R20LowLightMode = "adaptive-fallback";
  private activePass: R20FrameSourceStats["activePass"] = "A0_raw";
  private lastSampleAt = Number.NEGATIVE_INFINITY;
  private lastLuma: number | null = null;
  private lastCenterLuma: number | null = null;
  private backlightCandidate = false;
  private darkCandidate = false;
  private consecutiveMisses = 0;
  private lastRecoveryWorked = false;
  private lastPreprocessMs: number | null = null;
  private enhancing = false;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  constructor(
    private readonly deps: {
      now?: () => number;
      createCanvas?: () => HTMLCanvasElement;
    } = {},
  ) {}

  private now(): number {
    return this.deps.now ? this.deps.now() : performance.now();
  }

  setMode(mode: R20LowLightMode): void {
    this.mode = mode;
    this.lastSampleAt = Number.NEGATIVE_INFINITY;
    this.consecutiveMisses = 0;
    this.lastRecoveryWorked = false;
  }

  /** Called after each HandLandmarker detection so A4 adaptive-fallback can route the next frame. */
  notifyDetectionResult(handCount: number): void {
    if (handCount > 0) {
      this.consecutiveMisses = 0;
      this.lastRecoveryWorked = this.enhancing;
    } else {
      this.consecutiveMisses++;
      if (this.enhancing) {
        // Enhanced probe also missed -> revert next frame to A0 RAW or alternate
        this.lastRecoveryWorked = false;
      }
    }
  }

  /** Gentle cadence backoff (ms) when consecutive misses occur in near-black scenes (§13.1). */
  recommendedBackoffMs(): number {
    if (this.consecutiveMisses < 4) return 0;
    if (this.consecutiveMisses < 10) return 35;
    return 75;
  }

  private drawScaled(video: HTMLVideoElement): ImageData | null {
    const width = R20_ENHANCE_WIDTH;
    const height = Math.max(1, Math.round((width * video.videoHeight) / Math.max(1, video.videoWidth)));
    if (!this.canvas) {
      this.canvas = this.deps.createCanvas ? this.deps.createCanvas() : document.createElement("canvas");
    }
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    if (!this.ctx) {
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
      if (!this.ctx) return null;
    }
    this.ctx.drawImage(video, 0, 0, width, height);
    return this.ctx.getImageData(0, 0, width, height);
  }

  frameForDetection(video: HTMLVideoElement): R20DetectionSurface {
    try {
      if (this.mode === "off" || !video.videoWidth || !video.videoHeight) {
        this.enhancing = false;
        this.activePass = "A0_raw";
        this.lastPreprocessMs = 0;
        return video;
      }

      const t0 = this.now();
      let image: ImageData | null = null;

      if (t0 - this.lastSampleAt >= R20_LUMA_SAMPLE_INTERVAL_MS || this.lastLuma === null) {
        this.lastSampleAt = t0;
        image = this.drawScaled(video);
        if (image) {
          const { meanLuma, centerLuma } = computeMeanAndCenterLuma(image.data, image.width, image.height, 2);
          this.lastLuma = Math.round(meanLuma * 10000) / 10000;
          this.lastCenterLuma = Math.round(centerLuma * 10000) / 10000;
          this.backlightCandidate =
            centerLuma < R20_BACKLIGHT_CENTER_MAX && meanLuma - centerLuma >= R20_BACKLIGHT_LUMA_GAP;
          this.darkCandidate = meanLuma < R20_DARK_LUMA || this.backlightCandidate;
        }
      }

      if (this.mode === "scaled") {
        image ??= this.drawScaled(video);
        if (!image || !this.canvas || !this.ctx) return video;
        this.ctx.putImageData(image, 0, 0);
        this.enhancing = false;
        this.activePass = "A1_raw320";
        this.lastPreprocessMs = Math.round((this.now() - t0) * 100) / 100;
        return this.canvas;
      }

      if (this.mode === "clahe320") {
        image ??= this.drawScaled(video);
        if (!image || !this.canvas || !this.ctx) return video;
        claheAndGammaRgbaInPlace(image.data, image.width, image.height, 2.0, 1.0, 0);
        this.ctx.putImageData(image, 0, 0);
        this.enhancing = true;
        this.activePass = "A2_clahe320";
        this.lastPreprocessMs = Math.round((this.now() - t0) * 100) / 100;
        return this.canvas;
      }

      const lumaVal = this.lastLuma ?? 0.5;
      const shouldEnhance =
        this.mode === "gamma-denoise-clahe320" ||
        (this.mode === "adaptive-fallback" &&
          (lumaVal < R20_DIM_RECOVERY_LUMA || this.backlightCandidate) &&
          (this.lastRecoveryWorked || (this.consecutiveMisses > 0 && this.consecutiveMisses % 2 === 1)));

      if (!shouldEnhance) {
        this.enhancing = false;
        this.activePass = "A0_raw";
        this.lastPreprocessMs = Math.round((this.now() - t0) * 100) / 100;
        return video;
      }

      image ??= this.drawScaled(video);
      if (!image || !this.canvas || !this.ctx) return video;

      if (lumaVal < 0.22) {
        denoise3x3RgbaInPlace(image.data, image.width, image.height);
      }
      const clipLim = lumaVal < 0.14 ? 1.6 : 2.0;
      const gamma = lumaVal < 0.16 ? 0.72 : lumaVal < 0.28 ? 0.82 : 0.90;
      const noiseFloor = lumaVal < 0.18 ? 3 : 0;
      claheAndGammaRgbaInPlace(image.data, image.width, image.height, clipLim, gamma, noiseFloor);
      this.ctx.putImageData(image, 0, 0);
      this.enhancing = true;
      this.activePass = "A3_gamma_denoise_clahe320";
      this.lastPreprocessMs = Math.round((this.now() - t0) * 100) / 100;
      return this.canvas;
    } catch {
      this.enhancing = false;
      this.activePass = "A0_raw";
      return video;
    }
  }

  getStats(): R20FrameSourceStats {
    return {
      mode: this.mode,
      activePass: this.activePass,
      lastLuma: this.lastLuma,
      lastCenterLuma: this.lastCenterLuma,
      backlightCandidate: this.backlightCandidate,
      darkCandidate: this.darkCandidate,
      consecutiveMisses: this.consecutiveMisses,
      recommendedBackoffMs: this.recommendedBackoffMs(),
      lastPreprocessMs: this.lastPreprocessMs,
      enhancing: this.enhancing,
    };
  }
}

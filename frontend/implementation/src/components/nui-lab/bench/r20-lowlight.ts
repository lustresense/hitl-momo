/**
 * R20 Low-Light CPU Photometric Preprocessing (`r20-lowlight.ts`).
 *
 * Root-cause fix (R20-FIX P0.1):
 *  - Legacy additive CLAHE (`rgb += mapped - luma`) washed dark skin pixels out to gray, destroying
 *    MediaPipe SSD Palm Detector's skin-chromaticity cues, while amplifying high-frequency linear-light
 *    Poisson/read shot noise.
 *  - New A4 recovery (`A4_denoise_reinhard320`) uses:
 *      1. Motion-gated temporal EMA on the 320px buffer (blends static/slow dark pixels only when |diff| < 24
 *         so moving hands never ghost while dark sensor noise variance drops).
 *      2. Exact 6-comparison separable 1D median-of-5 (`sepMedian5RgbaInPlace`) to reject heavy-tailed
 *         low-light shot/read impulse spikes without blurring finger edges.
 *      3. Additional 3x3 Gaussian/box denoise pass only when near-black (`meanLuma < 0.14`).
 *      4. Chroma-preserving Reinhard tone-mapping LUT (`y = k*x / (1 + (k-1)*x)`, 256-byte Uint8Array LUT)
 *         applied identically to R, G, and B, keeping skin-tone chromaticity intact at <0.3 ms CPU cost.
 *
 * Legacy `clahe` (320px additive CLAHE) and `raw` (zero preprocess) remain selectable comparators.
 */

export const R20_ENHANCE_WIDTH = 320;
export const R20_DARK_LUMA = 0.28;
/** Trigger A4v2 miss-driven recovery up to moderate indoor noise/dimness (only fires after A0_raw misses). */
export const R20_DIM_RECOVERY_LUMA = 0.52;
export const R20_BACKLIGHT_CENTER_MAX = 0.36;
export const R20_BACKLIGHT_LUMA_GAP = 0.18;
export const R20_LUMA_SAMPLE_INTERVAL_MS = 400;

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

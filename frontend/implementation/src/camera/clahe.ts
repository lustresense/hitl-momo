/**
 * Contrast Limited Adaptive Histogram Equalisation (CLAHE) on the luma channel.
 *
 * Why CLAHE and not a plain brightness/gamma lift: a global lift washes out
 * already-bright areas and amplifies noise everywhere. CLAHE equalises each
 * small tile on its own, and the clip limit stops flat areas (a wall, a sheet of
 * paper) from being stretched into noise.
 *
 * Only luma is remapped; each pixel's R, G, B shift by the same delta, so the
 * colour balance is kept and grey stays grey.
 */
import { pixelLuma } from "./luma";

export interface ClaheOptions {
  /** Tiles across the frame. Default 8. */
  tilesX?: number;
  /** Tiles down the frame. Default 8. */
  tilesY?: number;
  /**
   * Clip limit as a multiple of the average histogram bin height (OpenCV convention).
   * 2.0 is the usual starting point; higher means stronger contrast and more noise.
   */
  clipLimit?: number;
}

const BINS = 256;
const DEFAULT_TILES = 8;
const DEFAULT_CLIP = 2.0;

/**
 * Applies CLAHE to an RGBA buffer and returns `dst`.
 * `dst` may be the same array as `src` (in-place). Alpha is copied unchanged.
 */
export function claheRgba(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  options: ClaheOptions = {},
  dst: Uint8ClampedArray = new Uint8ClampedArray(src.length),
): Uint8ClampedArray {
  const n = Math.max(0, width) * Math.max(0, height);
  if (n === 0 || src.length < n * 4) {
    if (dst !== src) dst.set(src.subarray(0, Math.min(src.length, dst.length)));
    return dst;
  }

  const tx = clampInt(options.tilesX ?? DEFAULT_TILES, 1, width);
  const ty = clampInt(options.tilesY ?? DEFAULT_TILES, 1, height);
  const clip = options.clipLimit ?? DEFAULT_CLIP;

  // Luma plane first, so the histogram and the final remap read the same original values.
  const luma = new Uint8Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    luma[p] = pixelLuma(src[i]!, src[i + 1]!, src[i + 2]!);
  }

  const lut = buildTileLuts(luma, width, height, tx, ty, clip);
  const xMap = axisMap(width, tx);
  const yMap = axisMap(height, ty);

  // Bilinear blend of the four nearest tile LUTs. Without this the tile borders show as blocks.
  for (let y = 0; y < height; y++) {
    const ya = yMap.a[y]!;
    const yb = yMap.b[y]!;
    const wy = yMap.w[y]!;
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      const v = luma[p]!;
      const xa = xMap.a[x]!;
      const xb = xMap.b[x]!;
      const wx = xMap.w[x]!;
      const l00 = lut[(ya * tx + xa) * BINS + v]!;
      const l01 = lut[(ya * tx + xb) * BINS + v]!;
      const l10 = lut[(yb * tx + xa) * BINS + v]!;
      const l11 = lut[(yb * tx + xb) * BINS + v]!;
      const top = l00 + (l01 - l00) * wx;
      const bottom = l10 + (l11 - l10) * wx;
      const mapped = Math.round(top + (bottom - top) * wy);
      // Shift all channels by the same amount (not a ratio): a ratio blows up on black pixels.
      const delta = mapped - v;
      dst[i] = src[i]! + delta;
      dst[i + 1] = src[i + 1]! + delta;
      dst[i + 2] = src[i + 2]! + delta;
      dst[i + 3] = src[i + 3]!;
    }
  }
  return dst;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), Math.max(min, max));
}

/** One LUT of 256 entries per tile, stored tile after tile (row-major by tile). */
function buildTileLuts(
  luma: Uint8Array,
  width: number,
  height: number,
  tx: number,
  ty: number,
  clip: number,
): Uint8Array {
  const lut = new Uint8Array(tx * ty * BINS);
  const hist = new Uint32Array(BINS);
  for (let tyI = 0; tyI < ty; tyI++) {
    const y0 = Math.floor((tyI * height) / ty);
    const y1 = Math.floor(((tyI + 1) * height) / ty);
    for (let txI = 0; txI < tx; txI++) {
      const x0 = Math.floor((txI * width) / tx);
      const x1 = Math.floor(((txI + 1) * width) / tx);
      hist.fill(0);
      for (let y = y0; y < y1; y++) {
        let p = y * width + x0;
        for (let x = x0; x < x1; x++, p++) hist[luma[p]!]!++;
      }
      const area = (y1 - y0) * (x1 - x0);
      clipAndRedistribute(hist, Math.max(1, Math.floor((clip * area) / BINS)));
      writeLut(hist, area, lut, (tyI * tx + txI) * BINS);
    }
  }
  return lut;
}

/** Cuts bins above `limit` and spreads the removed count evenly over all bins. Total stays the same. */
function clipAndRedistribute(hist: Uint32Array, limit: number): void {
  let excess = 0;
  for (let b = 0; b < BINS; b++) {
    if (hist[b]! > limit) {
      excess += hist[b]! - limit;
      hist[b] = limit;
    }
  }
  const batch = Math.floor(excess / BINS);
  const residual = excess % BINS;
  for (let b = 0; b < BINS; b++) hist[b] = hist[b]! + batch;
  if (residual > 0) {
    // Spread the remainder across the histogram rather than piling it on the first bins.
    const step = Math.max(1, Math.floor(BINS / residual));
    let left = residual;
    for (let b = 0; b < BINS && left > 0; b += step) {
      hist[b] = hist[b]! + 1;
      left--;
    }
  }
}

/** Cumulative mid-point mapping. Using the mid-point of each bin avoids a +1 bias on flat areas. */
function writeLut(hist: Uint32Array, area: number, lut: Uint8Array, offset: number): void {
  let before = 0;
  for (let v = 0; v < BINS; v++) {
    const count = hist[v]!;
    const mapped = Math.round(((before + count / 2) * 255) / area);
    lut[offset + v] = Math.min(255, Math.max(0, mapped));
    before += count;
  }
}

/**
 * For every pixel column (or row), the two tile indices it sits between and the blend weight.
 * Pixels are compared to tile centres; edges clamp to the outermost tile.
 */
function axisMap(size: number, tiles: number): { a: Uint16Array; b: Uint16Array; w: Float32Array } {
  const a = new Uint16Array(size);
  const b = new Uint16Array(size);
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const f = ((i + 0.5) * tiles) / size - 0.5;
    let lo = Math.floor(f);
    let weight = f - lo;
    if (lo < 0) {
      lo = 0;
      weight = 0;
    } else if (lo >= tiles - 1) {
      lo = tiles - 1;
      weight = 0;
    }
    a[i] = lo;
    b[i] = Math.min(lo + 1, tiles - 1);
    w[i] = weight;
  }
  return { a, b, w };
}

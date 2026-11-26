/**
 * Geometri murni, layout rak, kurva pegas, dan seleksi pita terdekat (Aturan B).
 * Port 1:1 dari proto-html/r83/shared/bab/bab.js:11-28, 80-87, 122-156 (TANPA DOM).
 */

export const NOTCH_PX = 38;
export const NOTCHES_TO_ARM = 4;
export const ARM_THRESHOLD_PX = NOTCH_PX * NOTCHES_TO_ARM;
export const PULL_MAX = 230;
export const LOCK_RESIST = 0.07;
export const LOCK_MAX = 12;
export const LOCKED_TUG_MIN_PX = 6;
export const CLICK_SUPPRESS_PX = 4;
export const RIBBON_TAIL_PX = 44;
export const RIBBON_SHADOW_PX = 7;
export const MIN_RIBBON_W = 84;
export const THUMB_PILL_W = 124;
export const NARROW_RIBBON_W = 120;
export const PAGE_GUTTER = 16;
export const NOTCH_ROOM = 14;
export const LOCKED_LENGTH_RATIO = 0.66;
export const UNLOCK_DELAY_MS = 750;
export const STATUS_FLASH_MS = 2400;
export const SPRING_REBOUND_DURATION_S = 0.9;
export const SPRING_LOCKED_DURATION_S = 0.5;
export const ELASTIC_PERIOD_UNLOCKED = 0.4;
export const ELASTIC_PERIOD_LOCKED = 0.5;

export interface ShelfDims {
  readonly w: number;
  readonly h: number;
  readonly perRow: number;
}

export interface RibbonRectLike {
  readonly stage: number;
  readonly locked: boolean;
  readonly left: number;
  readonly top?: number;
  readonly width: number;
  readonly height?: number;
}

function clamp(v: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, v));
}

/** Jarak antar pita pada rak (bab.js:15). */
export function shelfGap(vw: number): number {
  return vw <= 600 ? 14 : Math.min(76, Math.max(26, vw * 0.05));
}

/** Ukuran pita & jumlah kolom per baris pada viewport (bab.js:16-24). */
export function shelfLayout(count: number, vw: number, vh: number): ShelfDims {
  if (count <= 0) return { w: MIN_RIBBON_W, h: 250, perRow: 1 };
  const gap = shelfGap(vw);
  const room = vw - 2 * PAGE_GUTTER - 2 * NOTCH_ROOM;
  const widestInRow = (n: number): number => {
    const budget = room - gap * (n - 1) - RIBBON_SHADOW_PX * n;
    return Math.floor(Math.min(budget / n, (budget - THUMB_PILL_W) / Math.max(1, n - 1)));
  };
  const perRow = widestInRow(count) >= MIN_RIBBON_W ? count : Math.min(count, 2);
  const rows = Math.ceil(count / perRow);
  const h = Math.round(
    rows > 1
      ? clamp(vh * 0.42, 250, 330)
      : Math.max(250, Math.min(clamp(vh * 0.58, 290, 470), vh - 450)),
  );
  const w = Math.max(1, Math.round(Math.min(184, h * 0.4, widestInRow(perRow))));
  return { w, h, perRow };
}

/** Panjang istirahat pita (bab.js:83): terkunci = 66% tinggi normal. */
export function ribbonRestLength(height: number, locked: boolean): number {
  return locked ? Math.round(height * LOCKED_LENGTH_RATIO) : height;
}

/** Path SVG luar pita bookmark (bab.js:27). */
export function outerRibbonPath(w: number, length: number): string {
  return `M3 3H${w - 3}V${length - 3}L${w / 2} ${length - 3 - RIBBON_TAIL_PX}L3 ${length - 3}Z`;
}

/** Path SVG jahitan dalam pita (bab.js:28). */
export function stitchRibbonPath(w: number, length: number): string {
  return `M15 15H${w - 15}V${length - 15}L${w / 2} ${length - 15 - RIBBON_TAIL_PX + 9}L15 ${length - 15}Z`;
}

export function computeRawPull(startY: number, currentY: number): number {
  if (!Number.isFinite(startY) || !Number.isFinite(currentY)) return 0;
  return Math.max(0, currentY - startY);
}

/** Jarak tarik visual pita dengan hambatan terkunci / peredaman pasca-40px (bab.js:123). */
export function computeVisualPull(rawPx: number, locked: boolean): number {
  const raw = Number.isFinite(rawPx) ? Math.max(0, rawPx) : 0;
  if (locked) return Math.min(raw * LOCK_RESIST, LOCK_MAX);
  return Math.min(PULL_MAX, raw <= 40 ? raw : 40 + (raw - 40) * 0.8);
}

/** Jumlah takik 0..4 yang dilewati (bab.js:126). */
export function computeNotchCount(rawPx: number, locked: boolean): number {
  if (locked || !Number.isFinite(rawPx)) return 0;
  return Math.min(NOTCHES_TO_ARM, Math.floor(Math.max(0, rawPx) / NOTCH_PX));
}

/** Progres normalisasi 0..1 menuju ambang pembuka (0 jika terkunci). */
export function computePullProgress(rawPx: number, locked: boolean): number {
  if (locked || !Number.isFinite(rawPx)) return 0;
  return clamp(Math.max(0, rawPx) / ARM_THRESHOLD_PX, 0, 1);
}

export function isPullArmed(rawPx: number, locked: boolean): boolean {
  return !locked && computeNotchCount(rawPx, false) >= NOTCHES_TO_ARM;
}

/** Kurva pegas elastic.out(a, p) sepadan GSAP `elastic.out(1, 0.4)` (bab.js:134,136). */
export function elasticOut(t: number, amplitude = 1, period = ELASTIC_PERIOD_UNLOCKED): number {
  if (!Number.isFinite(t) || t <= 0) return 0;
  if (t >= 1) return 1;
  const a = Math.max(1, amplitude);
  const s = (period / (2 * Math.PI)) * Math.asin(1 / a);
  return a * Math.pow(2, -10 * t) * Math.sin(((t - s) * (2 * Math.PI)) / period) + 1;
}

/** Sampel panjang pita saat memantul kembali dengan pegas setelah dilepas sebelum ambang. */
export function sampleSpringRebound(
  fromLength: number,
  restLength: number,
  progress01: number,
  period = ELASTIC_PERIOD_UNLOCKED,
): number {
  return fromLength + (restLength - fromLength) * elasticOut(progress01, 1, period);
}

function isMultiRow(ribbons: readonly RibbonRectLike[]): boolean {
  if (ribbons.length <= 1) return false;
  let minTop = Infinity;
  let maxTop = -Infinity;
  for (const r of ribbons) {
    if (r.top === undefined) return false;
    if (r.top < minTop) minTop = r.top;
    if (r.top > maxTop) maxTop = r.top;
  }
  return maxTop - minTop > 20;
}

/** Seleksi pita terdekat sesuai Aturan B (bab.js:152-156) + partisi zona kamera horizontal 2-3 pita. */
export function selectNearestRibbon(
  ribbons: readonly RibbonRectLike[],
  x: number,
  y?: number,
  viewportWidth?: number,
  prevStage?: number | null,
): RibbonRectLike | null {
  if (ribbons.length === 0 || !Number.isFinite(x)) return null;
  const multiRow = y !== undefined && Number.isFinite(y) && isMultiRow(ribbons);
  if (multiRow && y !== undefined) {
    for (const r of ribbons) {
      const top = r.top ?? 0;
      const bottom = top + (r.height ?? 0);
      if (x >= r.left && x <= r.left + r.width && y >= top && y <= bottom) return r;
    }
  }
  if (
    !multiRow &&
    viewportWidth !== undefined &&
    Number.isFinite(viewportWidth) &&
    viewportWidth > 0 &&
    ribbons.length >= 2 &&
    ribbons.length <= 3
  ) {
    for (const r of ribbons) {
      if (x >= r.left && x <= r.left + r.width) return r;
    }
    const sorted = [...ribbons].sort((a, b) => a.left + a.width / 2 - (b.left + b.width / 2));
    const n = sorted.length;
    const band = viewportWidth / n;
    const hysteresis = viewportWidth * 0.05;
    if (prevStage !== undefined && prevStage !== null) {
      const prevIdx = sorted.findIndex((r) => r.stage === prevStage);
      if (prevIdx >= 0 && x >= prevIdx * band - hysteresis && x <= (prevIdx + 1) * band + hysteresis) {
        return sorted[prevIdx] ?? null;
      }
    }
    const idx = Math.min(n - 1, Math.max(0, Math.floor(clamp(x, 0, viewportWidth) / band)));
    return sorted[idx] ?? null;
  }
  let best: RibbonRectLike | null = null;
  let bestDist = Infinity;
  for (const r of ribbons) {
    const cx = r.left + r.width / 2;
    const d =
      multiRow && y !== undefined
        ? Math.hypot(cx - x, (r.top ?? 0) + (r.height ?? 0) / 2 - y)
        : Math.abs(cx - x);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }
  return best;
}

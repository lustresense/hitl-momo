/**
 * Kamera Penutup r8.3 — port murni proto-html/r83/shared/end/cam.js + pemetaan world.js.
 * Menskalakan dunia agar tinggi Thinman ~21% tinggi layar (THINMAN_H = 0.21),
 * menempatkan garis tanah di ~72% tinggi layar, dan mengikuti posisi X secara halus.
 */

export const WORLD_WIDTH_UNITS = 490;
export const WORLD_HEIGHT_UNITS = 275.6;
export const WORLD_Y0_UNITS = 24.7;

export const END_GROUND_Y = 250;
export const END_GROUND_AT = 0.72;
export const END_THINMAN_HEIGHT_RATIO = 0.21;
export const END_HERO_FALLBACK_HEIGHT_RATIO = 0.056;
export const END_CAM_SCALE_COVER_MULT = 1.02;
export const END_CAM_LERP = 0.12;
export const END_CAM_STOP_EPS_PX = 0.4;
export const END_DEFAULT_START_X = 160;
export const END_DEFAULT_START_FRAC = 0.3;

export interface EndCameraFitInput {
  readonly viewportW: number;
  readonly viewportH: number;
  readonly worldW: number;
  readonly worldH: number;
  readonly heroHeightPx?: number;
  readonly targetX?: number;
  readonly targetFrac?: number;
}

export interface EndCameraTransform {
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
}

export interface EndCameraTxInput {
  readonly viewportW: number;
  readonly worldW: number;
  readonly scale: number;
}

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Pemetaan satuan sumber dunia (490 × 275.6 dari y0=24.7) ke persen CSS (world.js:10). */
export const worldPercentX = (xUnits: number): number => (xUnits / WORLD_WIDTH_UNITS) * 100;
export const worldPercentY = (yUnits: number): number =>
  ((yUnits - WORLD_Y0_UNITS) / WORLD_HEIGHT_UNITS) * 100;
export const worldPercentW = (wUnits: number): number => (wUnits / WORLD_WIDTH_UNITS) * 100;
export const worldPercentH = (hUnits: number): number => (hUnits / WORLD_HEIGHT_UNITS) * 100;

export function computeEndCameraTx(
  xUnits: number,
  screenFrac: number,
  { viewportW, worldW, scale }: EndCameraTxInput,
): number {
  if (worldW <= 0 || viewportW <= 0 || scale <= 0) return 0;
  const minTx = Math.min(0, viewportW - scale * worldW);
  const raw = viewportW * screenFrac - scale * worldW * (xUnits / WORLD_WIDTH_UNITS);
  return clamp(raw, minTx, 0);
}

/** Port `cam.fit()` (`cam.js:14-20`): pastikan Thinman ~21% tinggi layar & tanah di 72%. */
export function computeEndCameraFit(input: EndCameraFitInput): EndCameraTransform {
  const { viewportW, viewportH, worldW, worldH, heroHeightPx = 0 } = input;
  if (viewportW <= 0 || viewportH <= 0 || worldW <= 0 || worldH <= 0) {
    return { scale: 1, tx: 0, ty: 0 };
  }
  const hh = heroHeightPx > 0 ? heroHeightPx : worldW * END_HERO_FALLBACK_HEIGHT_RATIO;
  const scale = Math.max(
    (viewportH / worldH) * END_CAM_SCALE_COVER_MULT,
    (END_THINMAN_HEIGHT_RATIO * viewportH) / hh,
  );
  const minTy = Math.min(0, viewportH - scale * worldH);
  const rawTy =
    viewportH * END_GROUND_AT -
    scale * worldH * ((END_GROUND_Y - WORLD_Y0_UNITS) / WORLD_HEIGHT_UNITS);
  const ty = clamp(rawTy, minTy, 0);
  const tx = computeEndCameraTx(
    input.targetX ?? END_DEFAULT_START_X,
    input.targetFrac ?? END_DEFAULT_START_FRAC,
    { viewportW, worldW, scale },
  );
  return { scale, tx, ty };
}

/** Langkah lerp halus kamera X (`cam.js:25`). */
export function stepEndCameraTx(currentTx: number, targetTx: number): number {
  if (Math.abs(targetTx - currentTx) <= END_CAM_STOP_EPS_PX) return currentTx;
  return currentTx + (targetTx - currentTx) * END_CAM_LERP;
}

export function unitsToScreenPx(units: number, worldW: number, scale: number): number {
  return (units / WORLD_WIDTH_UNITS) * worldW * scale;
}

export function screenPxToUnits(px: number, worldLeftPx: number, worldRenderedWidthPx: number): number {
  if (worldRenderedWidthPx <= 0) return 0;
  return ((px - worldLeftPx) / worldRenderedWidthPx) * WORLD_WIDTH_UNITS;
}

/**
 * Eraser radius shared by the hand fist and the pointer drag (PRD 0.0.16 R12 Hapus).
 * Stored in CSS px so one setting means the same reach on every screen density.
 */
export const ERASER_RADIUS_PX = 28;
/** Lower bound keeps a tiny eraser usable; upper bound keeps one pass from wiping the page. */
export const ERASER_RADIUS_MIN_PX = 12;
export const ERASER_RADIUS_MAX_PX = 56;
/** One mouse-wheel notch or one `[` / `]` press (CSS px). */
export const ERASER_SIZE_STEP_PX = 4;
/** Toolbar sizes S / M / L (CSS px). Each stays inside the min/max bounds. */
export const ERASER_SIZE_PRESETS = { small: 16, medium: ERASER_RADIUS_PX, large: 44 } as const;

export interface EraserRadiusBounds {
  minPx: number;
  maxPx: number;
}

const DEFAULT_BOUNDS: EraserRadiusBounds = { minPx: ERASER_RADIUS_MIN_PX, maxPx: ERASER_RADIUS_MAX_PX };

export function clampEraserRadius(cssPx: number): number {
  return Math.min(Math.max(cssPx, ERASER_RADIUS_MIN_PX), ERASER_RADIUS_MAX_PX);
}

/** CSS radius to canvas px: multiplied by the backing-store ratio (2 on a 2x screen). */
export function eraserRadiusCanvasPx(canvas: HTMLCanvasElement, cssPx: number): number {
  const w = canvas.getBoundingClientRect().width;
  return cssPx * (w > 0 ? canvas.width / w : 1);
}

/**
 * Thumb-index gap, as a share of the hand span (wrist to middle knuckle, see evaluateGesture), at which the
 * sizing hand gives the smallest and the largest eraser. A closed pinch reads about 0.1; a wide spread about 0.8.
 */
export const SIZE_GAP_CLOSED = 0.12;
export const SIZE_GAP_OPEN = 0.8;

/**
 * Pure, monotonic map from the sizing hand's gap to a radius. Small gap = small eraser, large gap = large one,
 * clamped to the bounds. Used anchored (see EraserSizer), so only the change in gap moves the radius.
 */
export function eraserRadiusFromPinch(pinchRatio: number, bounds: EraserRadiusBounds = DEFAULT_BOUNDS): number {
  const t = clamp01((pinchRatio - SIZE_GAP_CLOSED) / (SIZE_GAP_OPEN - SIZE_GAP_CLOSED));
  return bounds.minPx + t * (bounds.maxPx - bounds.minPx);
}

/** Fraction of the remaining distance covered per frame: small enough to hide a shaky hand's jitter. */
const SIZE_SMOOTHING = 0.3;
/** A target closer than this (CSS px) does not move the radius at all: the dead zone stops trembling. */
const SIZE_DEAD_ZONE_PX = 2;

/**
 * Two-hand sizing: the second hand's gap sets the eraser radius while a fist erases. The session is anchored
 * where the second hand shows up, so the radius starts from its current value (no jump) and then follows the
 * change in the gap. A new anchor is taken whenever the radius was changed elsewhere (wheel, keys, buttons).
 */
export class EraserSizer {
  /** Anchor: the radius minus the mapped gap at the start of the session. Null = no session. */
  private offsetPx: number | null = null;
  /** The radius this sizer last returned; a different value now means someone else changed it. */
  private lastPx = 0;

  /** Radius (CSS px) for this frame. `currentPx` is the radius in use now. */
  update(pinchRatio: number, currentPx: number): number {
    if (this.offsetPx === null || currentPx !== this.lastPx) {
      this.offsetPx = currentPx - eraserRadiusFromPinch(pinchRatio);
      this.lastPx = currentPx;
      return currentPx;
    }
    const target = clampEraserRadius(eraserRadiusFromPinch(pinchRatio) + this.offsetPx);
    let next = currentPx;
    if (Math.abs(target - currentPx) >= SIZE_DEAD_ZONE_PX) {
      next = currentPx + SIZE_SMOOTHING * (target - currentPx);
    }
    this.lastPx = next;
    return next;
  }

  /** The session ends (no second hand, or no fist). The radius stays where it is. */
  end(): void {
    this.offsetPx = null;
  }
}

/**
 * The eraser setting as the hand pipeline sees it. The surface owns the value in CSS px; erasing needs canvas px.
 */
export interface EraserControl {
  radiusCanvasPx(): number;
  radiusCss(): number;
  setRadiusCss(px: number): void;
  /** True when the radius must stay put: the two-hand sizer then does not run at all. Optional for test stubs. */
  isFixed?(): boolean;
}

/** A fixed radius for a driver with no surface (tests, tools): sizing requests are ignored. */
export function fixedEraserControl(canvas: HTMLCanvasElement, cssPx: number = ERASER_RADIUS_PX): EraserControl {
  return {
    radiusCanvasPx: () => eraserRadiusCanvasPx(canvas, cssPx),
    radiusCss: () => cssPx,
    setRadiusCss: () => undefined,
    isFixed: () => true,
  };
}

function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1);
}

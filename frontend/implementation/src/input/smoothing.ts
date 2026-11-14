/**
 * TASK 05/06 — Stabilizer & smoothing for hand-tracked drawing.
 * 1€ Filter (Casiez et al., CHI 2012) for adaptive jitter suppression.
 * Backwards-compatible PointSmoother wrapper.
 */

export class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;

  constructor(
    public minCutoff = 0.8,
    public beta = 0.015,
    public dCutoff = 1.0,
  ) {}

  reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  filter(x: number, timestamp?: number): number {
    const t = timestamp ?? performance.now();
    if (this.xPrev === null || this.tPrev === null) {
      this.xPrev = x;
      this.dxPrev = 0;
      this.tPrev = t;
      return x;
    }

    const dt = Math.max((t - this.tPrev) / 1000, 0.001);
    this.tPrev = t;

    const dx = (x - this.xPrev) / dt;
    const aD = alpha(this.dCutoff, dt);
    const edx = aD * dx + (1 - aD) * this.dxPrev;
    this.dxPrev = edx;

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const a = alpha(cutoff, dt);
    const xFiltered = a * x + (1 - a) * this.xPrev;
    this.xPrev = xFiltered;
    return xFiltered;
  }
}

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuroFilter2D {
  private xFilter: OneEuroFilter;
  private yFilter: OneEuroFilter;

  constructor(minCutoff = 0.8, beta = 0.015, dCutoff = 1.0) {
    this.xFilter = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.yFilter = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  reset(): void {
    this.xFilter.reset();
    this.yFilter.reset();
  }

  filter(p: { x: number; y: number }, timestamp?: number): { x: number; y: number } {
    return {
      x: this.xFilter.filter(p.x, timestamp),
      y: this.yFilter.filter(p.y, timestamp),
    };
  }
}

/** 1-euro tuning: cutoff at rest, speed sensitivity (beta), derivative cutoff. */
export interface OneEuroParams {
  minCutoff: number;
  beta: number;
  dCutoff: number;
  /** Output holds still while the filtered point stays within this radius (0..1 frame units). 0 = off. */
  deadZone?: number;
}

/** Gameplay default, unchanged. */
const DEFAULT_ONE_EURO: OneEuroParams = { minCutoff: 0.8, beta: 0.015, dCutoff: 1.0 };

/**
 * Hand drawing works in 0..1 frame coordinates, not pixels. With the gameplay beta (0.015) the filter
 * stayed a fixed ~0.8 Hz low-pass, so the ink lagged the hand by about 0.2 s. A larger beta lets it follow fast moves.
 * NUI-2 W-INK: a low minCutoff and a heavily smoothed speed estimate (dCutoff) keep a still hand at rest, while a
 * high beta keeps a moving line close to the hand. The dead zone (0.0025 frame, about 1 px at 400 px) removes the
 * remaining tremor. Tuned on synthetic noise (sigma 0.003), not on a camera: starting values, re-tune on the real camera.
 */
export const DRAWING_ONE_EURO: OneEuroParams = { minCutoff: 0.2, beta: 20, dCutoff: 0.2, deadZone: 0.0025 };

/**
 * Catmull-Rom spline through the last few points (Pencil Tool Illustrator feel). One Euro alone leaves
 * angular joints between frames: the resampler emits the intermediate samples of the smooth curve through
 * p1, p2, p3, p4 so consecutive ink points follow a tangent-continuous path instead of raw corner-to-corner segments.
 */
export class CatmullRomResampler {
  private history: Array<{ x: number; y: number }> = [];
  private readonly window: number;

  constructor(private readonly divisions = 1, window = 4) {
    this.window = Math.max(4, Math.min(window, 4));
  }

  reset(): void {
    this.history = [];
  }

  /**
   * Records the given point (already One-Euro filtered) and returns the resampled segment from the
   * previous recorded point to it. First call (or after reset) returns just the point itself.
   */
  push(point: { x: number; y: number }, timestamp: number): Array<{ x: number; y: number }> {
    this.history.push({ ...point });
    if (this.history.length > this.window) this.history.shift();
    if (this.history.length < 2) return [{ ...point }];
    const [p1, p2, p3, p4] = this.tail();
    const out: Array<{ x: number; y: number }> = [{ x: p3.x, y: p3.y }];
    for (let i = 1; i <= this.divisions; i++) out.push(catmullRom(p1, p2, p3, p4, i / this.divisions, timestamp));
    return out;
  }

  /** Oldest..newest, always exactly 4 entries. */
  private tail(): [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] {
    const h = this.history;
    const p0 = h[0]!;
    const p1 = h[1] ?? p0;
    const p2 = h[2] ?? p1;
    const p3 = h[3] ?? p2;
    return [p0, p1, p2, p3];
  }
}

/** Catmull-Rom basis at parameter t in 0..1 between p2 and p3. */
function catmullRom(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number },
  t: number,
  timestamp: number,
): { x: number; y: number } {
  void timestamp;
  const t2 = t * t;
  const t3 = t2 * t;
  const mix = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: mix(p1.x, p2.x, p3.x, p4.x), y: mix(p1.y, p2.y, p3.y, p4.y) };
}

export class PointSmoother {
  private last: { x: number; y: number } | null = null;
  private oneEuro: OneEuroFilter2D | null = null;
  /** Last output of the dead zone (drawing only); null until the first point. */
  private held: { x: number; y: number } | null = null;
  private readonly deadZone: number;

  constructor(private readonly alphaParam?: number, params: OneEuroParams = DEFAULT_ONE_EURO) {
    this.deadZone = params.deadZone ?? 0;
    if (alphaParam === undefined) {
      this.oneEuro = new OneEuroFilter2D(params.minCutoff, params.beta, params.dCutoff);
    }
  }

  reset(): void {
    this.last = null;
    this.held = null;
    this.oneEuro?.reset();
  }

  smooth(p: { x: number; y: number }, timestamp?: number): { x: number; y: number } {
    if (this.oneEuro) {
      return this.holdInDeadZone(this.oneEuro.filter(p, timestamp));
    }
    if (!this.last) {
      this.last = { ...p };
      return { ...p };
    }
    const a = this.alphaParam ?? 0.45;
    this.last = {
      x: this.last.x * (1 - a) + p.x * a,
      y: this.last.y * (1 - a) + p.y * a,
    };
    return { ...this.last };
  }

  /**
   * Soft dead zone: inside the radius the output stays put (no tremor at rest); outside it the output
   * follows the target minus the radius, so there is no step at the edge. Costs a constant
   * `deadZone` of lag on a steady move.
   */
  private holdInDeadZone(target: { x: number; y: number }): { x: number; y: number } {
    if (this.deadZone <= 0 || !this.held) {
      this.held = { ...target };
      return { ...target };
    }
    const dx = target.x - this.held.x;
    const dy = target.y - this.held.y;
    const d = Math.hypot(dx, dy);
    if (d <= this.deadZone) return { ...this.held };
    const k = (d - this.deadZone) / d;
    this.held = { x: this.held.x + dx * k, y: this.held.y + dy * k };
    return { ...this.held };
  }
}

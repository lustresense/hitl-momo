/**
 * R22 Variable-dt 1-Euro Temporal Filter for Cursor & Landmark Preview (`bench/one-euro.ts`).
 *
 * Acceptance IDs: P07, C06, G06.
 *
 * Design invariants:
 *  - Strictly uses REAL frame timestamp delta `dtSec` (never `requestAnimationFrame` tick counts!).
 *  - Kept strictly separate from `src/input/smoothing.ts` (`DRAWING_ONE_EURO` ink stroke smoothing) so
 *    cursor/overlay smoothing can be tuned, bypassed, or rolled back without altering ink geometry.
 *  - Automatically resets filter state on tracking loss, owner track change, backward/non-finite timestamps,
 *    or long time gaps (`> maxGapSec`) so stale velocity never pulls a newly acquired hand.
 */

export interface OneEuroConfig {
  /** Minimum cutoff frequency (Hz) at zero velocity. Lower = calmer stillness; higher = less onset lag. */
  minCutoff: number;
  /** Speed coefficient (slope). Higher = faster response during rapid motion. */
  beta: number;
  /** Derivative low-pass cutoff frequency (Hz). */
  dCutoff: number;
  /** Minimum clamped delta time in seconds (prevents division by zero on duplicate timestamps). */
  minDtSec?: number;
  /** Maximum gap in seconds before auto-resetting filter state (default 0.35s). */
  maxGapSec?: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface OneEuroUpdateContext {
  tracked?: boolean;
  ownerTrackId?: number | string | null;
}

/**
 * Tuned on [0..1] normalized coordinates across 15–60 FPS & variable-dt jitter/step curves:
 * low minCutoff + dCutoff calms stationary jitter (~75%+ reduction vs raw), while beta=14 keeps
 * 1-frame fast-press step lag (~67 ms @ 15 FPS) without EMA lag.
 */
export const DEFAULT_CURSOR_ONE_EURO_CONFIG: Readonly<OneEuroConfig> = Object.freeze({
  minCutoff: 0.9,
  beta: 14.0,
  dCutoff: 0.4,
  minDtSec: 1e-4,
  maxGapSec: 0.35,
});

export const DEFAULT_LANDMARK_ONE_EURO_CONFIG: Readonly<OneEuroConfig> = Object.freeze({
  minCutoff: 1.2,
  beta: 12.0,
  dCutoff: 0.5,
  minDtSec: 1e-4,
  maxGapSec: 0.35,
});

/** Exact Casiez et al. (CHI 2012) exponential smoothing factor from cutoff frequency (Hz) and `dtSec`. */
export function computeOneEuroAlpha(cutoffHz: number, dtSec: number): number {
  const safeCutoff = Math.max(1e-4, cutoffHz);
  const safeDt = Math.max(1e-6, dtSec);
  const tau = 1 / (2 * Math.PI * safeCutoff);
  return 1 / (1 + tau / safeDt);
}

export class OneEuroFilter1D {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private lastTimestampMs: number | null = null;
  private readonly minDtSec: number;
  private readonly maxGapSec: number;
  public minCutoff: number;
  public beta: number;
  public dCutoff: number;
  public resetCount = 0;

  constructor(config: Partial<OneEuroConfig> = {}) {
    const merged = { ...DEFAULT_CURSOR_ONE_EURO_CONFIG, ...config };
    this.minCutoff = merged.minCutoff;
    this.beta = merged.beta;
    this.dCutoff = merged.dCutoff;
    this.minDtSec = merged.minDtSec ?? 1e-4;
    this.maxGapSec = merged.maxGapSec ?? 0.35;
  }

  get isInitialized(): boolean {
    return this.xPrev !== null;
  }

  reset(): void {
    if (this.xPrev !== null || this.lastTimestampMs !== null) {
      this.resetCount++;
    }
    this.xPrev = null;
    this.dxPrev = 0;
    this.lastTimestampMs = null;
  }

  /** Filter value using explicit `timestampMs` (real capture timestamp in milliseconds). */
  filter(value: number, timestampMs: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(timestampMs)) {
      this.reset();
      return value;
    }
    if (this.xPrev === null || this.lastTimestampMs === null) {
      this.xPrev = value;
      this.dxPrev = 0;
      this.lastTimestampMs = timestampMs;
      return value;
    }
    const rawDtSec = (timestampMs - this.lastTimestampMs) / 1000;
    if (rawDtSec <= 0) {
      // Identical or non-monotonic timestamp: keep timestamp synced without corrupting derivative
      this.lastTimestampMs = timestampMs;
      return this.xPrev;
    }
    if (rawDtSec > this.maxGapSec) {
      this.reset();
      this.xPrev = value;
      this.dxPrev = 0;
      this.lastTimestampMs = timestampMs;
      return value;
    }
    this.lastTimestampMs = timestampMs;
    return this.stepWithDt(value, Math.max(this.minDtSec, rawDtSec));
  }

  /** Filter value using explicit `dtSec` (real frame interval in seconds). */
  filterDt(value: number, dtSec: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(dtSec)) {
      this.reset();
      return value;
    }
    if (this.xPrev === null || dtSec > this.maxGapSec) {
      if (this.xPrev !== null && dtSec > this.maxGapSec) this.reset();
      this.xPrev = value;
      this.dxPrev = 0;
      return value;
    }
    if (dtSec <= 0) {
      return this.xPrev;
    }
    return this.stepWithDt(value, Math.max(this.minDtSec, dtSec));
  }

  private stepWithDt(value: number, dtSec: number): number {
    const prev = this.xPrev!;
    const dx = (value - prev) / dtSec;
    const alphaD = computeOneEuroAlpha(this.dCutoff, dtSec);
    const edx = alphaD * dx + (1 - alphaD) * this.dxPrev;
    this.dxPrev = edx;

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const alpha = computeOneEuroAlpha(cutoff, dtSec);
    const filtered = alpha * value + (1 - alpha) * prev;
    this.xPrev = filtered;
    return filtered;
  }
}

export class OneEuroPoint2DFilter {
  private readonly xFilter: OneEuroFilter1D;
  private readonly yFilter: OneEuroFilter1D;
  private lastOwnerId: number | string | null = null;
  public resetCount = 0;

  constructor(config: Partial<OneEuroConfig> = {}) {
    this.xFilter = new OneEuroFilter1D(config);
    this.yFilter = new OneEuroFilter1D(config);
  }

  get isInitialized(): boolean {
    return this.xFilter.isInitialized && this.yFilter.isInitialized;
  }

  reset(): void {
    if (this.isInitialized || this.lastOwnerId !== null) {
      this.resetCount++;
    }
    this.xFilter.reset();
    this.yFilter.reset();
    this.lastOwnerId = null;
  }

  filter(
    point: Point2D | null | undefined,
    timestampMs: number,
    context?: OneEuroUpdateContext,
  ): Point2D | null {
    if (!point || context?.tracked === false) {
      this.reset();
      return null;
    }
    if (context?.ownerTrackId !== undefined && context.ownerTrackId !== this.lastOwnerId) {
      if (this.lastOwnerId !== null) {
        this.reset();
      }
      this.lastOwnerId = context.ownerTrackId ?? null;
    }
    return {
      x: this.xFilter.filter(point.x, timestampMs),
      y: this.yFilter.filter(point.y, timestampMs),
    };
  }

  filterDt(
    point: Point2D | null | undefined,
    dtSec: number,
    context?: OneEuroUpdateContext,
  ): Point2D | null {
    if (!point || context?.tracked === false) {
      this.reset();
      return null;
    }
    if (context?.ownerTrackId !== undefined && context.ownerTrackId !== this.lastOwnerId) {
      if (this.lastOwnerId !== null) {
        this.reset();
      }
      this.lastOwnerId = context.ownerTrackId ?? null;
    }
    return {
      x: this.xFilter.filterDt(point.x, dtSec),
      y: this.yFilter.filterDt(point.y, dtSec),
    };
  }
}

export class OneEuroLandmark21Filter {
  private readonly filters: Array<{ x: OneEuroFilter1D; y: OneEuroFilter1D; z: OneEuroFilter1D }>;
  private lastOwnerId: number | string | null = null;
  public resetCount = 0;

  constructor(config: Partial<OneEuroConfig> = DEFAULT_LANDMARK_ONE_EURO_CONFIG) {
    this.filters = Array.from({ length: 21 }, () => ({
      x: new OneEuroFilter1D(config),
      y: new OneEuroFilter1D(config),
      z: new OneEuroFilter1D(config),
    }));
  }

  get isInitialized(): boolean {
    return this.filters[0]?.x.isInitialized ?? false;
  }

  reset(): void {
    if (this.isInitialized || this.lastOwnerId !== null) {
      this.resetCount++;
    }
    for (const f of this.filters) {
      f.x.reset();
      f.y.reset();
      f.z.reset();
    }
    this.lastOwnerId = null;
  }

  filter(
    landmarks: ReadonlyArray<Point3D> | null | undefined,
    timestampMs: number,
    context?: OneEuroUpdateContext,
  ): Point3D[] | null {
    if (!landmarks || landmarks.length === 0 || context?.tracked === false) {
      this.reset();
      return null;
    }
    if (landmarks.length !== 21) {
      this.reset();
      return landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    }
    if (context?.ownerTrackId !== undefined && context.ownerTrackId !== this.lastOwnerId) {
      if (this.lastOwnerId !== null) {
        this.reset();
      }
      this.lastOwnerId = context.ownerTrackId ?? null;
    }
    return landmarks.map((p, idx) => {
      const f = this.filters[idx]!;
      return {
        x: f.x.filter(p.x, timestampMs),
        y: f.y.filter(p.y, timestampMs),
        z: f.z.filter(p.z, timestampMs),
      };
    });
  }

  filterDt(
    landmarks: ReadonlyArray<Point3D> | null | undefined,
    dtSec: number,
    context?: OneEuroUpdateContext,
  ): Point3D[] | null {
    if (!landmarks || landmarks.length === 0 || context?.tracked === false) {
      this.reset();
      return null;
    }
    if (landmarks.length !== 21) {
      this.reset();
      return landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    }
    if (context?.ownerTrackId !== undefined && context.ownerTrackId !== this.lastOwnerId) {
      if (this.lastOwnerId !== null) {
        this.reset();
      }
      this.lastOwnerId = context.ownerTrackId ?? null;
    }
    return landmarks.map((p, idx) => {
      const f = this.filters[idx]!;
      return {
        x: f.x.filterDt(p.x, dtSec),
        y: f.y.filterDt(p.y, dtSec),
        z: f.z.filterDt(p.z, dtSec),
      };
    });
  }
}

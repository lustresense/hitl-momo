import {
  R1_NIB_LANDMARK,
  R1_NIB_ONE_EURO_BETA,
  R1_NIB_ONE_EURO_MIN_CUTOFF,
  R1_NIB_ROLLBACK_MS,
  R1_ONE_EURO_D_CUTOFF,
  R1_ROLLBACK_WINDOW_MS,
  R1_T_GAP_MAX_MS,
} from "../../core/constants";
import { OneEuro1D, type OneEuroParams } from "./one-euro";
import type { Pt } from "./pointer-filter";

/** Ink filter for the index fingertip (landmark 8; own parameters, separate from pointer). */
export const NIB_LANDMARK_INDEX = R1_NIB_LANDMARK;
export const NIB_ONE_EURO: OneEuroParams = {
  minCutoff: R1_NIB_ONE_EURO_MIN_CUTOFF,
  beta: R1_NIB_ONE_EURO_BETA,
  dCutoff: R1_ONE_EURO_D_CUTOFF,
  maxGapMs: R1_T_GAP_MAX_MS,
};
export const NIB_ROLLBACK_MS = R1_NIB_ROLLBACK_MS;
export const NIB_BUFFER_MS = R1_ROLLBACK_WINDOW_MS;

export interface TimedPt extends Pt {
  t: number;
}

/** Drop the last `ms` of a stroke (pinch-release tail). Keeps at least the first point. */
export function trimTail(points: ReadonlyArray<TimedPt>, tEnd: number, ms = NIB_ROLLBACK_MS): TimedPt[] {
  const span = Math.max(0, ms);
  const kept = points.filter((p) => p.t <= tEnd - span);
  const first = points[0];
  return kept.length === 0 && first ? [{ x: first.x, y: first.y, t: first.t }] : kept.map((p) => ({ x: p.x, y: p.y, t: p.t }));
}

export interface NibFilter {
  update(raw: Pt, tMs: number): TimedPt;
  /** Points from [t-200ms, t]: seed the stroke so it starts where the user intended. */
  begin(tMs: number): TimedPt[];
  /** Stroke points with the release tail removed. */
  end(stroke: ReadonlyArray<TimedPt>, tMs: number, trimMs?: number): TimedPt[];
  reset(): void;
}

export function createNibFilter(): NibFilter {
  const fx = new OneEuro1D({ ...NIB_ONE_EURO });
  const fy = new OneEuro1D({ ...NIB_ONE_EURO });
  let buf: TimedPt[] = [];
  return {
    update(raw, t) {
      const p = { x: fx.filter(raw.x, t), y: fy.filter(raw.y, t), t };
      if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(t)) {
        const last = buf[buf.length - 1];
        if (!last || t >= last.t) {
          buf.push(p);
          while (buf.length > 1 && (buf[0] as TimedPt).t < t - NIB_BUFFER_MS) buf.shift();
        }
      }
      return { x: p.x, y: p.y, t: p.t };
    },
    begin(t) {
      const pts = buf.filter((p) => p.t >= t - NIB_ROLLBACK_MS && p.t <= t);
      const src = pts.length ? pts : buf.slice(-1);
      return src.map((p) => ({ x: p.x, y: p.y, t: p.t }));
    },
    end: (stroke, t, trimMs = NIB_ROLLBACK_MS) => trimTail(stroke, t, trimMs),
    reset() {
      fx.reset();
      fy.reset();
      buf = [];
    },
  };
}

import {
  R1_REACQUIRE_OPEN_FRAMES,
  R1_T_GAP_MAX_MS,
  R1_T_GAP_MEDIAN_MULT,
  R1_T_GAP_MIN_MS,
} from "../../core/constants";

export const T_GAP_MIN_MS = R1_T_GAP_MIN_MS;
export const T_GAP_MAX_MS = R1_T_GAP_MAX_MS;
export const REACQUIRE_OPEN_FRAMES = R1_REACQUIRE_OPEN_FRAMES;

export type HoldState = "idle" | "tracking" | "held" | "lost";

export interface HoldResult {
  state: HoldState;
  /** Cursor frozen + grey, ring must not drain. */
  frozen: boolean;
  /** True once, on the frame the gap expires: reset filters, cancel press, end stroke. */
  expired: boolean;
}

export function tGapFor(dts: ReadonlyArray<number>): number {
  const valid = dts.filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length === 0) return T_GAP_MIN_MS;
  const s = valid.sort((a, b) => a - b);
  const mid = s.length >> 1;
  const med = s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
  return Math.min(T_GAP_MAX_MS, Math.max(T_GAP_MIN_MS, R1_T_GAP_MEDIAN_MULT * med));
}

export interface LossHold {
  /** visible = owner hand detected this frame; open = it is an open hand. */
  update(tMs: number, visible: boolean, open: boolean): HoldResult;
  /** Current T_gap (ms) derived from recent visible frame intervals. */
  tGap(): number;
  reset(): void;
}

export function createLossHold(): LossHold {
  let state: HoldState = "idle";
  let lastSeen = 0;
  let lastFrameT: number | null = null;
  let openRun = 0;
  const dts: number[] = [];
  return {
    update(t, visible, open) {
      if (visible) {
        if (lastFrameT !== null && t > lastFrameT) {
          dts.push(t - lastFrameT);
          if (dts.length > 15) dts.shift();
        }
        lastFrameT = t;
        if (state === "tracking" || state === "held") {
          if (t - lastSeen > tGapFor(dts)) {
            state = "lost";
            openRun = open ? 1 : 0;
            return { state, frozen: true, expired: true };
          }
          state = "tracking";
          lastSeen = t;
          return { state, frozen: false, expired: false };
        }
        openRun = open ? openRun + 1 : 0;
        if (openRun >= REACQUIRE_OPEN_FRAMES) {
          state = "tracking";
          lastSeen = t;
          return { state, frozen: false, expired: false };
        }
        return { state, frozen: state === "lost", expired: false };
      }
      lastFrameT = null;
      openRun = 0;
      if (state === "tracking" || state === "held") {
        if (t - lastSeen > tGapFor(dts)) {
          state = "lost";
          return { state, frozen: true, expired: true };
        }
        state = "held";
        return { state, frozen: true, expired: false };
      }
      return { state, frozen: state === "lost", expired: false };
    },
    tGap: () => tGapFor(dts),
    reset() {
      state = "idle";
      lastSeen = 0;
      lastFrameT = null;
      openRun = 0;
      dts.length = 0;
    },
  };
}

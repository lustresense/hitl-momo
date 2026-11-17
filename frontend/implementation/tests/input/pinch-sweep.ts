/**
 * Synthetic gap sweeps for the pinch gate (R17-05, evidence class UNIT_ONLY). Real class-median hands, 16:9 frame.
 * Shared by tests/input/pinch-gate.test.ts and scripts/nui-rd/pinch_ab.ts.
 */
import { HandStrokePipeline } from "../../src/input/hand-stroke-pipeline";
import { StrokeStore } from "../../src/input/types";
import { pinchSkeleton, placeHand } from "./realistic-hands";

export const FPS = 30;
export const ASPECT = 16 / 9;
export type Mode = "baseline" | "lab";

export function make(mode: Mode) {
  const store = new StrokeStore();
  const pipe = new HandStrokePipeline({
    store,
    size: () => ({ width: 1280, height: 720 }),
    eraser: { radiusCanvasPx: () => 32, radiusCss: () => 16, setRadiusCss: () => undefined, isFixed: () => true },
    experimentalRobust: mode === "lab",
    aspect: () => ASPECT,
  });
  return { store, pipe };
}
export const frame = (gap: number, dx = 0) => placeHand(pinchSkeleton(gap), { aspect: ASPECT, cx: 0.5 + dx });
export const inkPoints = (s: StrokeStore) => {
  const g = s.getStrokes();
  return g.completed.reduce((n, st) => n + st.length, 0) + (g.active?.length ?? 0);
};

export function hold(mode: Mode, gap: number, frames = 60) {
  const { store, pipe } = make(mode);
  let t = 0;
  for (let i = 0; i < frames; i++) pipe.feed(frame(gap, i * 0.0005), (t += 1000 / FPS));
  return inkPoints(store);
}

export function closing(mode: Mode, speedSpansPerS: number) {
  const { store, pipe } = make(mode);
  let t = 0;
  let gap = 1.0;
  let firstInkGap: number | null = null;
  let contactFrame: number | null = null;
  let inkFrame: number | null = null;
  for (let i = 0; i < 200 && gap > 0.05; i++) {
    gap = Math.max(0.05, 1.0 - (speedSpansPerS * i) / FPS);
    pipe.feed(frame(gap, i * 0.0005), (t += 1000 / FPS));
    if (gap <= 0.05 && contactFrame === null) contactFrame = i;
    if (inkPoints(store) > 0 && firstInkGap === null) {
      firstInkGap = gap;
      inkFrame = i;
    }
  }
  // keep touching until ink is certainly on, to measure the lag
  let extra = 0;
  while (inkFrame === null && extra < 30) {
    pipe.feed(frame(0.05, (200 + extra) * 0.0005), (t += 1000 / FPS));
    extra++;
    if (inkPoints(store) > 0) inkFrame = 200 + extra;
  }
  return { inkAtGap: firstInkGap, lagFrames: inkFrame !== null && contactFrame !== null ? Math.max(0, inkFrame - contactFrame) : null, started: inkFrame !== null };
}

export function releasing(mode: Mode, speedSpansPerS: number) {
  const { store, pipe } = make(mode);
  let t = 0;
  for (let i = 0; i < 12; i++) pipe.feed(frame(0.05, i * 0.0005), (t += 1000 / FPS)); // pinch on, drawing
  const before = inkPoints(store);
  let tail = 0;
  let tailGap: number | null = null;
  let gap = 0.05;
  for (let i = 0; i < 90 && gap < 1.2; i++) {
    gap = 0.05 + (speedSpansPerS * i) / FPS;
    pipe.feed(frame(gap, (12 + i) * 0.0005), (t += 1000 / FPS));
    const now = inkPoints(store);
    if (gap > 0.5 && now > before + tail) {
      tail = now - before;
      tailGap = gap;
    }
  }
  return { tailPoints: tail, lastInkGap: tailGap };
}


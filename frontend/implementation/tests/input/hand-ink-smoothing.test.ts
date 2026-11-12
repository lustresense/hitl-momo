// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PointSmoother, DRAWING_ONE_EURO } from "@/src/input/smoothing";
import { makeHand } from "./hand-fixtures";
import { FPS, H, W, frameMs, makeInkPipeline, noisyPinch, runPinchPath, seededRandom, std, type InkSample } from "./ink-synthetic";

/**
 * Regression numbers for the drawing ink (synthetic: no camera in the sandbox).
 * Baseline before NUI-2 W-INK, same rig, sigma 0.003 frame noise, 3 seeds:
 *   still jitter 0.39 px (radial), slow lag 53.4 ms, fast lag 12.5 ms, overshoot 1 px.
 * Thresholds are starting values for the owner's test, not measured on a real camera.
 */
const SIGMA = 0.003;
const SEEDS = [1, 2, 3];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function still() {
  return SEEDS.map((seed) => {
    const s = runPinchPath(() => ({ x: 0.5, y: 0.5 }), 10 * FPS, SIGMA, seed).slice(FPS);
    return Math.hypot(std(s.map((p) => p.out!.x)), std(s.map((p) => p.out!.y)));
  });
}

describe("ink jitter: a still pinch stays still", () => {
  it("radial jitter is at most a quarter of the baseline (0.39 px -> 0.10 px)", () => {
    expect(mean(still())).toBeLessThanOrEqual(0.1);
  });
});

describe("ink after a fast stop: no wobble left behind", () => {
  it("a still hand 1.5 s after a swipe stops wobbles by at most 0.2 px", () => {
    const sds = SEEDS.map((seed) => {
      const s = runPinchPath((t) => ({ x: 0.2 + 1.5 * Math.min(t, 0.4), y: 0.5 }), 4 * FPS, SIGMA, seed).slice(24 + 90);
      return std(s.map((p) => p.out!.x));
    });
    expect(mean(sds)).toBeLessThanOrEqual(0.2);
  });
});

describe("ink lag: the line keeps up with the hand", () => {
  it("a slow line (40 px/s) lags by at most 60 ms", () => {
    const lags = SEEDS.map((seed) => {
      const speed = (-0.1 * W) / 1000;
      const s = runPinchPath((t) => ({ x: 0.3 + 0.1 * t, y: 0.5 }), 3 * FPS, SIGMA, seed).slice(FPS);
      return mean(s.map((p) => (p.truth.x - p.out!.x) / speed));
    });
    expect(mean(lags)).toBeLessThanOrEqual(60);
  });

  it("a fast swipe lags by at most 40 ms and overshoots its stop by at most 1 px", () => {
    const speed = (-1.5 * W) / 1000;
    const stopX = (1 - (0.2 + 1.5 * 0.4)) * W;
    const lags: number[] = [];
    const overs: number[] = [];
    for (const seed of SEEDS) {
      const s = runPinchPath((t) => ({ x: 0.2 + 1.5 * Math.min(t, 0.4), y: 0.5 }), 2 * FPS, SIGMA, seed);
      lags.push(mean(s.slice(12, 24).map((p) => (p.truth.x - p.out!.x) / speed)));
      overs.push(Math.max(0, ...s.slice(24).map((p) => stopX - p.out!.x)));
    }
    expect(mean(lags)).toBeLessThanOrEqual(40);
    expect(Math.max(...overs)).toBeLessThanOrEqual(1);
  });
});

describe("dead zone: small holds at rest, no step at its edge", () => {
  it("the output does not move for a target that stays inside the dead zone", () => {
    const s = new PointSmoother(undefined, { ...DRAWING_ONE_EURO, deadZone: 0.01 });
    s.smooth({ x: 0.5, y: 0.5 }, 1000);
    const held = [0.5045, 0.4955, 0.5040, 0.4960].map((x, i) => s.smooth({ x, y: 0.5 }, 1000 + (i + 1) * 16));
    for (const p of held) expect(p.x).toBeCloseTo(0.5, 9);
  });

  it("a move larger than the dead zone is followed with no jump at the edge", () => {
    const s = new PointSmoother(undefined, { ...DRAWING_ONE_EURO, deadZone: 0.01 });
    let prev = s.smooth({ x: 0.5, y: 0.5 }, 1000);
    let maxStep = 0;
    for (let i = 1; i <= 60; i++) {
      const cur = s.smooth({ x: 0.5 + 0.002 * i, y: 0.5 }, 1000 + i * 16);
      maxStep = Math.max(maxStep, Math.abs(cur.x - prev.x));
      prev = cur;
    }
    expect(maxStep).toBeLessThan(0.02);
    expect(prev.x).toBeGreaterThan(0.6);
  });
});

describe("pinch flicker: a stroke does not break", () => {
  const gapFrame = (x: number, gap: number) =>
    makeHand({ ratios: [1.5, 0.5, 0.5, 0.5], indexTip: { x, y: 0.55 }, thumbTip: { x: x + gap * 0.2, y: 0.55 } });
  const open = () => makeHand({ ratios: [1.5, 1.5, 1.5, 1.5] });

  function drive(frames: Array<ReturnType<typeof gapFrame> | ReturnType<typeof open>>) {
    const { store, pipeline } = makeInkPipeline();
    frames.forEach((lm, i) => pipeline.feed(lm, frameMs(i)));
    return store;
  }

  it("a two-frame pinch dropout keeps one stroke", () => {
    const frames = [0, 1, 2, 3, 4].map((i) => gapFrame(0.4 + 0.01 * i, 0.04));
    frames.push(open(), open());
    frames.push(...[0, 1, 2, 3].map((i) => gapFrame(0.45 + 0.01 * i, 0.04)));
    const store = drive(frames);
    expect(store.getStrokes().completed).toHaveLength(0);
    expect(store.getStrokes().active).not.toBeNull();
  });

  it("a gap that drifts between the enter and exit ratio does not end a held stroke", () => {
    // Gap 0.48 of the span: above entry (0.42), below exit (0.55). Held pinch must stay.
    const frames = [0, 1, 2].map((i) => gapFrame(0.4 + 0.01 * i, 0.04));
    for (let i = 3; i < 40; i++) frames.push(gapFrame(0.4 + 0.01 * i, 0.096));
    const store = drive(frames);
    expect(store.getStrokes().completed).toHaveLength(0);
    expect(store.getStrokes().active).not.toBeNull();
  });

  it("a real release ends the stroke, and the next pinch starts a new one", () => {
    const frames = [0, 1, 2, 3].map((i) => gapFrame(0.4 + 0.01 * i, 0.04));
    frames.push(open(), open(), open(), open());
    frames.push(...[0, 1, 2].map((i) => gapFrame(0.6 + 0.01 * i, 0.04)));
    const store = drive(frames);
    expect(store.getStrokes().completed).toHaveLength(1);
    expect(store.getStrokes().active).not.toBeNull();
  });
});

describe("real timestamps: the lag in ms does not depend on the frame rate", () => {
  it("a slow line at 30 fps and 60 fps lags by about the same time", () => {
    const lagAt = (fps: number) => {
      const { pipeline } = makeInkPipeline();
      const rand = seededRandom(9);
      const speed = (-0.1 * W) / 1000;
      const out: InkSample[] = [];
      for (let i = 0; i < 3 * fps; i++) {
        const t = i / fps;
        const p = { x: 0.3 + 0.1 * t, y: 0.5 };
        const frame = pipeline.feed(noisyPinch(p.x, p.y, 0, rand), 1000 + (i * 1000) / fps);
        out.push({ out: frame.cursor ? { x: frame.cursor.x, y: frame.cursor.y } : null, truth: { x: (1 - p.x) * W, y: p.y * H }, nowMs: frameMs(i), frame });
      }
      return mean(out.slice(fps).map((p) => (p.truth.x - p.out!.x) / speed));
    };
    expect(Math.abs(lagAt(30) - lagAt(60))).toBeLessThanOrEqual(15);
  });
});

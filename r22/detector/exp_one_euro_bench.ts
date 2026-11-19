/**
 * R22 1-Euro Cursor Filter Benchmark (`exp_one_euro_bench.ts`).
 *
 * Tests the ACTUAL `bench/one-euro.ts` module against RAW and EMA cursor smoothing across:
 *   1. Stillness jitter suppression (sigma=0.004 normalized ~ 2.56 px @ 640px) at 15 FPS, 30 FPS, 60 FPS,
 *      and variable/jittery webcam dt (12..33 FPS).
 *   2. Fast-press / step-onset lag (ms to reach 90% of a 0.18 step & rapid diagonal sweep lag).
 *   3. Tracking-loss & owner-change automatic reset (verifying 0 pull/ghost lag on reacquire).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import {
  DEFAULT_CURSOR_ONE_EURO_CONFIG,
  OneEuroPoint2DFilter,
  type Point2D,
} from "../../../r22-nui-lab/frontend/implementation/src/components/nui-lab/bench/one-euro";

const OUT_JSON = "/srv/sketchbook/mediapipe-optimize/research-can/r22/detector/r22_one_euro_bench.json";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randn(rng: () => number): number {
  const u1 = Math.max(1e-9, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

class EmaPointFilter {
  private prev: Point2D | null = null;
  constructor(private readonly alpha: number) {}
  reset(): void {
    this.prev = null;
  }
  filter(p: Point2D): Point2D {
    if (!this.prev) {
      this.prev = { ...p };
      return { ...p };
    }
    this.prev = {
      x: this.prev.x * (1 - this.alpha) + p.x * this.alpha,
      y: this.prev.y * (1 - this.alpha) + p.y * this.alpha,
    };
    return { ...this.prev };
  }
}

function round(v: number, d = 3): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function runStillnessBench(timestampsMs: number[], sigma: number, cfg: typeof DEFAULT_CURSOR_ONE_EURO_CONFIG) {
  const rng = mulberry32(20261119);
  const noisy: Point2D[] = timestampsMs.map(() => ({
    x: 0.5 + randn(rng) * sigma,
    y: 0.5 + randn(rng) * sigma,
  }));

  const ema35 = new EmaPointFilter(0.35);
  const ema45 = new EmaPointFilter(0.45);
  const oe = new OneEuroPoint2DFilter(cfg);

  const calcStats = (pts: Point2D[]) => {
    // Discard first 10% warmup
    const start = Math.max(1, Math.floor(pts.length * 0.1));
    const sub = pts.slice(start);
    const errPx = sub.map((p) => Math.hypot(p.x - 0.5, p.y - 0.5) * 640);
    const stepDeltaPx = sub.slice(1).map((p, i) => Math.hypot(p.x - sub[i]!.x, p.y - sub[i]!.y) * 640);
    const rms = Math.sqrt(errPx.reduce((s, e) => s + e * e, 0) / errPx.length);
    const meanJitter = stepDeltaPx.reduce((s, e) => s + e, 0) / stepDeltaPx.length;
    return { rmsPx: round(rms), frameToFrameJitterPx: round(meanJitter) };
  };

  const outRaw = noisy;
  const outEma35 = noisy.map((p) => ema35.filter(p));
  const outEma45 = noisy.map((p) => ema45.filter(p));
  const outOe = noisy.map((p, i) => oe.filter(p, timestampsMs[i]!)!);

  return {
    raw: calcStats(outRaw),
    ema_alpha_0_35: calcStats(outEma35),
    ema_alpha_0_45: calcStats(outEma45),
    one_euro: calcStats(outOe),
  };
}

function runStepAndFastSweepBench(timestampsMs: number[], cfg: typeof DEFAULT_CURSOR_ONE_EURO_CONFIG) {
  // Step jump from 0.40 -> 0.58 (+0.18) at frame 10 (simulates rapid pinch-drag onset)
  const stepIdx = 10;
  const startVal = 0.4;
  const endVal = 0.58;
  const target90 = startVal + 0.9 * (endVal - startVal);

  const ema35 = new EmaPointFilter(0.35);
  const ema45 = new EmaPointFilter(0.45);
  const oe = new OneEuroPoint2DFilter(cfg);

  let lagEma35Ms: number | null = null;
  let lagEma45Ms: number | null = null;
  let lagOeMs: number | null = null;
  const tStep0 = timestampsMs[stepIdx]!;

  for (let i = 0; i < timestampsMs.length; i++) {
    const x = i < stepIdx ? startVal : endVal;
    const p = { x, y: 0.5 };
    const e35 = ema35.filter(p);
    const e45 = ema45.filter(p);
    const o1 = oe.filter(p, timestampsMs[i]!)!;
    if (i >= stepIdx) {
      const dtSinceStep = timestampsMs[i]! - tStep0;
      if (lagEma35Ms === null && e35.x >= target90) lagEma35Ms = round(dtSinceStep, 1);
      if (lagEma45Ms === null && e45.x >= target90) lagEma45Ms = round(dtSinceStep, 1);
      if (lagOeMs === null && o1.x >= target90) lagOeMs = round(dtSinceStep, 1);
    }
  }

  // Fast sweep ramp: 0.2 -> 0.8 over 0.5s
  const oeSweep = new OneEuroPoint2DFilter(cfg);
  const emaSweep = new EmaPointFilter(0.35);
  const oeErrorsPx: number[] = [];
  const emaErrorsPx: number[] = [];
  for (let i = 0; i < timestampsMs.length; i++) {
    const tSec = (timestampsMs[i]! - timestampsMs[0]!) / 1000;
    const xTrue = 0.2 + 0.3 * Math.sin(2 * Math.PI * 1.2 * tSec);
    const p = { x: xTrue, y: 0.5 };
    const e = emaSweep.filter(p);
    const o = oeSweep.filter(p, timestampsMs[i]!)!;
    if (i >= 5) {
      emaErrorsPx.push(Math.abs(e.x - xTrue) * 640);
      oeErrorsPx.push(Math.abs(o.x - xTrue) * 640);
    }
  }

  return {
    step90LagMs: {
      raw: 0,
      ema_alpha_0_35: lagEma35Ms,
      ema_alpha_0_45: lagEma45Ms,
      one_euro: lagOeMs,
    },
    fastSineMeanTrackingErrorPx: {
      ema_alpha_0_35: round(emaErrorsPx.reduce((a, b) => a + b, 0) / emaErrorsPx.length, 2),
      one_euro: round(oeErrorsPx.reduce((a, b) => a + b, 0) / oeErrorsPx.length, 2),
    },
  };
}

function runLossAndOwnerResetCheck() {
  const oe = new OneEuroPoint2DFilter(DEFAULT_CURSOR_ONE_EURO_CONFIG);
  oe.filter({ x: 0.2, y: 0.2 }, 1000, { tracked: true, ownerTrackId: 1 });
  oe.filter({ x: 0.205, y: 0.202 }, 1066, { tracked: true, ownerTrackId: 1 });
  // Tracking lost -> must return null & reset
  const lostOut = oe.filter(null, 1133, { tracked: false });
  // Reacquire far away -> must snap cleanly with 0 lag pull from 0.2!
  const reacquired = oe.filter({ x: 0.8, y: 0.75 }, 1200, { tracked: true, ownerTrackId: 1 });
  // Direct owner change without null frame -> must also reset!
  const switched = oe.filter({ x: 0.15, y: 0.85 }, 1266, { tracked: true, ownerTrackId: 2 });
  return {
    lostReturnedNull: lostOut === null,
    reacquiredSnappedExact: reacquired !== null && Math.abs(reacquired.x - 0.8) < 1e-9 && Math.abs(reacquired.y - 0.75) < 1e-9,
    ownerSwitchSnappedExact: switched !== null && Math.abs(switched.x - 0.15) < 1e-9 && Math.abs(switched.y - 0.85) < 1e-9,
    resetCount: oe.resetCount,
  };
}

function makeTimestamps(n: number, fps: number, jitterFrac = 0): number[] {
  const rng = mulberry32(9911 + Math.round(fps * 10));
  const out: number[] = [0];
  const baseDt = 1000 / fps;
  for (let i = 1; i < n; i++) {
    const j = jitterFrac > 0 ? (rng() * 2 - 1) * jitterFrac * baseDt : 0;
    out.push(out[i - 1]! + Math.max(8, baseDt + j));
  }
  return out;
}

const configSweep = [
  { name: "uncalibrated_low_beta_0_35", minCutoff: 1.4, beta: 0.35, dCutoff: 1.0 },
  { name: "mild_beta_3_0", minCutoff: 1.0, beta: 3.0, dCutoff: 0.5 },
  { name: "balanced_beta_8_0", minCutoff: 1.0, beta: 8.0, dCutoff: 0.5 },
  { name: "fast_beta_12_0", minCutoff: 1.0, beta: 12.0, dCutoff: 0.5 },
  { name: "drawing_like_beta_20_0", minCutoff: 0.8, beta: 20.0, dCutoff: 0.35 },
];

const profiles = [
  { name: "webcam_15fps", ts: makeTimestamps(120, 15, 0) },
  { name: "webcam_30fps", ts: makeTimestamps(180, 30, 0) },
  { name: "webcam_60fps", ts: makeTimestamps(240, 60, 0) },
  { name: "variable_dt_12_33fps", ts: makeTimestamps(150, 20, 0.45) },
];

const results: Record<string, unknown> = {
  generated_at: new Date().toISOString(),
  default_config: DEFAULT_CURSOR_ONE_EURO_CONFIG,
  loss_and_owner_reset_check: runLossAndOwnerResetCheck(),
  by_fps_profile: {} as Record<string, unknown>,
  config_tuning_at_15fps: {} as Record<string, unknown>,
};

for (const prof of profiles) {
  (results.by_fps_profile as Record<string, unknown>)[prof.name] = {
    stillness_sigma_0_004: runStillnessBench(prof.ts, 0.004, DEFAULT_CURSOR_ONE_EURO_CONFIG),
    fast_onset_and_sweep: runStepAndFastSweepBench(prof.ts, DEFAULT_CURSOR_ONE_EURO_CONFIG),
  };
}

const ts15 = makeTimestamps(120, 15, 0);
for (const cfg of configSweep) {
  (results.config_tuning_at_15fps as Record<string, unknown>)[cfg.name] = {
    config: cfg,
    stillness_sigma_0_004: runStillnessBench(ts15, 0.004, cfg),
    fast_onset_and_sweep: runStepAndFastSweepBench(ts15, cfg),
  };
}

mkdirSync("/srv/sketchbook/mediapipe-optimize/research-can/r22/detector", { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

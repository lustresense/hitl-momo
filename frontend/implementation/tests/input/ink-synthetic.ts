import { HandStrokePipeline, type HandFrame } from "@/src/input/hand-stroke-pipeline";
import { StrokeStore, type Landmark } from "@/src/input/types";
import type { EraserControl } from "@/src/input/eraser";
import { pinchHand } from "./hand-fixtures";

/**
 * Synthetic pinch-drawing rig for the ink smoothing tests (no camera in the sandbox).
 * Noise is seeded, so every number a test prints or asserts is reproducible.
 * Camera-frame coordinates in, canvas px out: the pipeline mirrors x and maps to W x H.
 */

export const W = 400;
export const H = 300;
export const FPS = 60;

/** Frame clock: frame i at 1000 ms + i / FPS. */
export const frameMs = (i: number): number => 1000 + (i * 1000) / FPS;

/** mulberry32: small seeded PRNG, enough for test noise. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample (Box-Muller) from a uniform source. */
export function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** A pinch at camera point (x, y) with independent Gaussian noise on all 21 landmarks (frame units). */
export function noisyPinch(x: number, y: number, sigma: number, rand: () => number): Landmark[] {
  return pinchHand(x, y).map((p) => ({ x: p.x + sigma * gaussian(rand), y: p.y + sigma * gaussian(rand) }));
}

const eraser: EraserControl = {
  radiusCanvasPx: () => 28,
  radiusCss: () => 28,
  setRadiusCss: () => undefined,
  isFixed: () => true,
};

export function makeInkPipeline() {
  const store = new StrokeStore();
  const pipeline = new HandStrokePipeline({ store, size: () => ({ width: W, height: H }), eraser });
  return { store, pipeline };
}

export interface InkSample {
  /** Canvas px of the drawn point this frame, or null when no cursor. */
  out: { x: number; y: number } | null;
  /** True canvas px of the pinch point (mirrored, not rounded). */
  truth: { x: number; y: number };
  nowMs: number;
  frame: HandFrame;
}

/**
 * Runs a pinch along `path` (camera frame coords, per frame index) for `frames` frames.
 * Returns one sample per frame so the caller can compute jitter, lag and overshoot.
 */
export function runPinchPath(
  path: (t: number) => { x: number; y: number },
  frames: number,
  sigma: number,
  seed: number,
): InkSample[] {
  const { pipeline } = makeInkPipeline();
  const rand = seededRandom(seed);
  const samples: InkSample[] = [];
  for (let i = 0; i < frames; i++) {
    const nowMs = frameMs(i);
    const t = i / FPS;
    const p = path(t);
    const frame = pipeline.feed(noisyPinch(p.x, p.y, sigma, rand), nowMs);
    const out = frame.cursor ? { x: frame.cursor.x, y: frame.cursor.y } : null;
    samples.push({ out, truth: { x: (1 - p.x) * W, y: p.y * H }, nowMs, frame });
  }
  return samples;
}

export const std = (xs: number[]): number => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

import { describe, expect, it } from "vitest";
import { claheRgba } from "../../src/camera/clahe";
import { pixelLuma } from "../../src/camera/luma";

const W = 320;
const H = 180;

/** Deterministic PRNG so the synthetic frames are the same on every run. */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Gray RGBA frame whose luma is `value(x, y)`. */
function grayFrame(value: (x: number, y: number) => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = Math.round(value(x, y));
      const i = (y * W + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

function lumaPlane(rgba: Uint8ClampedArray): number[] {
  const out: number[] = [];
  for (let i = 0; i < rgba.length; i += 4) {
    out.push(pixelLuma(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!));
  }
  return out;
}

function stddev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

function range(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

/** Byte-by-byte equality; much faster than toEqual on large buffers. */
function sameBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Mean of (max - min) luma inside each 8x8 tile. Measures local contrast, which CLAHE targets. */
function meanTileSpan(plane: number[]): number {
  const tw = W / 8;
  const th = H / 8;
  let total = 0;
  for (let ty = 0; ty < 8; ty++) {
    for (let tx = 0; tx < 8; tx++) {
      let lo = 255;
      let hi = 0;
      for (let y = Math.floor(ty * th); y < Math.floor((ty + 1) * th); y++) {
        for (let x = Math.floor(tx * tw); x < Math.floor((tx + 1) * tw); x++) {
          const v = plane[y * W + x]!;
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
      total += hi - lo;
    }
  }
  return total / 64;
}

/** Dark, low-contrast scene: luma sits in 12..44 with a left-to-right ramp plus noise. */
function darkLowContrast(): Uint8ClampedArray {
  const rand = prng(7);
  return grayFrame((x) => 12 + (x / W) * 32 + (rand() - 0.5) * 4);
}

describe("claheRgba", () => {
  it("widens local contrast of a dark, low-contrast frame", () => {
    // CLAHE is local: the win is inside each tile, not in the global histogram.
    const src = darkLowContrast();
    const out = claheRgba(src, W, H);

    const inSpan = meanTileSpan(lumaPlane(src));
    const outSpan = meanTileSpan(lumaPlane(out));
    expect(outSpan).toBeGreaterThan(inSpan * 1.8);
    expect(range(lumaPlane(out))).toBeGreaterThan(range(lumaPlane(src)));
  });

  it("changes a normally exposed frame only a little", () => {
    // Full-range noise: each tile's histogram is already spread, so the clip limit rarely bites.
    const rand = prng(11);
    const src = grayFrame(() => rand() * 255);
    const out = claheRgba(src, W, H);

    let diff = 0;
    for (let i = 0; i < src.length; i += 4) diff += Math.abs(src[i]! - out[i]!);
    expect(diff / (W * H)).toBeLessThan(4);
  });

  it("keeps alpha unchanged and turns grey pixels into equal R, G and B", () => {
    const src = darkLowContrast();
    for (let i = 3; i < src.length; i += 4) src[i] = 200;
    const out = claheRgba(src, W, H);

    let alphaOk = true;
    let greyOk = true;
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] !== 200) alphaOk = false;
      if (out[i] !== out[i + 1] || out[i + 1] !== out[i + 2]) greyOk = false;
    }
    expect(alphaOk).toBe(true);
    expect(greyOk).toBe(true);
  });

  it("is deterministic: the same input gives the same bytes", () => {
    const a = claheRgba(darkLowContrast(), W, H);
    const b = claheRgba(darkLowContrast(), W, H);
    expect(sameBytes(a, b)).toBe(true);
  });

  it("writes to a separate buffer and leaves the source untouched by default", () => {
    const src = darkLowContrast();
    const copy = new Uint8ClampedArray(src);
    const out = claheRgba(src, W, H);
    expect(out).not.toBe(src);
    expect(sameBytes(src, copy)).toBe(true);
  });

  it("can run in place and gives the same result as the copying path", () => {
    const src = darkLowContrast();
    const expected = claheRgba(src, W, H);
    const inPlace = new Uint8ClampedArray(src);
    const returned = claheRgba(inPlace, W, H, {}, inPlace);
    expect(returned).toBe(inPlace);
    expect(sameBytes(inPlace, expected)).toBe(true);
  });

  it("handles a single flat tile grid and a frame that is one colour", () => {
    const flat = grayFrame(() => 90);
    const out = claheRgba(flat, W, H, { tilesX: 1, tilesY: 1 });
    expect(out.length).toBe(flat.length);
    let worst = 0;
    for (let i = 0; i < out.length; i += 4) worst = Math.max(worst, Math.abs(out[i]! - 90));
    expect(worst).toBeLessThanOrEqual(2);
  });

  it("does not throw on an empty frame", () => {
    expect(claheRgba(new Uint8ClampedArray(0), 0, 0).length).toBe(0);
  });
});

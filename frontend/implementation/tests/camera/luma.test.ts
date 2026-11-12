import { describe, expect, it } from "vitest";
import { meanLuma, pixelLuma } from "../../src/camera/luma";

function solid(width: number, height: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return data;
}

describe("pixelLuma", () => {
  it("maps black to 0 and white to 255", () => {
    expect(pixelLuma(0, 0, 0)).toBe(0);
    expect(pixelLuma(255, 255, 255)).toBe(255);
  });

  it("weights green most and blue least, like human brightness perception", () => {
    const red = pixelLuma(255, 0, 0);
    const green = pixelLuma(0, 255, 0);
    const blue = pixelLuma(0, 0, 255);
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });
});

describe("meanLuma", () => {
  it("returns 0 for a black frame and 1 for a white frame", () => {
    expect(meanLuma(solid(40, 30, 0, 0, 0), 40, 30)).toBe(0);
    expect(meanLuma(solid(40, 30, 255, 255, 255), 40, 30)).toBeCloseTo(1, 2);
  });

  it("returns about 0.5 for a half-black, half-white frame", () => {
    const w = 40;
    const h = 30;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = x < w / 2 ? 0 : 255;
        const i = (y * w + x) * 4;
        data.set([v, v, v, 255], i);
      }
    }
    expect(meanLuma(data, w, h, 1)).toBeCloseTo(0.5, 1);
  });

  it("gives the same answer on a sub-sampled grid for a uniform frame", () => {
    const data = solid(320, 180, 60, 90, 30);
    expect(meanLuma(data, 320, 180, 4)).toBeCloseTo(meanLuma(data, 320, 180, 1), 6);
  });

  it("returns 0 for an empty buffer instead of throwing", () => {
    expect(meanLuma(new Uint8ClampedArray(0), 0, 0)).toBe(0);
  });
});

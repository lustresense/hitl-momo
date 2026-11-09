import { describe, expect, it } from "vitest";
import type { StrokePoint } from "@/src/domain/types";
import { fitInkToBox } from "@/src/game/sketch-renderer";

const pts = (...xy: Array<[number, number]>): StrokePoint[] => xy.map(([x, y]) => ({ x, y }));

/** Small seeded PRNG so the property check is deterministic and never flaky. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("fitInkToBox: student ink becomes box-sized polylines", () => {
  it("returns no marks for missing, empty or invalid ink", () => {
    const box = { w: 100, h: 20 };
    expect(fitInkToBox(null, box)).toEqual([]);
    expect(fitInkToBox([], box)).toEqual([]);
    expect(fitInkToBox([[], []], box)).toEqual([]);
    expect(fitInkToBox([pts([NaN, 0.5])], box)).toEqual([]);
  });

  it("keeps a square square and centres it horizontally (exact values)", () => {
    const square = pts([0, 0], [1, 0], [1, 1], [0, 1], [0, 0]);
    expect(fitInkToBox([square], { w: 130, h: 20 }, { inset: 2 })).toEqual([
      [
        { x: 57, y: 2 },
        { x: 73, y: 2 },
        { x: 73, y: 18 },
        { x: 57, y: 18 },
        { x: 57, y: 2 },
      ],
    ]);
  });

  it("fills the width of a 2:1 drawing in a 100x60 box and centres it vertically (exact values)", () => {
    const wide = pts([0, 0], [1, 0], [1, 0.5], [0, 0.5], [0, 0]);
    expect(fitInkToBox([wide], { w: 100, h: 60 }, { inset: 2 })).toEqual([
      [
        { x: 2, y: 6 },
        { x: 98, y: 6 },
        { x: 98, y: 54 },
        { x: 2, y: 54 },
        { x: 2, y: 6 },
      ],
    ]);
  });

  it("keeps a straight horizontal line full length and centred (exact values)", () => {
    expect(fitInkToBox([pts([0, 0.5], [1, 0.5])], { w: 100, h: 20 }, { inset: 2 })).toEqual([
      [
        { x: 2, y: 10 },
        { x: 98, y: 10 },
      ],
    ]);
  });

  it("puts a lone dot or a zero-size scribble at the centre of the box instead of blowing it up", () => {
    expect(fitInkToBox([pts([0.5, 0.5])], { w: 130, h: 20 }, { inset: 2 })).toEqual([[{ x: 65, y: 10 }]]);
    expect(fitInkToBox([pts([0.2, 0.2], [0.2, 0.2])], { w: 130, h: 20 }, { inset: 2 })).toEqual([
      [
        { x: 65, y: 10 },
        { x: 65, y: 10 },
      ],
    ]);
  });

  it("never places ink outside the inset box and keeps the drawing's proportions (seeded property check)", () => {
    const rnd = seeded(7);
    const escapes: string[] = [];
    const ratioErrors: string[] = [];
    for (let trial = 0; trial < 300; trial++) {
      const strokes = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () =>
        Array.from({ length: 1 + Math.floor(rnd() * 10) }, () => ({ x: rnd(), y: rnd() })),
      );
      const inputPoints = strokes.flat();
      const inSpanX = Math.max(...inputPoints.map((p) => p.x)) - Math.min(...inputPoints.map((p) => p.x));
      const inSpanY = Math.max(...inputPoints.map((p) => p.y)) - Math.min(...inputPoints.map((p) => p.y));

      for (const box of [
        { w: 131, h: 20 },
        { w: 220, h: 96 },
      ]) {
        const inset = 2.5;
        const marks = fitInkToBox(strokes, box, { inset });
        const out = marks.flat();
        for (const p of out) {
          const inside =
            p.x >= inset - 1e-9 && p.x <= box.w - inset + 1e-9 && p.y >= inset - 1e-9 && p.y <= box.h - inset + 1e-9;
          if (!inside) escapes.push(`trial ${trial} box ${box.w}x${box.h}: (${p.x}, ${p.y})`);
        }
        const outSpanX = Math.max(...out.map((p) => p.x)) - Math.min(...out.map((p) => p.x));
        const outSpanY = Math.max(...out.map((p) => p.y)) - Math.min(...out.map((p) => p.y));
        if (inSpanX > 1e-3 && inSpanY > 1e-3) {
          const wanted = inSpanX / inSpanY;
          const got = outSpanX / outSpanY;
          if (Math.abs(got - wanted) > 1e-6 * wanted) ratioErrors.push(`trial ${trial}: ${got} vs ${wanted}`);
        }
      }
    }
    expect(escapes).toEqual([]);
    expect(ratioErrors).toEqual([]);
  });
});

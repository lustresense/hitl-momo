import { describe, expect, it } from "vitest";
import {
  NIB_BUFFER_MS,
  NIB_LANDMARK_INDEX,
  NIB_ONE_EURO,
  NIB_ROLLBACK_MS,
  createNibFilter,
  trimTail,
  type TimedPt,
} from "@/src/nui/sources/hand";

describe("nib-filter constants and trimTail", () => {
  it("uses landmark 8, dedicated ink One Euro params, and 200ms rollback/tail trim", () => {
    expect(NIB_LANDMARK_INDEX).toBe(8);
    expect(NIB_ONE_EURO).toEqual({ minCutoff: 1.5, beta: 0.03, dCutoff: 1.0, maxGapMs: 500 });
    expect(NIB_ROLLBACK_MS).toBe(200);
    expect(NIB_BUFFER_MS).toBe(600);
  });

  it("trims the release tail (last 200ms) while preserving at least the first point", () => {
    const stroke: TimedPt[] = [
      { x: 10, y: 10, t: 100 },
      { x: 20, y: 10, t: 200 },
      { x: 30, y: 10, t: 300 },
      { x: 35, y: 25, t: 400 }, // release drift
      { x: 50, y: 60, t: 500 }, // release flick tail
    ];

    expect(trimTail(stroke, 500)).toEqual([
      { x: 10, y: 10, t: 100 },
      { x: 20, y: 10, t: 200 },
      { x: 30, y: 10, t: 300 },
    ]);

    // Custom trim window (150ms)
    expect(trimTail(stroke, 500, 150)).toHaveLength(3);
    expect(trimTail(stroke, 500, 50)).toHaveLength(4);

    // Very short dot stroke: keeps first point instead of vanishing
    const dot: TimedPt[] = [
      { x: 42, y: 84, t: 450 },
      { x: 44, y: 88, t: 490 },
    ];
    expect(trimTail(dot, 500)).toEqual([{ x: 42, y: 84, t: 450 }]);

    // Empty stroke returns empty
    expect(trimTail([], 500)).toEqual([]);
  });
});

describe("createNibFilter", () => {
  it("smooths fingertip step without overshoot, seeds stroke with 200ms rollback, and trims tail on end", () => {
    const nib = createNibFilter();
    expect(nib.begin(0)).toEqual([]);

    // Hover & aim at (100, 100) from t=0..300, then drift during pinch-in t=350..500
    nib.update({ x: 100, y: 100 }, 0);
    nib.update({ x: 100, y: 100 }, 100);
    nib.update({ x: 100, y: 100 }, 200);
    nib.update({ x: 100, y: 100 }, 300);
    nib.update({ x: 102, y: 105 }, 400);
    nib.update({ x: 105, y: 115 }, 500);

    // begin(500) returns points in [300, 500] so stroke starts at aim point (100, 100)
    const seed = nib.begin(500);
    expect(seed.map((p) => p.t)).toEqual([300, 400, 500]);
    expect(seed[0]?.x).toBeCloseTo(100, 4);
    expect(seed[0]?.y).toBeCloseTo(100, 4);

    // Mutating returned seed does not corrupt internal buffer
    seed[0]!.x = -999;
    expect(nib.begin(500)[0]?.x).toBeCloseTo(100, 4);

    // Draw step to x=300 without overshoot, then release drift at t=700..850
    const stroke: TimedPt[] = [...nib.begin(500)];
    let prevX = stroke[stroke.length - 1]!.x;
    for (const t of [550, 600, 650, 700, 750, 800, 850]) {
      const target = t <= 650 ? { x: 300, y: 100 } : { x: 340, y: 180 };
      const pt = nib.update(target, t);
      if (t <= 650) {
        expect(pt.x).toBeGreaterThanOrEqual(prevX);
        expect(pt.x).toBeLessThanOrEqual(300);
        prevX = pt.x;
      }
      stroke.push(pt);
    }

    // end(stroke, 850) trims points after 650ms (dropping the release tail!)
    const finalStroke = nib.end(stroke, 850);
    expect(finalStroke[finalStroke.length - 1]?.t).toBe(650);
    expect(finalStroke.every((p) => p.t <= 650)).toBe(true);

    // Optional custom trimMs supported on end()
    expect(nib.end(stroke, 850, 100)[nib.end(stroke, 850, 100).length - 1]?.t).toBe(750);
  });

  it("prunes history beyond 600ms, falls back to latest point if window empty, and resets cleanly", () => {
    const nib = createNibFilter();
    for (let t = 0; t <= 1000; t += 100) {
      nib.update({ x: t, y: 50 }, t);
    }
    // Querying way past last sample falls back to most recent point (t=1000)
    const fallback = nib.begin(1500);
    expect(fallback).toHaveLength(1);
    expect(fallback[0]?.t).toBe(1000);

    nib.reset();
    expect(nib.begin(1500)).toEqual([]);
    const fresh = nib.update({ x: 10, y: 20 }, 2000);
    expect(fresh).toEqual({ x: 10, y: 20, t: 2000 });
  });
});

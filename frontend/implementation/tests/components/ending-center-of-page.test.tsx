import { describe, expect, it } from "vitest";
import { strokesToPath } from "@/src/components/ending/ending-types";

// The old single-track closing (page, alive, overview, epilog, choice) is replaced by the portal flow; see
// ending-portal-flow, ending-recap, ending-quiz-flow. This file keeps the stroke fitting used by the recap thumbnail.
const sq = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]];

describe("recap thumbnail fitting", () => {
  it("fits the student's strokes into the card", () => {
    const d = strokesToPath(sq, 120, 80);
    expect(d.startsWith("M")).toBe(true);
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.max(...nums)).toBeLessThanOrEqual(120);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
    expect(strokesToPath([], 120, 80)).toBe("");
  });
});

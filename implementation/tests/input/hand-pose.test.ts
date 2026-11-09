import { describe, expect, it } from "vitest";
import { classifyHandPose, drawingCommandFor, isFist, isSplitPalm, isThumbUp, isTwoFingers, type HandPose } from "@/src/input/hand-gesture";
import type { Landmark } from "@/src/input/types";

/** Upright hand: wrist (0.5,0.8), middle MCP (0.5,0.6), span 0.2. Fingers at x columns, PIP at y 0.5. */
const COLS = [0.42, 0.48, 0.54, 0.6];
function pose(fingers: ("up" | "down")[], opts: { thumb?: "tucked" | "up" | "out" | "pinch"; xs?: number[] } = {}): Landmark[] {
  const h: Landmark[] = new Array(21).fill(null).map(() => ({ x: 0.5, y: 0.6 }));
  h[0] = { x: 0.5, y: 0.8 };
  h[9] = { x: 0.5, y: 0.6 };
  const xs = opts.xs ?? COLS;
  [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]].forEach(([mcp, pip, dip, tip], i) => {
    const x = xs[i]!;
    h[mcp!] = { x: COLS[i]!, y: 0.6 };
    h[pip!] = { x: COLS[i]!, y: 0.52 };
    if (fingers[i] === "up") { h[dip!] = { x, y: 0.42 }; h[tip!] = { x, y: 0.34 }; }
    else { h[dip!] = { x: COLS[i]!, y: 0.6 }; h[tip!] = { x: COLS[i]!, y: 0.66 }; }
  });
  h[2] = { x: 0.38, y: 0.66 };
  const thumb = opts.thumb ?? "tucked";
  h[4] = thumb === "up" ? { x: 0.38, y: 0.4 } : thumb === "out" ? { x: 0.26, y: 0.62 } : thumb === "pinch" ? { ...h[8]! } : { x: 0.46, y: 0.64 };
  return h;
}

const cases: [string, Landmark[], HandPose][] = [
  ["thumbs-up", pose(["down", "down", "down", "down"], { thumb: "up" }), "thumb-up"],
  ["fist", pose(["down", "down", "down", "down"]), "fist"],
  ["pinch", pose(["up", "down", "down", "down"], { thumb: "pinch" }), "pinch"],
  ["two fingers", pose(["up", "up", "down", "down"], { thumb: "out" }), "two-fingers"],
  ["split palm", pose(["up", "up", "up", "up"], { thumb: "out", xs: [0.38, 0.42, 0.62, 0.66] }), "split-palm"],
  ["open palm", pose(["up", "up", "up", "up"], { thumb: "out", xs: [0.36, 0.46, 0.56, 0.66] }), "open-palm"],
];

describe("R12 drawing poses are mutually exclusive", () => {
  for (const [name, lm, expected] of cases) {
    it(`${name} -> ${expected}`, () => {
      expect(classifyHandPose(lm)).toBe(expected);
      expect(isFist(lm)).toBe(expected === "fist");
      expect(isTwoFingers(lm)).toBe(expected === "two-fingers");
      expect(isSplitPalm(lm)).toBe(expected === "split-palm");
      expect(isThumbUp(lm)).toBe(expected === "thumb-up");
    });
  }
  it("mapping: pinch draw, fist erase, two fingers undo, split palm redo", () => {
    expect(drawingCommandFor("pinch")).toBe("draw");
    expect(drawingCommandFor("fist")).toBe("erase");
    expect(drawingCommandFor("two-fingers")).toBe("undo");
    expect(drawingCommandFor("split-palm")).toBe("redo");
    expect(drawingCommandFor("open-palm")).toBeNull();
    expect(drawingCommandFor("thumb-up")).toBeNull();
  });
  it("missing landmarks -> none", () => {
    expect(classifyHandPose(undefined)).toBe("none");
    expect(classifyHandPose(pose(["up", "up", "up", "up"]).slice(0, 12))).toBe("none");
  });
});

import { gateFrameByPose } from "@/src/input/mediapipe-input";
import { evaluateGesture } from "@/src/input/hand-gesture";
describe("gateFrameByPose (R12 wiring)", () => {
  it("reports the pose and blocks ink while a command pose is shown", () => {
    const seen: string[] = [];
    const fistLm = pose(["down", "down", "down", "down"], { thumb: "pinch" });
    const raw = evaluateGesture(fistLm);
    expect(raw.state === "tracking" && raw.pinched).toBe(true);
    const gated = gateFrameByPose(raw, fistLm, 5, (p) => seen.push(p)).frame;
    expect(gated.state === "tracking" && gated.pinched).toBe(false);
    const pinchLm = pose(["up", "down", "down", "down"], { thumb: "pinch" });
    const kept = gateFrameByPose(evaluateGesture(pinchLm), pinchLm, 6, (p) => seen.push(p)).frame;
    expect(kept.state === "tracking" && kept.pinched).toBe(true);
    gateFrameByPose(evaluateGesture(undefined), undefined, 7, (p) => seen.push(p));
    expect(seen).toEqual(["fist", "pinch", "none"]);
  });
});

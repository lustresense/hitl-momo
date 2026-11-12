import { describe, expect, it } from "vitest";
import { classifyHandPose, countExtendedFingers, type HandPose } from "@/src/input/hand-gesture";
import type { Landmark } from "@/src/input/types";

/**
 * Upright synthetic hand written out by hand (not reusing the production geometry):
 * wrist (0.5, 0.8), middle knuckle (0.5, 0.6), hand span 0.2. Each finger: knuckle column in COLS, PIP at y 0.52.
 * "up" = straight (tip at y 0.34), "down" = folded (tip back at y 0.66).
 * Thumb: "tucked" lies across the palm, "out" points sideways, "up" is raised above its base.
 */
const COLS = [0.42, 0.48, 0.54, 0.6];
type Thumb = "tucked" | "up" | "out";

function hand(fingers: ("up" | "down")[], thumb: Thumb = "tucked", xs: number[] = COLS): Landmark[] {
  const h: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.6 }));
  h[0] = { x: 0.5, y: 0.8 };
  h[9] = { x: 0.5, y: 0.6 };
  const chains = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
  chains.forEach(([mcp, pip, dip, tip], i) => {
    h[mcp!] = { x: COLS[i]!, y: 0.6 };
    h[pip!] = { x: COLS[i]!, y: 0.52 };
    if (fingers[i] === "up") {
      h[dip!] = { x: xs[i]!, y: 0.42 };
      h[tip!] = { x: xs[i]!, y: 0.34 };
    } else {
      h[dip!] = { x: COLS[i]!, y: 0.6 };
      h[tip!] = { x: COLS[i]!, y: 0.66 };
    }
  });
  h[2] = { x: 0.38, y: 0.66 };
  h[3] = { x: 0.32, y: 0.64 };
  h[4] = thumb === "up" ? { x: 0.38, y: 0.4 } : thumb === "out" ? { x: 0.26, y: 0.62 } : { x: 0.46, y: 0.64 };
  if (thumb === "tucked") h[3] = { x: 0.42, y: 0.65 };
  return h;
}

describe("countExtendedFingers (0..5, thumb by its own rule)", () => {
  it("a fist counts 0", () => {
    expect(countExtendedFingers(hand(["down", "down", "down", "down"]))).toBe(0);
  });

  it("one straight index finger counts 1 with the thumb tucked", () => {
    expect(countExtendedFingers(hand(["up", "down", "down", "down"]))).toBe(1);
  });

  it("two and three straight fingers count 2 and 3", () => {
    expect(countExtendedFingers(hand(["up", "up", "down", "down"]))).toBe(2);
    expect(countExtendedFingers(hand(["up", "up", "up", "down"]))).toBe(3);
  });

  it("a thumb pointing out counts as one finger; a tucked thumb does not", () => {
    expect(countExtendedFingers(hand(["down", "down", "down", "down"], "out"))).toBe(1);
    expect(countExtendedFingers(hand(["down", "down", "down", "down"], "tucked"))).toBe(0);
  });

  it("a raised thumb (thumbs-up shape) counts as one finger", () => {
    expect(countExtendedFingers(hand(["down", "down", "down", "down"], "up"))).toBe(1);
  });

  it("an open hand with the thumb out counts 5", () => {
    expect(countExtendedFingers(hand(["up", "up", "up", "up"], "out", [0.36, 0.46, 0.56, 0.66]))).toBe(5);
  });

  it("a finger that is only half bent is not counted", () => {
    const h = hand(["down", "down", "down", "down"]);
    // Index tip halfway between the PIP and the fully folded tip: beyond 1.0x but under 1.1x of the PIP distance.
    h[8] = { x: 0.42, y: 0.5 };
    expect(countExtendedFingers(h)).toBe(0);
  });

  it("missing or short landmarks count 0", () => {
    expect(countExtendedFingers(undefined)).toBe(0);
    expect(countExtendedFingers(hand(["up", "up", "up", "up"]).slice(0, 12))).toBe(0);
  });
});

describe("one-finger and three-fingers poses", () => {
  it("index only (thumb tucked) -> one-finger", () => {
    expect(classifyHandPose(hand(["up", "down", "down", "down"]))).toBe("one-finger");
  });

  it("index, middle and ring straight, pinky folded -> three-fingers", () => {
    expect(classifyHandPose(hand(["up", "up", "up", "down"]))).toBe("three-fingers");
  });

  it("a thumb pointing out with only the index up is not a one-finger pose (the count is 2)", () => {
    const pose = classifyHandPose(hand(["up", "down", "down", "down"], "out"));
    expect(pose).not.toBe("one-finger");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getHandGestureState,
  publishHandForTest,
  resetThumbTrackerForTest,
  simulatePinch,
  simulateThumb,
  subscribeHandGesture,
  type HandGestureState,
} from "@/src/camera/thumb-tracker";
import type { Landmark } from "@/src/input/types";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

/** Upright hand, span 0.2; `straight` lists the straight fingers (index, middle, ring, pinky), thumb tucked. */
function hand(straight: boolean[]): Landmark[] {
  const h: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.6 }));
  h[0] = { x: 0.5, y: 0.8 };
  h[9] = { x: 0.5, y: 0.6 };
  const cols = [0.42, 0.48, 0.54, 0.6];
  [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]].forEach(([mcp, pip, dip, tip], i) => {
    h[mcp!] = { x: cols[i]!, y: 0.6 };
    h[pip!] = { x: cols[i]!, y: 0.52 };
    h[dip!] = straight[i] ? { x: cols[i]!, y: 0.42 } : { x: cols[i]!, y: 0.6 };
    h[tip!] = straight[i] ? { x: cols[i]!, y: 0.34 } : { x: cols[i]!, y: 0.66 };
  });
  h[2] = { x: 0.38, y: 0.66 };
  h[3] = { x: 0.42, y: 0.65 };
  h[4] = { x: 0.46, y: 0.64 };
  return h;
}
const ONE = hand([true, false, false, false]);
const TWO = hand([true, true, false, false]);
const FIST = hand([false, false, false, false]);

describe("thumb tracker publishes a voted pose and finger count", () => {
  beforeEach(() => resetThumbTrackerForTest());
  afterEach(() => resetThumbTrackerForTest());

  it("no hand: pose none and zero fingers", () => {
    publishHandForTest(undefined);
    expect(getHandGestureState()).toMatchObject({ pose: "none", fingerCount: 0, handVisible: false });
  });

  it("a pose appears after three agreeing frames, not on the first one", () => {
    publishHandForTest(ONE);
    expect(getHandGestureState()).toMatchObject({ pose: "none", fingerCount: 0 });
    publishHandForTest(ONE);
    publishHandForTest(ONE);
    expect(getHandGestureState()).toMatchObject({ pose: "one-finger", fingerCount: 1 });
  });

  it("one noisy frame does not change a stable pose", () => {
    for (let i = 0; i < 4; i++) publishHandForTest(TWO);
    publishHandForTest(FIST);
    expect(getHandGestureState()).toMatchObject({ pose: "two-fingers", fingerCount: 2 });
  });

  it("listeners hear a change of the pose or the finger count", () => {
    const seen: HandGestureState[] = [];
    const unsub = subscribeHandGesture((s) => seen.push(s));
    for (let i = 0; i < 3; i++) publishHandForTest(ONE);
    unsub();
    expect(seen.at(-1)).toMatchObject({ pose: "one-finger", fingerCount: 1 });
  });

  it("the thumbs-up test hook forces the pose to thumb-up", () => {
    simulateThumb(true);
    expect(getHandGestureState()).toMatchObject({ thumbUp: true, pose: "thumb-up" });
    simulateThumb(null);
  });

  it("the pinch test hook forces the pose to pinch and releases back to the real pose", () => {
    simulatePinch(true);
    expect(getHandGestureState()).toMatchObject({ pinch: true, pose: "pinch" });
    simulatePinch(false);
    expect(getHandGestureState()).toMatchObject({ pinch: false, pose: "none" });
    simulatePinch(null);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  gestureSnapshot,
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

/** 21 points at (0.5, 0.6). Each helper moves only the joints its pose needs. */
function base(): Landmark[] {
  return Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.6 }));
}

/** Hand span (wrist to middle MCP) is 0.3. Thumb tip (4) sits on the index tip (8): a pinch. */
function pinchHand(): Landmark[] {
  const h = base();
  h[0] = { x: 0.5, y: 0.9 };
  h[9] = { x: 0.5, y: 0.6 };
  h[2] = { x: 0.44, y: 0.58 }; // thumb MCP low: not a thumbs-up
  h[4] = { x: 0.46, y: 0.5 };
  h[6] = { x: 0.47, y: 0.6 };
  h[8] = { x: 0.47, y: 0.5 };
  return h;
}

/** Fingertips curled back toward the wrist: a fist. */
function fistHand(): Landmark[] {
  const h = base();
  h[0] = { x: 0.5, y: 0.9 };
  h[9] = { x: 0.5, y: 0.6 };
  for (const [pip, tip, x] of [[6, 8, 0.45], [10, 12, 0.5], [14, 16, 0.55], [18, 20, 0.6]] as const) {
    h[pip] = { x, y: 0.6 };
    h[tip] = { x, y: 0.8 };
  }
  h[2] = { x: 0.4, y: 0.8 };
  h[4] = { x: 0.4, y: 0.8 };
  return h;
}

/** The fist with the thumb raised high above its base. */
function thumbsUpHand(): Landmark[] {
  const h = fistHand();
  h[2] = { x: 0.4, y: 0.6 };
  h[4] = { x: 0.4, y: 0.4 };
  return h;
}

/** Index and thumb far apart: an open hand. */
function openHand(): Landmark[] {
  const h = base();
  h[0] = { x: 0.5, y: 0.9 };
  h[9] = { x: 0.5, y: 0.6 };
  h[4] = { x: 0.3, y: 0.6 };
  h[8] = { x: 0.6, y: 0.3 };
  return h;
}

describe("thumb tracker hand state (pinch and cursor)", () => {
  beforeEach(() => resetThumbTrackerForTest());
  afterEach(() => resetThumbTrackerForTest());

  it("no hand: nothing visible, no pinch, no cursor", () => {
    expect(gestureSnapshot(undefined)).toEqual({ handVisible: false, thumbUp: false, pinch: false, cursor: null });
  });

  it("a pinch reports pinch and the mirrored index tip as the cursor", () => {
    const s = gestureSnapshot(pinchHand());
    expect(s.handVisible).toBe(true);
    expect(s.pinch).toBe(true);
    expect(s.thumbUp).toBe(false);
    // The preview is mirrored, so x is 1 - 0.47.
    expect(s.cursor?.x).toBeCloseTo(0.53);
    expect(s.cursor?.y).toBeCloseTo(0.5);
  });

  it("a pinch already held stays a pinch up to the exit threshold, so the ring does not flicker at the edge", () => {
    // Thumb-index gap at 0.48 of the hand span: above the enter threshold (0.42), below the exit one (0.55).
    const edge = pinchHand();
    edge[4] = { x: 0.326, y: 0.5 };
    expect(gestureSnapshot(edge).pinch).toBe(false);
    expect(gestureSnapshot(edge, true).pinch).toBe(true);
    expect(gestureSnapshot(pinchHand(), false).pinch).toBe(true);
  });

  it("an open hand is visible but never a pinch", () => {
    expect(gestureSnapshot(openHand())).toMatchObject({ handVisible: true, thumbUp: false, pinch: false });
  });

  it("a fist is not a pinch, and a thumbs-up is not a pinch either", () => {
    expect(gestureSnapshot(fistHand()).pinch).toBe(false);
    const up = gestureSnapshot(thumbsUpHand());
    expect(up.thumbUp).toBe(true);
    expect(up.pinch).toBe(false);
  });

  it("a simulated thumb keeps the thumb state shape and never reports a pinch", () => {
    simulateThumb(true);
    expect(getHandGestureState()).toMatchObject({ ready: true, handVisible: true, thumbUp: true, pinch: false });
  });

  it("the simulated pinch and the simulated thumb are independent overrides", () => {
    simulatePinch(true);
    expect(getHandGestureState().pinch).toBe(true);
    simulateThumb(true);
    expect(getHandGestureState()).toMatchObject({ ready: true, handVisible: true, thumbUp: true, pinch: true });
    simulatePinch(null);
    expect(getHandGestureState()).toMatchObject({ thumbUp: true, pinch: false });
  });

  it("a moving fingertip reaches the listeners (the dot and the dwell rings follow it); an identical frame does not", () => {
    const seen: HandGestureState[] = [];
    subscribeHandGesture((s) => seen.push(s));
    const start = seen.length; // subscribing replays the current state once
    publishHandForTest(pinchHand());
    expect(seen).toHaveLength(start + 1);
    expect(seen.at(-1)!.cursor?.x).toBeCloseTo(0.53);

    const moved = pinchHand().map((p) => ({ x: p.x - 0.1, y: p.y }));
    publishHandForTest(moved);
    expect(seen).toHaveLength(start + 2);
    expect(seen.at(-1)!.cursor?.x).toBeCloseTo(0.63);

    // The voted pose and finger count settle on the third agreeing frame: one more notice, then silence.
    publishHandForTest(moved);
    expect(seen).toHaveLength(start + 3);
    publishHandForTest(moved);
    expect(seen).toHaveLength(start + 3);
  });

  it("listeners hear a pinch change once, not on every repeated value", () => {
    const seen: HandGestureState[] = [];
    subscribeHandGesture((s) => seen.push(s));
    const before = seen.length;
    simulatePinch(true);
    simulatePinch(true);
    simulatePinch(false);
    expect(seen.length - before).toBe(2);
    expect(seen.at(-1)?.pinch).toBe(false);
  });
});

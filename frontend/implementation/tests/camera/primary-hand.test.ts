import { describe, expect, it } from "vitest";
import {
  LOCK_LOST_MS,
  MAX_JUMP,
  MIN_HAND_SIZE,
  handSize,
  pickPrimaryHand,
  type PrimaryHandState,
} from "@/src/camera/primary-hand";
import type { Landmark } from "@/src/input/types";

/** A 21-point hand: wrist at (cx, cy + size/2), the other points spread over a square of side `size`. */
function hand(cx: number, cy: number, size: number): Landmark[] {
  const pts: Landmark[] = [];
  for (let i = 0; i < 21; i++) {
    pts.push({ x: cx - size / 2 + (size * (i % 5)) / 4, y: cy - size / 2 + (size * Math.floor(i / 5)) / 4 });
  }
  pts[0] = { x: cx, y: cy + size / 2 };
  return pts;
}

const NEAR = { cx: 0.5, cy: 0.5, size: 0.4 }; // the player, close to the camera
const FAR = { cx: 0.1, cy: 0.2, size: 0.05 }; // a person far away: below MIN_HAND_SIZE
const STRANGER = { cx: 0.2, cy: 0.5, size: 0.3 }; // a second, valid hand

describe("primary-hand constants", () => {
  it("exports the starting values from the wave brief", () => {
    expect(MIN_HAND_SIZE).toBe(0.08);
    expect(MAX_JUMP).toBe(0.18);
    expect(LOCK_LOST_MS).toBe(600);
  });
});

describe("handSize", () => {
  it("is the larger side of the bounding box of all 21 points", () => {
    expect(handSize(hand(0.5, 0.5, 0.3))).toBeCloseTo(0.3, 6);
  });
});

describe("pickPrimaryHand", () => {
  it("returns no index and no lock without hands", () => {
    expect(pickPrimaryHand([], null, 0)).toEqual({ index: null, state: null });
  });

  it("ignores a hand smaller than MIN_HAND_SIZE (a far-away person)", () => {
    const r = pickPrimaryHand([hand(FAR.cx, FAR.cy, FAR.size)], null, 0);
    expect(r.index).toBeNull();
    expect(r.state).toBeNull();
  });

  it("picks the near (large) hand over a small far hand", () => {
    const r = pickPrimaryHand([hand(FAR.cx, FAR.cy, FAR.size), hand(NEAR.cx, NEAR.cy, NEAR.size)], null, 0);
    expect(r.index).toBe(1);
    expect(r.state?.wrist).toEqual({ x: NEAR.cx, y: NEAR.cy + NEAR.size / 2 });
  });

  it("with no lock, takes the largest of several valid hands", () => {
    const r = pickPrimaryHand([hand(STRANGER.cx, STRANGER.cy, STRANGER.size), hand(NEAR.cx, NEAR.cy, NEAR.size)], null, 0);
    expect(r.index).toBe(1);
  });

  it("keeps the locked hand when a second, larger hand enters the frame", () => {
    const first = pickPrimaryHand([hand(NEAR.cx, NEAR.cy, NEAR.size)], null, 0);
    const locked: PrimaryHandState = first.state!;
    // The player moves a little; a bigger stranger appears on the left.
    const bigStranger = hand(0.1, 0.5, 0.5);
    const r = pickPrimaryHand([bigStranger, hand(NEAR.cx + 0.02, NEAR.cy, NEAR.size)], locked, 100);
    expect(r.index).toBe(1);
    expect(r.state?.lastSeenMs).toBe(100);
  });

  it("a fast wave is not lost: a lone hand of the same size beyond MAX_JUMP is still the player", () => {
    // One frame may move the wrist further than MAX_JUMP during a quick sweep; a lone hand of the player's size is followed.
    const locked: PrimaryHandState = { wrist: { x: NEAR.cx, y: NEAR.cy + NEAR.size / 2 }, lastSeenMs: 0, size: NEAR.size };
    const r = pickPrimaryHand([hand(0.1, 0.5, NEAR.size * 1.1)], locked, 200);
    expect(r.index).toBe(0);
    expect(r.state?.lastSeenMs).toBe(200);
  });

  it("a bystander cannot steal the lock while the player's hand is briefly missing", () => {
    // Player's hand drops for a frame (blur); a differently sized hand of someone else is in view.
    const locked: PrimaryHandState = { wrist: { x: NEAR.cx, y: NEAR.cy + NEAR.size / 2 }, lastSeenMs: 0, size: NEAR.size };
    const r = pickPrimaryHand([hand(STRANGER.cx, STRANGER.cy, 0.2)], locked, 100);
    expect(r.index).toBeNull();
    expect(r.state).toEqual(locked);
  });

  it("with two unmatched hands during the gap, neither takes over", () => {
    const locked: PrimaryHandState = { wrist: { x: 0.1, y: 0.5 }, lastSeenMs: 0, size: 0.3 };
    const r = pickPrimaryHand([hand(0.5, 0.5, 0.3), hand(0.9, 0.5, 0.3)], locked, 50);
    expect(r.index).toBeNull();
    expect(r.state).toEqual(locked);
  });

  it("holds the lock with no index while no hand is visible, and drops it after LOCK_LOST_MS", () => {
    const locked: PrimaryHandState = { wrist: { x: NEAR.cx, y: NEAR.cy + NEAR.size / 2 }, lastSeenMs: 0 };
    expect(pickPrimaryHand([], locked, 200)).toEqual({ index: null, state: locked });
    expect(pickPrimaryHand([], locked, LOCK_LOST_MS)).toEqual({ index: null, state: locked });
  });

  it("releases the lock after LOCK_LOST_MS without the locked hand, then takes the next hand", () => {
    const locked: PrimaryHandState = { wrist: { x: NEAR.cx, y: NEAR.cy + NEAR.size / 2 }, lastSeenMs: 0 };
    const stranger = hand(0.2, 0.5, 0.3);
    const after = pickPrimaryHand([stranger], locked, LOCK_LOST_MS + 1);
    expect(after.index).toBe(0);
    expect(after.state?.lastSeenMs).toBe(LOCK_LOST_MS + 1);
  });

  it("drops the lock to null when the gap is over and no hand is visible", () => {
    const locked: PrimaryHandState = { wrist: { x: NEAR.cx, y: NEAR.cy + NEAR.size / 2 }, lastSeenMs: 0 };
    const r = pickPrimaryHand([], locked, LOCK_LOST_MS + 1);
    expect(r).toEqual({ index: null, state: null });
  });

  it("an expired lock does not match: after LOCK_LOST_MS the old wrist is no longer the player", () => {
    const locked: PrimaryHandState = { wrist: { x: 0.5, y: 0.7 }, lastSeenMs: 0 };
    const big = hand(0.1, 0.5, 0.5); // larger, far from the old wrist
    const same = hand(0.5, 0.5, 0.2); // smaller, exactly on the old wrist
    expect(pickPrimaryHand([big, same], locked, 100).index).toBe(1);
    expect(pickPrimaryHand([big, same], locked, LOCK_LOST_MS + 1).index).toBe(0);
  });

  it("a wrist within MAX_JUMP is the same hand; a farther one is a new lock when it is the largest", () => {
    const locked: PrimaryHandState = { wrist: { x: 0.1, y: 0.5 }, lastSeenMs: 0 };
    const near = pickPrimaryHand([hand(0.15, 0.5, 0.3)], locked, 50); // wrist ~0.16 away, inside MAX_JUMP
    expect(near.index).toBe(0);
    expect(MAX_JUMP).toBeLessThan(0.4);
    const far = pickPrimaryHand([hand(0.5, 0.5, 0.3), hand(0.9, 0.5, 0.2)], locked, LOCK_LOST_MS + 50);
    expect(far.index).toBe(0); // lock expired, no match: the largest (first) hand starts a new lock
  });
});

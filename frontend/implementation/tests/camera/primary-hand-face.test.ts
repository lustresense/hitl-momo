import { describe, expect, it } from "vitest";
import { isPlayerHand, pickPrimaryHand, type PrimaryHandState } from "@/src/camera/primary-hand";
import type { FaceBox } from "@/src/camera/face-anchor";
import { handAt } from "./hand-points";

/** Face centre x 0.5, top 0.2, bottom 0.45, so "below the face" is y > 0.45. */
const FACE: FaceBox = { x: 0.4, y: 0.2, w: 0.2, h: 0.25 };

describe("isPlayerHand (the face decides whose hand it is)", () => {
  it("accepts a hand just below the face", () => {
    expect(isPlayerHand(handAt(0.5, 0.55, 0.2), FACE)).toBe(true);
  });

  it("accepts a raised hand up to one face height above the top of the head", () => {
    expect(isPlayerHand(handAt(0.55, 0.05, 0.12), FACE)).toBe(true);
  });

  it("rejects a hand far off to the side, even when it is big", () => {
    expect(isPlayerHand(handAt(0.92, 0.5, 0.3), FACE)).toBe(false);
  });

  it("rejects a hand that is far below the region", () => {
    const low: FaceBox = { x: 0.4, y: 0.02, w: 0.2, h: 0.1 }; // region ends at 0.02 + 4 * 0.1 = 0.42
    expect(isPlayerHand(handAt(0.5, 0.7, 0.2), low)).toBe(false);
  });

  it("rejects a face misread as a hand (its box mostly covers the face)", () => {
    expect(isPlayerHand(handAt(0.5, 0.325, 0.2), FACE)).toBe(false);
  });
});

describe("pickPrimaryHand with a face in view", () => {
  it("ignores a bigger bystander hand outside the face region and picks the player's hand", () => {
    const bystander = handAt(0.92, 0.5, 0.4);
    const player = handAt(0.5, 0.55, 0.2);
    const pick = pickPrimaryHand([bystander, player], null, 0, FACE);
    expect(pick.index).toBe(1);
  });

  it("returns no hand when only a bystander is in view", () => {
    expect(pickPrimaryHand([handAt(0.92, 0.5, 0.3)], null, 0, FACE).index).toBeNull();
  });

  it("keeps the lock on the player's hand while it moves", () => {
    const first = pickPrimaryHand([handAt(0.5, 0.55, 0.2)], null, 0, FACE);
    const next = pickPrimaryHand([handAt(0.6, 0.55, 0.2), handAt(0.92, 0.5, 0.4)], first.state as PrimaryHandState, 33, FACE);
    expect(next.index).toBe(0);
  });

  it("without a face, the plain rule still takes the largest hand (the fallback)", () => {
    expect(pickPrimaryHand([handAt(0.92, 0.5, 0.3)], null, 0).index).toBe(0);
    expect(pickPrimaryHand([handAt(0.92, 0.5, 0.3)], null, 0, null).index).toBe(0);
  });
});

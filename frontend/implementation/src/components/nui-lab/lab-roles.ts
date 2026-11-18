/**
 * Says what the game's hand rule does with each hand in a frame, for the NUI test page. Pure: no DOM, no MediaPipe.
 * The geometry is the one primary-hand.ts uses (isPlayerHand and its constants), so the page and the game agree.
 */
import type { FaceBox } from "@/src/camera/face-anchor";
import {
  HAND_FACE_OVERLAP_MAX,
  HAND_REGION_ABOVE,
  HAND_REGION_BELOW,
  HAND_REGION_HALF_WIDTH,
  handBounds,
  isLargeEnough,
  isPlayerHand,
} from "@/src/camera/primary-hand";
import type { Landmark } from "@/src/input/types";

/**
 * primary: the hand the game follows. other: a valid hand that is not followed. far: too small to be the player.
 * face: the hand box lies mostly over the face (a face misread as a hand). outside: beside or far below the player.
 */
export type HandRole = "primary" | "other" | "far" | "face" | "outside";

/** Labels the owner reads next to a rejected hand (the primary and other hands are not labelled). */
export const HAND_ROLE_LABEL: Record<"far" | "face" | "outside", string> = {
  far: "diabaikan (jauh)",
  face: "wajah, bukan tangan",
  outside: "di luar area pemain",
};

/** Share of a hand's box that lies inside the face box (0..1). */
export function faceOverlapShare(hand: Landmark[], face: FaceBox): number {
  const b = handBounds(hand);
  const area = (b.maxX - b.minX) * (b.maxY - b.minY);
  if (!(area > 0)) return 0;
  const overlapW = Math.max(0, Math.min(b.maxX, face.x + face.w) - Math.max(b.minX, face.x));
  const overlapH = Math.max(0, Math.min(b.maxY, face.y + face.h) - Math.max(b.minY, face.y));
  return (overlapW * overlapH) / area;
}

/** The area where the player's wrist may be, from the same face-unit constants as primary-hand.ts. */
export function playerRegion(face: FaceBox): { x0: number; y0: number; x1: number; y1: number } {
  const cx = face.x + face.w / 2;
  return {
    x0: cx - HAND_REGION_HALF_WIDTH * face.w,
    x1: cx + HAND_REGION_HALF_WIDTH * face.w,
    y0: face.y - HAND_REGION_ABOVE * face.h,
    y1: face.y + HAND_REGION_BELOW * face.h,
  };
}

/**
 * One role per hand, in the order MediaPipe reported them. Far is checked first, as in the game; then, with a
 * face in view, a face misread, then a hand outside the player area. What is left is primary or other.
 */
export function classifyHandRoles(hands: Landmark[][], primaryIndex: number | null, face: FaceBox | null): HandRole[] {
  return hands.map((hand, i) => {
    if (!isLargeEnough(hand)) return "far";
    if (face) {
      if (faceOverlapShare(hand, face) > HAND_FACE_OVERLAP_MAX) return "face";
      if (!isPlayerHand(hand, face)) return "outside";
    }
    return i === primaryIndex ? "primary" : "other";
  });
}

/** How many hands fell into each role. */
export function countHandRoles(roles: readonly HandRole[]): Record<HandRole, number> {
  const counts: Record<HandRole, number> = { primary: 0, other: 0, far: 0, face: 0, outside: 0 };
  for (const r of roles) counts[r]++;
  return counts;
}

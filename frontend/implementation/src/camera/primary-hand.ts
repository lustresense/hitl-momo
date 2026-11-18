/**
 * Picks the player's hand out of every hand MediaPipe reports (numHands: 2).
 *
 * Pure: the trackers call it once per frame and keep the returned state.
 * The values are STARTING VALUES for a live exhibition, not measured on a camera (sandbox has none).
 */
import type { Landmark } from "../input/types";
import type { FaceBox } from "./face-anchor";

/** Hands whose larger side is below this (fraction of the frame) are far away: other people, not the player. */
export const MIN_HAND_SIZE = 0.08;
/** A wrist this close (normalised distance) to the locked wrist is the same hand, moved a little. */
export const MAX_JUMP = 0.18;
/** After this long with no valid hand in view the lock is dropped (a lone or largest hand then starts a new lock). */
export const LOCK_LOST_MS = 600;
/** A lone unmatched hand within this size ratio of the locked hand is the player moving fast, not a bystander. */
export const SAME_HAND_SIZE_RATIO = 1.7;
/*
 * Player region around the face, in face units. Starting values, not measured on a camera: a waving arm stays
 * within about 0.6 face widths of the head, and a raised hand may reach one face height above the top of the head.
 */
export const HAND_REGION_HALF_WIDTH = 1.6;
export const HAND_REGION_ABOVE = 1.0;
export const HAND_REGION_BELOW = 4.0;
/** A hand whose box is more than this share inside the face box is the face itself, misread as a hand. */
export const HAND_FACE_OVERLAP_MAX = 0.75;

export interface PrimaryHandState {
  /** Wrist of the locked hand on its last matched frame (normalised). */
  wrist: { x: number; y: number };
  /** Clock time of that match; with no valid hand after LOCK_LOST_MS the lock is dropped. */
  lastSeenMs: number;
  /** Size (handSize) of the locked hand; lets a fast sweep be told apart from a bystander. */
  size?: number;
}

export interface PrimaryHandPick {
  /** Index into `hands` of the primary hand this frame; null when no hand is chosen. */
  index: number | null;
  state: PrimaryHandState | null;
}

/** True when the hand is near enough to be the player's (see MIN_HAND_SIZE). */
export function isLargeEnough(hand: Landmark[]): boolean {
  return handSize(hand) >= MIN_HAND_SIZE;
}

/** Bounding box around all landmarks (normalised units). */
export function handBounds(hand: Landmark[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of hand) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/** Larger side of the bounding box around all landmarks (normalised units). */
export function handSize(hand: Landmark[]): number {
  const b = handBounds(hand);
  return Math.max(b.maxX - b.minX, b.maxY - b.minY);
}

/**
 * True when the hand can be the player's, given the face: its wrist is in the region around and above the head, and
 * its box is not mostly the face itself. Whoever sits to the side or further down the frame is not the player.
 */
export function isPlayerHand(hand: Landmark[], face: FaceBox): boolean {
  const wrist = hand[0];
  if (!wrist) return false;
  const centreX = face.x + face.w / 2;
  const maxSpanX = Math.max(0.36, HAND_REGION_HALF_WIDTH * face.w);
  if (Math.abs(wrist.x - centreX) > maxSpanX) return false;
  if (wrist.y < face.y - HAND_REGION_ABOVE * face.h || wrist.y > face.y + HAND_REGION_BELOW * face.h) return false;

  const b = handBounds(hand);
  const area = (b.maxX - b.minX) * (b.maxY - b.minY);
  if (!(area > 0)) return false;
  const overlapW = Math.max(0, Math.min(b.maxX, face.x + face.w) - Math.max(b.minX, face.x));
  const overlapH = Math.max(0, Math.min(b.maxY, face.y + face.h) - Math.max(b.minY, face.y));
  return (overlapW * overlapH) / area <= HAND_FACE_OVERLAP_MAX;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * A locked hand stays the primary while a valid hand has its wrist within MAX_JUMP of the locked wrist.
 * While the lock is fresh, an unmatched hand only takes over when it is the ONLY valid hand and about the
 * same size as the locked one (a quick sweep that jumped further than MAX_JUMP). Any other unmatched hand is a
 * bystander: the frame gets index null and the lock is kept. After LOCK_LOST_MS without the player the lock
 * expires and the largest valid hand (the closest person) starts a new lock.
 *
 * With a `face` in view, only hands that pass isPlayerHand are valid at all. Without one (null) the rule is the
 * plain one above.
 */
export function pickPrimaryHand(
  hands: Landmark[][],
  previous: PrimaryHandState | null,
  nowMs: number,
  face: FaceBox | null = null,
): PrimaryHandPick {
  const valid: { index: number; wrist: { x: number; y: number }; size: number }[] = [];
  hands.forEach((h, index) => {
    const wrist = h?.[0];
    if (!wrist) return;
    if (!isLargeEnough(h)) return;
    if (face && !isPlayerHand(h, face)) return;
    valid.push({ index, wrist, size: handSize(h) });
  });

  const lock = previous && nowMs - previous.lastSeenMs <= LOCK_LOST_MS ? previous : null;
  if (valid.length === 0) return { index: null, state: lock };

  if (lock) {
    let match: (typeof valid)[number] | null = null;
    let matchDistance = Infinity;
    for (const c of valid) {
      const d = dist(c.wrist, lock.wrist);
      if (d <= MAX_JUMP && d < matchDistance) {
        match = c;
        matchDistance = d;
      }
    }
    if (match) return { index: match.index, state: { wrist: match.wrist, lastSeenMs: nowMs, size: match.size } };
    const lone = valid.length === 1 ? valid[0]! : null;
    const sameSize =
      lone !== null &&
      (lock.size === undefined ||
        Math.max(lone.size, lock.size) / Math.max(1e-6, Math.min(lone.size, lock.size)) <= SAME_HAND_SIZE_RATIO);
    if (!lone || !sameSize) return { index: null, state: lock };
    return { index: lone.index, state: { wrist: lone.wrist, lastSeenMs: nowMs, size: lone.size } };
  }

  let largest = valid[0]!;
  for (const c of valid) if (c.size > largest.size) largest = c;
  return { index: largest.index, state: { wrist: largest.wrist, lastSeenMs: nowMs, size: largest.size } };
}

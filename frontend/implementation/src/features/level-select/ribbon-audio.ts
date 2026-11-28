import { PENTATONIC_RATES } from "@/src/audio/registry/events";
import { CLICK_SUPPRESS_PX } from "./ribbon-layout";
import type { RibbonPullReleaseResult } from "./ribbon-pull";

/** Pitch of the pull notch sound: notch 1..4 climbs the pentatonic (1, 1.122, 1.26, 1.498); out-of-range values clamp. */
export function notchRate(notch: number): number {
  const i = Math.max(0, Math.min(3, Math.floor(Number.isFinite(notch) ? notch : 1) - 1));
  return PENTATONIC_RATES[i] ?? 1;
}

/**
 * True when a released ribbon really springs back from a visible pull, so a plain tap (which also produces a
 * "rebound" result with zero pull right before its click) stays silent. A locked ribbon only counts when it was tugged.
 */
export function shouldSoundRebound(rel: RibbonPullReleaseResult): boolean {
  if (rel.action === "rebound") return rel.fromLength - rel.restLength > CLICK_SUPPRESS_PX;
  if (rel.action === "rebound-locked") return rel.tugged;
  return false;
}

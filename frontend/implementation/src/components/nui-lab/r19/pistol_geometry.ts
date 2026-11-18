/**
 * R19 Stage P2 — Pure Pistol Geometry (`POINT_READY`, `POINT_PRESS`, `OTHER`)
 *
 * Design principles:
 *  - All geometry operates in aspect-corrected isotropic 2D space (`withAspect(landmarks, aspect)`)
 *    normalized by `palmScale = max(dist(0,9), dist(5,17))` so horizontal/vertical/rolled/pitched
 *    hands behave consistently across 1:1, 5:4, 4:3, 16:9, and 9:16 streams.
 *  - Fixes the `hand-gesture.ts` `fingerStates()` bug by providing `fingerDiagnosticStatesAspect()`.
 *  - Replaces fragile `thumbLateral` (which divides by `||5 - 17||^2` and collapses on rolled/dorsal
 *    hands) with multi-cue thumb posture metrics (`d4_5`, `d4_6`, `d4_9`, `d4_10`, `d4_8`, radial
 *    separation from index ray `5->8`, thumb straightness `1-2-3`/`2-3-4`, abduction at `5`/`2`).
 *  - Handles Dorsal Right-Hand Pointing Left (`O0`/`O1`) cleanly without false-pinching when `tip 4`
 *    projects near `5`/`6` while `tip 8` extends outward (`d4_8` stays >> pinch threshold).
 *  - Resolves `countExtendedFingers === 2`, `"two-fingers"`, and `"thumb-up"` collisions explicitly.
 */
import {
  DEFAULT_LAB_ASPECT,
  thumbLateral,
  withAspect,
  type FingerState,
} from "./pistol_types";
import type { Landmark } from "./pistol_types";

export type PistolGeometricState = "POINT_READY" | "POINT_PRESS" | "OTHER";

export type PistolOtherSubClass =
  | "pinch"
  | "thumb-up"
  | "two-fingers"
  | "three"
  | "four"
  | "five"
  | "fist"
  | "unknown"
  | "degenerate";

export type PistolSubClass = "ready" | "pistol" | PistolOtherSubClass;

export interface FingerGeometricMetrics {
  state: FingerState;
  tipReach: number;
  pipReach: number;
  tipToPipRatio: number;
  mcpToTipNorm: number;
  pipAngleDeg: number;
  dipAngleDeg: number;
  minBendDeg: number;
  isExtended: boolean;
  isCurled: boolean;
}

export interface PistolGeometryMetrics {
  aspect: number;
  plausible: boolean;
  plausibilityReason: string;
  palmScale: number;
  wristToMidRatio: number;
  knuckleSpanRatio: number;
  bboxArea: number;
  rawHandSize: number;
  fingerStates: [FingerState, FingerState, FingerState, FingerState];
  index: FingerGeometricMetrics;
  middle: FingerGeometricMetrics;
  ring: FingerGeometricMetrics;
  pinky: FingerGeometricMetrics;
  indexStraight: boolean;
  /** Multi-cue normalized thumb metrics (relative to palmScale). */
  d4_5: number;
  d4_6: number;
  d4_9: number;
  d4_10: number;
  d4_8: number;
  d4_2: number;
  d4_0: number;
  d4_17: number;
  d5_8: number;
  thumbPerpFromIndexRay: number;
  thumbAlongIndexRay: number;
  thumbSignedRadial: number | null;
  thumbSignedPalmPlane: number | null;
  thumbAngle123Deg: number;
  thumbAngle234Deg: number;
  thumbAbduction854Deg: number;
  thumbAbduction524Deg: number;
  thumbLiftPalm: number;
  thumbLateralLegacy: number | null;
  thumbOpen: boolean;
  isPinch: boolean;
  isThumbUp: boolean;
  indexPointAngleDeg: number | null;
}

export interface PistolClassification {
  state: PistolGeometricState;
  subClass: PistolSubClass;
  reason: string;
  angle: number | null;
  metrics: PistolGeometryMetrics | null;
}

interface Vec2 {
  x: number;
  y: number;
}

function dist2(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cross2(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function jointAngleDeg(a: Vec2, b: Vec2, c: Vec2): number {
  const ax = a.x - b.x;
  const ay = a.y - b.y;
  const bx = c.x - b.x;
  const by = c.y - b.y;
  const len = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (len <= 1e-8) return 0;
  const cosTheta = Math.max(-1, Math.min(1, (ax * bx + ay * by) / len));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

function validAspect(aspect?: number): number {
  return aspect !== undefined && Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_LAB_ASPECT;
}

function hasValid21Landmarks(landmarks: Landmark[] | undefined): landmarks is Landmark[] {
  if (!landmarks || landmarks.length < 21) return false;
  for (let i = 0; i < 21; i++) {
    const p = landmarks[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  }
  return true;
}

/**
 * Aspect-corrected index pointing angle in mirrored preview convention:
 * 0 deg = student right, 90 deg = up, 180 / -180 deg = left, -90 deg = down.
 */
export function indexPointAngleAspect(
  landmarks: Landmark[] | undefined,
  aspect = DEFAULT_LAB_ASPECT,
): number | null {
  if (!landmarks || landmarks.length < 9) return null;
  const base = landmarks[5];
  const tip = landmarks[8];
  if (!base || !tip) return null;
  if (![base.x, base.y, tip.x, tip.y].every(Number.isFinite)) return null;
  const a = validAspect(aspect);
  const dx = (base.x - tip.x) * a;
  const dy = base.y - tip.y;
  if (Math.hypot(dx, dy) < 0.01) return null;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

const FINGER_JOINTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

const EXTENDED_RATIO = 1.1;

/**
 * Aspect-corrected 4-finger state diagnostic (`[index, middle, ring, pinky]`).
 * Fixes the `hand-gesture.ts` bug where `fingerStates()` ignores `withAspect`.
 */
export function fingerDiagnosticStatesAspect(
  landmarks: Landmark[] | undefined,
  aspect = DEFAULT_LAB_ASPECT,
): [FingerState, FingerState, FingerState, FingerState] | null {
  if (!hasValid21Landmarks(landmarks)) return null;
  const a = validAspect(aspect);
  const g = withAspect(landmarks, a);
  const wrist = g[0]!;
  const out = FINGER_JOINTS.map(([, pipI, , tipI]) => {
    const t = dist2(g[tipI]!, wrist);
    const p = dist2(g[pipI]!, wrist);
    if (t < p) return "curled";
    if (t > p * EXTENDED_RATIO) return "extended";
    return "between";
  });
  return out as [FingerState, FingerState, FingerState, FingerState];
}

function measureFinger(
  g: Landmark[],
  palmScale: number,
  state: FingerState,
  joints: readonly [number, number, number, number],
): FingerGeometricMetrics {
  const [mcpI, pipI, dipI, tipI] = joints;
  const wrist = g[0]!;
  const mcp = g[mcpI]!;
  const pip = g[pipI]!;
  const dip = g[dipI]!;
  const tip = g[tipI]!;

  const tipDist = dist2(tip, wrist);
  const pipDist = dist2(pip, wrist);
  const tipReach = tipDist / palmScale;
  const pipReach = pipDist / palmScale;
  const tipToPipRatio = tipDist / Math.max(1e-6, pipDist);
  const mcpToTipNorm = dist2(tip, mcp) / palmScale;
  const pipAngleDeg = jointAngleDeg(mcp, pip, tip);
  const dipAngleDeg = jointAngleDeg(pip, dip, tip);
  const minBendDeg = Math.min(jointAngleDeg(mcp, pip, dip), dipAngleDeg);

  // Extended requires genuine distal reach plus non-collapsed joint alignment.
  const isExtended =
    tipToPipRatio >= 1.1 &&
    mcpToTipNorm >= 0.56 &&
    pipAngleDeg >= 134 &&
    minBendDeg >= 122;

  // Curled catches both classic tip<pip curl and dorsal/pitched folded fingers stuck in "between".
  const isCurled =
    !isExtended &&
    (state === "curled" ||
      (tipToPipRatio < 1.09 &&
        (pipAngleDeg < 122 || minBendDeg < 114 || mcpToTipNorm < 0.54)));

  return {
    state,
    tipReach,
    pipReach,
    tipToPipRatio,
    mcpToTipNorm,
    pipAngleDeg,
    dipAngleDeg,
    minBendDeg,
    isExtended,
    isCurled,
  };
}

function checkPlausibility(
  raw: Landmark[],
  g: Landmark[],
  palmScale: number,
): { plausible: boolean; reason: string; rawHandSize: number; bboxArea: number } {
  let rMinX = Infinity, rMaxX = -Infinity, rMinY = Infinity, rMaxY = -Infinity;
  let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity;
  for (let i = 0; i < 21; i++) {
    const rp = raw[i]!;
    const gp = g[i]!;
    if (rp.x < rMinX) rMinX = rp.x;
    if (rp.x > rMaxX) rMaxX = rp.x;
    if (rp.y < rMinY) rMinY = rp.y;
    if (rp.y > rMaxY) rMaxY = rp.y;
    if (gp.x < gMinX) gMinX = gp.x;
    if (gp.x > gMaxX) gMaxX = gp.x;
    if (gp.y < gMinY) gMinY = gp.y;
    if (gp.y > gMaxY) gMaxY = gp.y;
  }
  const rawHandSize = Math.max(rMaxX - rMinX, rMaxY - rMinY);
  const bboxArea = (gMaxX - gMinX) * (gMaxY - gMinY);

  if (rawHandSize < 0.05 || rawHandSize > 1.35) {
    return { plausible: false, reason: "out-of-range-hand-size", rawHandSize, bboxArea };
  }
  if (palmScale < 0.035) {
    return { plausible: false, reason: "collapsed-palm-scale", rawHandSize, bboxArea };
  }
  if (bboxArea < 0.0018) {
    return { plausible: false, reason: "collapsed-bbox-area", rawHandSize, bboxArea };
  }

  const chainLen = (indices: readonly [number, number, number, number]) =>
    (dist2(g[indices[0]]!, g[indices[1]]!) +
      dist2(g[indices[1]]!, g[indices[2]]!) +
      dist2(g[indices[2]]!, g[indices[3]]!)) /
    palmScale;

  const idxChain = chainLen([5, 6, 7, 8]);
  const midChain = chainLen([9, 10, 11, 12]);
  const thumbChain = chainLen([1, 2, 3, 4]);

  if (idxChain < 0.14 || idxChain > 3.1 || midChain < 0.14 || midChain > 3.2 || thumbChain < 0.12 || thumbChain > 2.9) {
    return { plausible: false, reason: "implausible-finger-chain", rawHandSize, bboxArea };
  }

  return { plausible: true, reason: "ok", rawHandSize, bboxArea };
}

/**
 * Compute orientation-invariant multi-cue pistol geometry metrics in aspect-corrected space.
 */
export function pistolGeometryMetrics(
  landmarks: Landmark[] | undefined,
  aspect = DEFAULT_LAB_ASPECT,
): PistolGeometryMetrics | null {
  if (!hasValid21Landmarks(landmarks)) return null;
  const a = validAspect(aspect);
  const g = withAspect(landmarks, a);

  const wrist = g[0]!;
  const midMcp = g[9]!;
  const idxMcp = g[5]!;
  const pinkyMcp = g[17]!;

  const wristToMid = dist2(wrist, midMcp);
  const knuckleSpan = dist2(idxMcp, pinkyMcp);
  const palmScale = Math.max(wristToMid, knuckleSpan);
  if (!(palmScale > 1e-5)) return null;

  const plaus = checkPlausibility(landmarks, g, palmScale);
  const states = fingerDiagnosticStatesAspect(landmarks, a)!;

  const index = measureFinger(g, palmScale, states[0], FINGER_JOINTS[0]!);
  const middle = measureFinger(g, palmScale, states[1], FINGER_JOINTS[1]!);
  const ring = measureFinger(g, palmScale, states[2], FINGER_JOINTS[2]!);
  const pinky = measureFinger(g, palmScale, states[3], FINGER_JOINTS[3]!);

  const indexStraight =
    (index.state === "extended" || (index.tipToPipRatio >= 1.05 && index.mcpToTipNorm >= 0.52)) &&
    index.mcpToTipNorm >= 0.44 &&
    index.pipAngleDeg >= 136 &&
    index.minBendDeg >= 126;

  // Multi-cue thumb posture metrics.
  const t1 = g[1]!;
  const t2 = g[2]!;
  const t3 = g[3]!;
  const t4 = g[4]!;
  const i6 = g[6]!;
  const i8 = g[8]!;
  const m10 = g[10]!;

  const d4_5 = dist2(t4, idxMcp) / palmScale;
  const d4_6 = dist2(t4, i6) / palmScale;
  const d4_9 = dist2(t4, midMcp) / palmScale;
  const d4_10 = dist2(t4, m10) / palmScale;
  const d4_8 = dist2(t4, i8) / palmScale;
  const d4_2 = dist2(t4, t2) / palmScale;
  const d4_0 = dist2(t4, wrist) / palmScale;
  const d4_17 = dist2(t4, pinkyMcp) / palmScale;
  const d5_8 = dist2(idxMcp, i8) / palmScale;

  // Index ray 5->8 (fallback 5->6 if tip overlaps MCP).
  const rayBaseDx = i8.x - idxMcp.x;
  const rayBaseDy = i8.y - idxMcp.y;
  const rayLen = Math.hypot(rayBaseDx, rayBaseDy);
  const fbDx = i6.x - idxMcp.x;
  const fbDy = i6.y - idxMcp.y;
  const fbLen = Math.hypot(fbDx, fbDy);
  const uIdxX = rayLen >= 0.1 * palmScale ? rayBaseDx / rayLen : fbLen > 1e-6 ? fbDx / fbLen : 0;
  const uIdxY = rayLen >= 0.1 * palmScale ? rayBaseDy / rayLen : fbLen > 1e-6 ? fbDy / fbLen : -1;

  const v5_4x = t4.x - idxMcp.x;
  const v5_4y = t4.y - idxMcp.y;
  const thumbPerpFromIndexRay = Math.abs(cross2(uIdxX, uIdxY, v5_4x, v5_4y)) / palmScale;
  const thumbAlongIndexRay = (uIdxX * v5_4x + uIdxY * v5_4y) / palmScale;

  // Signed radial separation relative to palm ulnar side (5->17):
  // positive = thumb side (away from pinky across index ray), negative = tucked across palm.
  const v5_17x = pinkyMcp.x - idxMcp.x;
  const v5_17y = pinkyMcp.y - idxMcp.y;
  const sideCross = cross2(uIdxX, uIdxY, v5_17x, v5_17y);
  let thumbSignedRadial: number | null = null;
  if (Math.abs(sideCross) >= 0.12 * palmScale) {
    const radialSign = sideCross > 0 ? -1 : 1;
    thumbSignedRadial = (radialSign * cross2(uIdxX, uIdxY, v5_4x, v5_4y)) / palmScale;
  }

  // Secondary signed radial separation relative to palm axis 0->9 (resilient when 5->8 pitches).
  let thumbSignedPalmPlane: number | null = null;
  if (wristToMid >= 0.25 * palmScale) {
    const uPalmX = (midMcp.x - wrist.x) / wristToMid;
    const uPalmY = (midMcp.y - wrist.y) / wristToMid;
    const ulnarCross = cross2(uPalmX, uPalmY, pinkyMcp.x - wrist.x, pinkyMcp.y - wrist.y);
    if (Math.abs(ulnarCross) >= 0.12 * palmScale) {
      const radialSignPalm = ulnarCross > 0 ? -1 : 1;
      thumbSignedPalmPlane = (radialSignPalm * cross2(uPalmX, uPalmY, t4.x - wrist.x, t4.y - wrist.y)) / palmScale;
    }
  }

  const thumbAngle123Deg = jointAngleDeg(t1, t2, t3);
  const thumbAngle234Deg = jointAngleDeg(t2, t3, t4);
  const thumbAbduction854Deg = jointAngleDeg(i8, idxMcp, t4);
  const thumbAbduction524Deg = jointAngleDeg(idxMcp, t2, t4);
  const thumbLiftPalm = (t2.y - t4.y) / palmScale;
  const thumbLateralLegacy = thumbLateral(g);

  // Multi-cue open-thumb decision:
  // 1) Away from curled middle/palm (d4_9, d4_10) so palm-tucked thumbs are rejected.
  // 2) Separated radially from index ray & base (thumbPerpFromIndexRay, d4_5, d4_6, angles 8-5-4 & 5-2-4)
  //    so index-hugging triggers (`POINT_READY` style B) are rejected.
  // 3) Extended thumb geometry (2-3-4 >= 95, 1-2-3 >= 95, d4_2 >= 0.24) tolerating Z-tilt foreshortening
  //    on dorsal rolled hands while blocking collapsed thumbs.
  // 4) Signed radial >= 0.16 when palm plane is non-collapsed so cross-palm tucks never fire.
  const radialDirectionOk =
    (thumbSignedRadial === null || thumbSignedRadial >= 0.16) &&
    (thumbSignedPalmPlane === null || thumbSignedPalmPlane >= 0.16);

  const thumbOpen =
    d4_9 >= 0.48 &&
    d4_10 >= 0.42 &&
    d4_5 >= 0.29 &&
    d4_6 >= 0.36 &&
    d4_2 >= 0.24 &&
    thumbPerpFromIndexRay >= 0.25 &&
    thumbAbduction854Deg >= 36 &&
    thumbAbduction524Deg >= 28 &&
    thumbAngle234Deg >= 95 &&
    thumbAngle123Deg >= 95 &&
    radialDirectionOk;

  const all4Curled = index.isCurled && middle.isCurled && ring.isCurled && pinky.isCurled && !indexStraight;

  // Pinch guard:
  // - Tight tip touch (<0.24) is always pinch; (<0.27) when not a closed fist.
  // - Near pinch (<0.40) when not a fist AND thumb reaches toward index tip rather than overlapping MCP 5/6.
  // - Extended near pinch (<0.44) when thumb stretches along index (`d4_5 >= 0.45`, `angle(8,5,4) < 34`).
  //   Crucially, Dorsal Right-Hand Pointing Left has d4_8 >> 0.44 when tip 8 is extended, so it never false-pinches.
  const nearPinchReachCue =
    thumbAbduction854Deg < 38 ||
    d4_0 >= 0.74 * index.tipReach ||
    d4_5 >= 0.52 * d5_8;
  const nearPinchExtendedReach =
    d4_8 < 0.44 &&
    d4_5 >= 0.45 &&
    thumbAbduction854Deg < 34 &&
    d4_0 >= 0.72 * index.tipReach;
  const isPinch =
    d4_8 < 0.24 ||
    (d4_8 < 0.27 && !all4Curled) ||
    (!all4Curled && d4_8 < 0.40 && nearPinchReachCue) ||
    (!all4Curled && nearPinchExtendedReach);

  // Thumbs-up requires ALL 4 non-thumb fingers curled (never collides with 90-deg upward pointing)
  // and thumb lifted clearly above the curled knuckles/tips.
  const minOtherTipY = Math.min(g[8]!.y, g[12]!.y, g[16]!.y, g[20]!.y, g[6]!.y);
  const thumbLiftedExtended =
    thumbOpen || (d4_5 >= 0.34 && d4_9 >= 0.40 && thumbAngle234Deg >= 118 && d4_2 >= 0.26);
  const isThumbUp =
    all4Curled &&
    !isPinch &&
    thumbLiftedExtended &&
    thumbLiftPalm >= 0.32 &&
    t4.y < idxMcp.y - 0.04 * palmScale &&
    t4.y <= minOtherTipY + 0.15 * palmScale;

  const indexPointAngleDeg = indexPointAngleAspect(landmarks, a);

  return {
    aspect: a,
    plausible: plaus.plausible,
    plausibilityReason: plaus.reason,
    palmScale,
    wristToMidRatio: wristToMid / palmScale,
    knuckleSpanRatio: knuckleSpan / palmScale,
    bboxArea: plaus.bboxArea,
    rawHandSize: plaus.rawHandSize,
    fingerStates: states,
    index,
    middle,
    ring,
    pinky,
    indexStraight,
    d4_5,
    d4_6,
    d4_9,
    d4_10,
    d4_8,
    d4_2,
    d4_0,
    d4_17,
    d5_8,
    thumbPerpFromIndexRay,
    thumbAlongIndexRay,
    thumbSignedRadial,
    thumbSignedPalmPlane,
    thumbAngle123Deg,
    thumbAngle234Deg,
    thumbAbduction854Deg,
    thumbAbduction524Deg,
    thumbLiftPalm,
    thumbLateralLegacy,
    thumbOpen,
    isPinch,
    isThumbUp,
    indexPointAngleDeg,
  };
}

/**
 * Pure geometric Pistol classifier:
 *  - `POINT_READY`: straight index, middle/ring/pinky curled, thumb folded/tucked, non-pinch.
 *  - `POINT_PRESS`: Pistol / L-Sign (straight index, middle/ring/pinky curled, thumb open, non-pinch).
 *  - `OTHER`: `pinch`, `thumb-up`, `two-fingers`, `three`, `four`, `five`, `fist`, `unknown`, `degenerate`.
 */
export function classifyPistolGeometry(
  landmarks: Landmark[] | undefined,
  aspect = DEFAULT_LAB_ASPECT,
): PistolClassification {
  const m = pistolGeometryMetrics(landmarks, aspect);
  if (!m) {
    return { state: "OTHER", subClass: "degenerate", reason: "missing-or-nan-landmarks", angle: null, metrics: null };
  }
  if (!m.plausible) {
    return { state: "OTHER", subClass: "degenerate", reason: m.plausibilityReason, angle: null, metrics: m };
  }

  // 1. Pinch takes precedence over pointing/open poses (OK-pinch & near-pinch guard).
  if (m.isPinch) {
    return { state: "OTHER", subClass: "pinch", reason: "pinch-guard", angle: null, metrics: m };
  }

  // 2. Thumb-up requires all 4 fingers curled (cannot collide with 90-deg upward POINT_PRESS/READY).
  if (m.isThumbUp) {
    return { state: "OTHER", subClass: "thumb-up", reason: "all-four-curled-thumb-up", angle: null, metrics: m };
  }

  const othersCurled = m.middle.isCurled && m.ring.isCurled && m.pinky.isCurled;
  const all4Curled = m.index.isCurled && othersCurled && !m.indexStraight;

  // 3. Fist (all 4 fingers curled, not thumb-up).
  if (all4Curled) {
    return { state: "OTHER", subClass: "fist", reason: "all-four-curled", angle: null, metrics: m };
  }

  // 4. Pistol states (`POINT_PRESS` vs `POINT_READY`) require straight index & curled middle/ring/pinky.
  //    Explicitly prevents `countExtendedFingers === 2` / `two-fingers` collision because middle MUST be curled.
  if (m.indexStraight && othersCurled) {
    if (m.indexPointAngleDeg === null) {
      return { state: "OTHER", subClass: "degenerate", reason: "short-index-vector", angle: null, metrics: m };
    }
    if (m.thumbOpen) {
      return {
        state: "POINT_PRESS",
        subClass: "pistol",
        reason: "index-straight-3-curled-thumb-open",
        angle: m.indexPointAngleDeg,
        metrics: m,
      };
    }
    return {
      state: "POINT_READY",
      subClass: "ready",
      reason: "index-straight-3-curled-thumb-folded",
      angle: m.indexPointAngleDeg,
      metrics: m,
    };
  }

  // 5. Multi-finger OTHER poses (explicitly non-colliding with Pistol).
  const extCount4 = [m.index.isExtended, m.middle.isExtended, m.ring.isExtended, m.pinky.isExtended].filter(Boolean).length;
  if (m.index.isExtended && m.middle.isExtended && m.ring.isCurled && m.pinky.isCurled) {
    return { state: "OTHER", subClass: "two-fingers", reason: "index-and-middle-extended", angle: null, metrics: m };
  }
  if (extCount4 === 3 && m.pinky.isCurled && m.index.isExtended && m.middle.isExtended && m.ring.isExtended) {
    return { state: "OTHER", subClass: "three", reason: "three-fingers-extended", angle: null, metrics: m };
  }
  if (extCount4 === 4) {
    return {
      state: "OTHER",
      subClass: m.thumbOpen ? "five" : "four",
      reason: m.thumbOpen ? "open-palm-five" : "four-fingers-thumb-tucked",
      angle: null,
      metrics: m,
    };
  }

  return { state: "OTHER", subClass: "unknown", reason: "ambiguous-finger-posture", angle: null, metrics: m };
}

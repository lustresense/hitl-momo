import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LabAnalyzer } from "@/src/components/nui-lab/lab-analyzer";
import { indexPointAngleAspect } from "@/src/components/nui-lab/r19/pistol_geometry";
import { validateR19Model } from "@/src/components/nui-lab/r19/r19_loader";
import type { R19ExportedModel } from "@/src/components/nui-lab/r19/r19_model";
import type { Landmark } from "@/src/input/types";
import { fistHand, makeHand, pinchHand, spreadHand } from "../input/hand-fixtures";
import { MEDIAN_SKELETONS, pinchSkeleton, placeHand, type RealisticClass, type Skeleton } from "../input/realistic-hands";

/**
 * Shared rig for the NUI Lab R17 & R19 end-to-end tests: one landmark list per frame through LabAnalyzer,
 * 16:9, class-median hands and Pistol skeletons with the real exported R19 model loaded automatically unless
 * `{ enableModel: false }` is requested. Evidence class: UNIT_ONLY.
 */
export const ASPECT = 16 / 9;
export const CANVAS = { w: 1280, h: 720 };
const STEP = 0.03; // max wrist travel per frame while gliding (lock limit is 0.18)

export { MEDIAN_SKELETONS, pinchSkeleton, placeHand, makeHand, fistHand, pinchHand, spreadHand };
export type { RealisticClass, Skeleton };

export type Build = (cx: number, cy: number) => Landmark[];
export const skel = (s: Skeleton, aspect = ASPECT): Build => (cx, cy) => placeHand(s, { aspect, cx, cy });
export const cls = (c: RealisticClass, aspect = ASPECT): Build => skel(MEDIAN_SKELETONS[c], aspect);
// Three-fingers is safely in R19 OTHER: not a pinch, not a swipe command, not erase-eligible, and not Pistol.
export const NEUTRAL = cls("three");
export const PINCH = skel(pinchSkeleton(0.05));

let cachedRealR19Model: R19ExportedModel | null = null;

function resolveRealR19ModelPath(): string {
  const fromCwd = path.resolve(process.cwd(), "public/models/r19-pistol-model.json");
  if (existsSync(fromCwd)) return fromCwd;
  const resolved = new URL("../../public/models/r19-pistol-model.json", import.meta.url);
  if (resolved.protocol === "file:") return fileURLToPath(resolved);
  return fromCwd;
}

/** Reads and validates the real exported R19 Pistol MLP model from `public/models/r19-pistol-model.json`. */
export function loadRealR19Model(): R19ExportedModel {
  if (!cachedRealR19Model) {
    const parsed: unknown = JSON.parse(readFileSync(resolveRealR19ModelPath(), "utf8"));
    cachedRealR19Model = validateR19Model(parsed);
  }
  return cachedRealR19Model;
}

export interface PistolSkeletonOptions {
  cx?: number;
  cy?: number;
  span?: number;
  aspect?: number;
  mirror?: boolean;
  dorsal?: boolean;
}

function buildPistolBaseSkeleton(thumbOpen: boolean): Skeleton {
  // Natural ergonomic Pistol hand (wrist-to-middle = 1.0, knuckle span ~ 0.76 matching real webcam
  // Pistol posture): identical palm/curled fingers between POINT_READY and POINT_PRESS so folding or
  // opening the thumb transitions in a single frame within FullFrameHandLock's 1.7x size continuity.
  const palmAndFingers: Array<[number, number]> = [
    [0.0, 0.0],   // 0: wrist
    [-0.30, 0.28], // 1: thumb CMC
    [-0.44, 0.56], // 2: thumb MCP
    [-0.38, 0.82], // 3: thumb IP
    [-0.30, 1.02], // 4: thumb tip (folded beside index MCP 5)
    [-0.32, 0.98], // 5: index MCP
    [-0.33, 1.38], // 6: index PIP
    [-0.34, 1.66], // 7: index DIP
    [-0.34, 1.92], // 8: index tip
    [0.0, 1.0],   // 9: middle MCP
    [0.03, 1.22], // 10: middle PIP
    [-0.06, 0.92], // 11: middle DIP
    [-0.10, 0.74], // 12: middle tip
    [0.24, 0.87], // 13: ring MCP
    [0.22, 0.98], // 14: ring PIP
    [0.10, 0.72], // 15: ring DIP
    [0.04, 0.56], // 16: ring tip
    [0.44, 0.69], // 17: pinky MCP
    [0.40, 0.78], // 18: pinky PIP
    [0.28, 0.60], // 19: pinky DIP
    [0.22, 0.48], // 20: pinky tip
  ];
  if (thumbOpen) {
    palmAndFingers[1] = [-0.34, 0.32];
    palmAndFingers[2] = [-0.66, 0.66];
    palmAndFingers[3] = [-0.96, 0.90];
    palmAndFingers[4] = [-1.26, 1.08];
  }
  return palmAndFingers;
}

function buildDorsalSkeleton(base: Skeleton, thumbOpen: boolean): Skeleton {
  // Dorsal right-hand pointing left (`mirror: true` puts thumb upward & pinky downward):
  // foreshorten the ulnar knuckles [13..20] and bring thumb slightly inward in Z projection while keeping d4_8 >> pinch.
  const pts = base.map(([x, y]) => [x, y] as [number, number]);
  for (let i = 13; i <= 20; i++) {
    pts[i] = [pts[i]![0] * 0.68, pts[i]![1] * 0.94];
  }
  if (thumbOpen) {
    pts[2] = [pts[2]![0] * 0.88, pts[2]![1] * 0.96];
    pts[3] = [pts[3]![0] * 0.82, pts[3]![1] * 0.98];
    pts[4] = [pts[4]![0] * 0.78, pts[4]![1] * 1.00];
  } else {
    // Tip 4 projects close to index MCP [5] / PIP [6] while tip 8 remains extended outward.
    pts[3] = [-0.34, 0.86];
    pts[4] = [-0.32, 1.06];
  }
  return pts;
}

/**
 * Synthesizes a realistic 21-landmark Pistol (`thumbOpen = true`) or Ready (`thumbOpen = false`) hand
 * whose aspect-corrected index ray `5->8` matches `angleDeg` in MediaPipe mirrored-preview convention:
 * `0° = RIGHT`, `90° = UP`, `±180° = LEFT`, `-90° = DOWN`, `45°..65° = UP_RIGHT`, `115°..135° = UP_LEFT`.
 */
export function pistolSkeleton(
  angleDeg: number,
  thumbOpen: boolean,
  opts: PistolSkeletonOptions = {},
): Landmark[] {
  const {
    cx = 0.5,
    cy = 0.55,
    span = 0.2,
    aspect = ASPECT,
    dorsal = false,
    mirror = dorsal,
  } = opts;
  const rawBase = buildPistolBaseSkeleton(thumbOpen);
  const baseSkel = dorsal ? buildDorsalSkeleton(rawBase, thumbOpen) : rawBase;
  const unrotated = placeHand(baseSkel, { cx: 0, cy: 0, span, aspect, rollDeg: 0, mirror });
  const baseAngle = indexPointAngleAspect(unrotated, aspect) ?? 90;
  const rollDeg = angleDeg - baseAngle;
  return placeHand(baseSkel, { cx, cy, span, aspect, rollDeg, mirror });
}

/** Builder wrapper around `pistolSkeleton` for use with `rig.put` / `rig.hold` / `rig.glide`. */
export const pistolBuild = (
  angleDeg: number,
  thumbOpen: boolean,
  opts: Omit<PistolSkeletonOptions, "cx" | "cy"> = {},
): Build => (cx, cy) => pistolSkeleton(angleDeg, thumbOpen, { ...opts, cx, cy });

/** Raw-frame origin that puts the palm centre of `s` on canvas point (X, Y) (the preview is mirrored). */
export function originForPalm(s: Skeleton, X: number, Y: number): { cx: number; cy: number } {
  const lm = placeHand(s, { aspect: ASPECT, cx: 0, cy: 0 });
  const k = [5, 9, 13, 17].map((i) => lm[i]!);
  const ox = k.reduce((a, p) => a + p.x, 0) / 4;
  const oy = k.reduce((a, p) => a + p.y, 0) / 4;
  return { cx: 1 - X / CANVAS.w - ox, cy: Y / CANVAS.h - oy };
}

export interface LabSessionOptions {
  fullFrameLock?: boolean;
  enableInk?: boolean;
  enableModel?: boolean;
  aspect?: number;
  model?: R19ExportedModel;
}

export function startLabSession(
  opts: LabSessionOptions = {},
  onFrame?: (lab: LabAnalyzer, lm: Landmark[] | null, nowMs: number) => void,
) {
  const aspect = opts.aspect ?? ASPECT;
  const lab = new LabAnalyzer({
    fullFrameLock: opts.fullFrameLock ?? true,
    enableInk: opts.enableInk ?? true,
  });
  if (opts.enableModel !== false) {
    lab.enableR19(opts.model ?? loadRealR19Model(), 0);
  }
  let t = 1000;
  let pos = { x: 0.5, y: 0.6 };
  const feedLm = (lm: Landmark[] | null, dtMs = 33) => {
    t += dtMs;
    lab.analyse({ landmarks: lm ? [lm] : [], inferMs: 5, nowMs: t, aspect });
    onFrame?.(lab, lm, t);
  };
  /** One frame at an exact place. */
  const put = (b: Build, x = pos.x, y = pos.y, dtMs = 33) => {
    pos = { x, y };
    feedLm(b(x, y), dtMs);
  };
  /** Glide to (x, y) in small steps, then settle. */
  const glide = (b: Build, x: number, y: number, dtMs = 33) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x - pos.x, y - pos.y) / STEP));
    const from = { ...pos };
    for (let i = 1; i <= n; i++) put(b, from.x + ((x - from.x) * i) / n, from.y + ((y - from.y) * i) / n, dtMs);
  };
  const hold = (b: Build, n: number, dtMs = 33) => {
    for (let i = 0; i < n; i++) put(b, pos.x, pos.y, dtMs);
  };
  return { lab, feedLm, put, glide, hold, now: () => t, pos: () => pos, aspect };
}

export function rig(
  opts: LabSessionOptions = {},
  onFrame?: (lab: LabAnalyzer, lm: Landmark[] | null, nowMs: number) => void,
) {
  return startLabSession(opts, onFrame);
}

export type Rig = ReturnType<typeof startLabSession>;

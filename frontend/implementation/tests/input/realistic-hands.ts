import type { Landmark } from "@/src/input/types";

/**
 * Realistic 21-point hands for the gesture tests.
 *
 * Provenance: each skeleton below is the element-wise MEDIAN of thousands of real MediaPipe hand landmarks (HaGRIDv2
 * val and test annotations, one gesture class each, 2,500 hands per split), put in a common frame: wrist at the
 * origin, wrist-to-middle-knuckle = 1 (one "span") pointing up, the thumb side on the left, isotropic (a 16:9 frame
 * was un-stretched first). The numbers are an aggregate statistic of hand geometry, rounded to 0.01 span: no image,
 * no identity and no single person's landmarks are in the repository. Re-derive them with
 * `frontend/implementation/scripts/nui-rd/` (needs the public HaGRIDv2 annotation zip, which is NOT in Git).
 *
 * `placeHand` puts one of them back into a MediaPipe-style frame: x as a share of the width, y as a share of the
 * height. With aspect 16/9 a horizontal gap is therefore drawn 0.5625 as long as a vertical one, exactly what the
 * app receives from a 1280 x 720 camera. That distortion is what the lab geometry has to undo.
 */
export type RealisticClass = "palm" | "stop" | "four" | "three" | "three2" | "one" | "two_up" | "peace" | "fist" | "thumb_index";

export type Skeleton = ReadonlyArray<readonly [number, number]>;

/** Canonical median skeletons, y pointing DOWN the page (as the source frame), 21 points each. */
export const MEDIAN_SKELETONS: Record<RealisticClass, Skeleton> = {
  palm: [[0.00,0.00],[-0.72,0.24],[-1.24,0.58],[-1.66,0.86],[-2.10,1.04],[-0.53,1.02],[-0.70,1.43],[-0.77,1.69],[-0.81,1.90],[-0.00,1.00],[0.03,1.42],[0.06,1.69],[0.09,1.91],[0.48,0.88],[0.64,1.25],[0.72,1.49],[0.78,1.69],[0.90,0.69],[1.25,0.90],[1.47,1.04],[1.64,1.18]],
  stop: [[0.00,0.00],[-0.68,0.34],[-0.99,0.77],[-1.00,1.10],[-1.02,1.36],[-0.45,1.08],[-0.40,1.48],[-0.32,1.70],[-0.24,1.89],[-0.00,1.00],[0.05,1.42],[0.10,1.69],[0.13,1.92],[0.40,0.85],[0.47,1.25],[0.48,1.50],[0.48,1.71],[0.81,0.63],[0.88,0.93],[0.89,1.13],[0.86,1.31]],
  four: [[0.00,0.00],[-0.48,0.33],[-0.61,0.69],[-0.12,0.80],[0.32,0.75],[-0.50,1.09],[-0.66,1.52],[-0.72,1.79],[-0.75,2.00],[0.00,1.00],[0.03,1.43],[0.07,1.69],[0.12,1.91],[0.43,0.81],[0.63,1.15],[0.73,1.37],[0.82,1.56],[0.80,0.56],[1.16,0.71],[1.38,0.83],[1.56,0.94]],
  three: [[0.00,0.00],[-0.45,0.24],[-0.50,0.56],[0.03,0.70],[0.52,0.75],[-0.52,1.03],[-0.69,1.45],[-0.77,1.71],[-0.81,1.94],[0.00,1.00],[0.04,1.44],[0.09,1.71],[0.13,1.94],[0.42,0.86],[0.70,1.20],[0.84,1.43],[0.96,1.64],[0.77,0.64],[0.81,0.81],[0.62,0.71],[0.47,0.58]],
  three2: [[0.00,0.00],[-0.67,0.23],[-1.16,0.59],[-1.61,0.84],[-2.07,0.98],[-0.53,1.03],[-0.68,1.47],[-0.74,1.73],[-0.78,1.96],[0.00,1.00],[0.26,1.43],[0.45,1.71],[0.63,1.95],[0.45,0.85],[0.59,0.99],[0.29,0.72],[0.09,0.53],[0.81,0.65],[0.86,0.74],[0.56,0.56],[0.34,0.42]],
  one: [[0.00,0.00],[-0.56,0.23],[-0.82,0.61],[-0.57,0.88],[-0.14,1.02],[-0.54,1.06],[-0.57,1.52],[-0.58,1.80],[-0.54,2.03],[0.00,1.00],[0.05,1.24],[-0.13,0.92],[-0.21,0.72],[0.47,0.87],[0.41,0.99],[0.15,0.68],[0.07,0.53],[0.88,0.69],[0.76,0.79],[0.48,0.58],[0.39,0.46]],
  two_up: [[0.00,0.00],[-0.54,0.29],[-0.65,0.66],[-0.19,0.85],[0.28,0.93],[-0.49,1.06],[-0.44,1.48],[-0.36,1.73],[-0.27,1.93],[-0.00,1.00],[0.04,1.46],[0.06,1.74],[0.11,1.98],[0.45,0.84],[0.52,1.07],[0.27,0.84],[0.12,0.66],[0.83,0.61],[0.79,0.79],[0.50,0.65],[0.33,0.51]],
  peace: [[0.00,0.00],[-0.50,0.25],[-0.57,0.59],[-0.10,0.79],[0.35,0.91],[-0.55,1.03],[-0.74,1.44],[-0.83,1.71],[-0.88,1.93],[0.00,1.00],[0.20,1.44],[0.34,1.72],[0.49,1.94],[0.45,0.86],[0.59,1.04],[0.33,0.81],[0.18,0.64],[0.79,0.65],[0.82,0.80],[0.55,0.64],[0.38,0.50]],
  fist: [[0.00,0.00],[-0.47,0.53],[-0.75,1.12],[-0.58,1.33],[-0.21,1.26],[-0.39,1.29],[-0.31,1.52],[-0.38,1.23],[-0.40,1.10],[0.00,1.00],[0.07,1.24],[-0.07,0.90],[-0.10,0.82],[0.35,0.69],[0.43,0.90],[0.23,0.64],[0.18,0.55],[0.71,0.34],[0.72,0.53],[0.54,0.41],[0.48,0.32]],
  thumb_index: [[0.00,0.00],[-0.60,0.44],[-1.12,1.00],[-1.65,1.46],[-2.14,1.75],[-0.48,1.27],[-0.37,1.66],[-0.26,1.90],[-0.15,2.09],[-0.00,1.00],[0.14,1.14],[-0.03,0.83],[-0.15,0.70],[0.44,0.68],[0.50,0.76],[0.27,0.53],[0.12,0.46],[0.82,0.35],[0.86,0.44],[0.62,0.33],[0.47,0.29]],
};

export interface PlaceOptions {
  /** Wrist position, share of width / height. */
  cx?: number;
  cy?: number;
  /** Wrist-to-middle-knuckle length as a share of the frame HEIGHT. */
  span?: number;
  /** Roll of the whole hand in the picture plane, degrees (clockwise). */
  rollDeg?: number;
  /** Video width / height the landmarks are normalised by. 16/9 = the lab camera, 4/3 = the game camera. */
  aspect?: number;
  /** Mirror left-right (the other hand). */
  mirror?: boolean;
}

/** The hand as a camera frame reports it (x / width, y / height). */
export function placeHand(skeleton: Skeleton, opts: PlaceOptions = {}): Landmark[] {
  const { cx = 0.5, cy = 0.8, span = 0.22, rollDeg = 0, aspect = 16 / 9, mirror = false } = opts;
  const roll = (rollDeg * Math.PI) / 180;
  const cos = Math.cos(roll);
  const sin = Math.sin(roll);
  return skeleton.map(([qx, qy]) => {
    // Canonical y grows downwards in the source frame, so the hand points down there: flip it to point up.
    const px = (mirror ? -qx : qx) * span;
    const py = -qy * span;
    const x = px * cos - py * sin;
    const y = px * sin + py * cos;
    return { x: cx + x / aspect, y: cy + y };
  });
}

/**
 * The drawing pinch for the gap sweeps: an index finger up, the other fingers curled (the `one` skeleton), and the
 * thumb tip placed `gap` spans from the index tip, coming in from the thumb side. gap 0.05 = the tips touch.
 */
export function pinchSkeleton(gap: number, approachDeg = 200): Skeleton {
  const base = MEDIAN_SKELETONS.one.map(([x, y]) => [x, y] as [number, number]);
  const tip = base[8]!;
  const rad = (approachDeg * Math.PI) / 180;
  const thumbTip: [number, number] = [tip[0] + Math.cos(rad) * gap, tip[1] + Math.sin(rad) * gap];
  const mcp = base[2]!;
  base[4] = thumbTip;
  base[3] = [mcp[0] + (thumbTip[0] - mcp[0]) * 0.6, mcp[1] + (thumbTip[1] - mcp[1]) * 0.6];
  return base;
}

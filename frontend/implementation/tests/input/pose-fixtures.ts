import type { HandPose } from "@/src/input/hand-gesture";
import type { Landmark } from "@/src/input/types";

/**
 * Synthetic hands for the placement and exploration gestures. `poseHand(pose, dx)` is a 21-point hand with the
 * fingers of that pose (hand span 0.2); `dx` moves the whole hand sideways, so a grabbed object can be followed.
 * tests/game/placement-grab.test.ts checks each pose against the real classifier.
 */
export type FixturePose = Exclude<HandPose, "none" | "fist" | "split-palm">;

export function poseHand(pose: FixturePose, dx = 0): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  lm[0] = { x: 0.5, y: 0.9 };
  const knuckles = [0.45, 0.5, 0.53, 0.57];
  const extended: boolean[] = {
    "open-palm": [true, true, true, true],
    pinch: [true, false, false, false],
    "one-finger": [true, false, false, false],
    "two-fingers": [true, true, false, false],
    "three-fingers": [true, true, true, false],
    "thumb-up": [false, false, false, false],
  }[pose];
  knuckles.forEach((x, i) => {
    const mcp = [5, 9, 13, 17][i]!;
    const pip = [6, 10, 14, 18][i]!;
    const tip = [8, 12, 16, 20][i]!;
    lm[mcp] = { x, y: 0.7 };
    lm[pip] = { x, y: 0.8 };
    lm[tip] = extended[i] ? { x, y: 0.7 } : { x, y: 0.86 };
  });
  // Thumb: tucked away from the index tip, except for the pinch (tip on the index tip) and the thumbs-up (raised).
  lm[2] = { x: 0.36, y: 0.84 };
  lm[3] = { x: 0.37, y: 0.8 };
  lm[4] = { x: 0.36, y: 0.78 };
  if (pose === "pinch") lm[4] = { x: 0.46, y: 0.71 };
  if (pose === "thumb-up") {
    lm[2] = { x: 0.42, y: 0.82 };
    lm[3] = { x: 0.42, y: 0.74 };
    lm[4] = { x: 0.42, y: 0.6 };
  }
  return lm.map((p) => ({ x: p.x + dx, y: p.y }));
}


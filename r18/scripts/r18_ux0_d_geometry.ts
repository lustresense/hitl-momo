/**
 * R18-UX0-D: Zero-GPU baseline audit of Thinman geometry, unintentional pointing (F8),
 * steering zone hysteresis, and JumpAssist behavior in `main` (commit 3ef4cc3).
 */
import { writeFileSync } from "node:fs";
import {
  evaluateGameplayGesture,
  indexPointAngle,
  steerFromAngle,
  steerInput,
  GameplayGestureFilter,
  type SteerZone,
} from "../repo/frontend/implementation/src/input/gameplay-gesture";
import { classifyHandPose, type HandPose } from "../repo/frontend/implementation/src/input/hand-gesture";
import { JumpAssist } from "../repo/frontend/implementation/src/game/jump-assist";
import type { Landmark } from "../repo/frontend/implementation/src/input/types";

function makePointingHand(physicalDeg: number, aspect: number, mirroredView = false): Landmark[] {
  // Construct 21 landmarks centered around (0.5, 0.5) where vector 5->8 points at physicalDeg
  // in pixel space (0 deg = viewer right, 90 deg = up).
  // Remember indexPointAngle uses: dx = base.x - tip.x (mirrored), dy = base.y - tip.y (up).
  const rad = (physicalDeg * Math.PI) / 180;
  const lenPx = 0.25; // normalized by height H
  const dxNorm = (lenPx * Math.cos(rad)) / aspect;
  const dyNorm = lenPx * Math.sin(rad);
  const base = { x: 0.5, y: 0.6 };
  const tip = {
    x: mirroredView ? base.x + dxNorm : base.x - dxNorm,
    y: base.y - dyNorm,
  };
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: base.x, y: base.y + 0.08, z: 0 }));
  lm[0] = { x: base.x, y: base.y + 0.16, z: 0 }; // wrist
  lm[5] = base;
  lm[6] = { x: (base.x + tip.x) / 2, y: (base.y + tip.y) / 2, z: 0 };
  lm[7] = { x: base.x + (tip.x - base.x) * 0.75, y: base.y + (tip.y - base.y) * 0.75, z: 0 };
  lm[8] = tip;
  lm[9] = { x: base.x + 0.02 / aspect, y: base.y, z: 0 };
  return lm;
}

function makeNonPointingPoses(aspect: number): Array<{ name: string; lm: Landmark[] }> {
  // Realistic synthetic poses derived from hand geometry proportions (aspect-corrected)
  const w = { x: 0.5, y: 0.75, z: 0 };
  const span = 0.22;
  const mk = (pts: Record<number, [number, number]>): Landmark[] => {
    const arr: Landmark[] = Array.from({ length: 21 }, (_, i) => ({ x: w.x, y: w.y - 0.05, z: 0 }));
    for (const [k, [dx, dy]] of Object.entries(pts)) {
      arr[Number(k)] = { x: w.x + dx / aspect, y: w.y + dy, z: 0 };
    }
    arr[0] = w;
    return arr;
  };
  return [
    {
      name: "fist_curled_tilted_right",
      lm: mk({
        1: [-0.04, -0.05], 2: [-0.07, -0.10], 3: [-0.06, -0.14], 4: [-0.03, -0.13],
        5: [-0.05, -0.18], 6: [-0.03, -0.22], 7: [-0.01, -0.17], 8: [-0.005, -0.15],
        9: [0.0, -span], 10: [0.0, -0.24], 11: [0.0, -0.17], 12: [0.0, -0.14],
        13: [0.04, -0.20], 14: [0.04, -0.22], 15: [0.04, -0.16], 16: [0.04, -0.13],
        17: [0.08, -0.17], 18: [0.08, -0.19], 19: [0.08, -0.14], 20: [0.08, -0.11],
      }),
    },
    {
      name: "open_palm_vertical",
      lm: mk({
        1: [-0.05, -0.05], 2: [-0.09, -0.10], 3: [-0.13, -0.14], 4: [-0.17, -0.18],
        5: [-0.06, -0.21], 6: [-0.06, -0.30], 7: [-0.06, -0.36], 8: [-0.06, -0.42],
        9: [0.0, -span], 10: [0.0, -0.32], 11: [0.0, -0.39], 12: [0.0, -0.45],
        13: [0.05, -0.20], 14: [0.06, -0.30], 15: [0.07, -0.36], 16: [0.07, -0.42],
        17: [0.10, -0.18], 18: [0.12, -0.26], 19: [0.13, -0.31], 20: [0.14, -0.36],
      }),
    },
    {
      name: "relaxed_natural_hand_30deg",
      lm: mk({
        1: [-0.04, -0.05], 2: [-0.08, -0.09], 3: [-0.10, -0.13], 4: [-0.11, -0.16],
        5: [-0.05, -0.19], 6: [-0.07, -0.24], 7: [-0.09, -0.27], 8: [-0.11, -0.29],
        9: [0.0, -span], 10: [0.0, -0.28], 11: [0.0, -0.31], 12: [0.0, -0.33],
        13: [0.05, -0.19], 14: [0.06, -0.25], 15: [0.06, -0.28], 16: [0.06, -0.30],
        17: [0.09, -0.16], 18: [0.10, -0.22], 19: [0.11, -0.25], 20: [0.11, -0.27],
      }),
    },
    {
      name: "pinch_grab_horizontal",
      lm: mk({
        1: [-0.04, -0.04], 2: [-0.07, -0.09], 3: [-0.09, -0.14], 4: [-0.12, -0.19],
        5: [-0.05, -0.20], 6: [-0.09, -0.22], 7: [-0.11, -0.21], 8: [-0.125, -0.195],
        9: [0.0, -span], 10: [0.01, -0.29], 11: [0.01, -0.35], 12: [0.01, -0.40],
        13: [0.05, -0.20], 14: [0.06, -0.29], 15: [0.06, -0.35], 16: [0.06, -0.40],
        17: [0.09, -0.18], 18: [0.11, -0.25], 19: [0.11, -0.30], 20: [0.12, -0.34],
      }),
    },
  ];
}

// 1. Aspect-ratio angular error & SteerZone mismatch audit
const aspects = [
  { name: "1:1", ratio: 1 },
  { name: "5:4 (600x480)", ratio: 600 / 480 },
  { name: "4:3 (640x480)", ratio: 4 / 3 },
  { name: "16:9 (1280x720)", ratio: 16 / 9 },
  { name: "9:16 portrait", ratio: 9 / 16 },
];
const testAngles = [0, 15, 25, 30, 35, 40, 45, 55, 60, 70, 75, 85, 90, 95, 105, 115, 125, 135, 145, 150, 165, 180, -30, -90];
const aspectResults: Record<string, any> = {};
for (const a of aspects) {
  let maxErrDeg = 0;
  let zoneMismatches = 0;
  const rows = [];
  for (const deg of testAngles) {
    const lm = makePointingHand(deg, a.ratio, false);
    const rawAngle = indexPointAngle(lm)!;
    const expectedZone = steerFromAngle(deg);
    const actualZone = steerFromAngle(rawAngle);
    const diff = Math.abs(((rawAngle - deg + 540) % 360) - 180);
    if (diff > maxErrDeg) maxErrDeg = diff;
    if (actualZone !== expectedZone) zoneMismatches++;
    if (actualZone !== expectedZone || diff > 1) {
      rows.push({ physicalDeg: deg, rawReadDeg: Math.round(rawAngle * 100) / 100, errDeg: Math.round(diff * 100) / 100, expectedZone, actualZone });
    }
  }
  aspectResults[a.name] = { aspect: Math.round(a.ratio * 1000) / 1000, maxErrDeg: Math.round(maxErrDeg * 100) / 100, zoneMismatches, totalTested: testAngles.length, mismatchesAndLargeErrors: rows };
}

// 2. Unintentional pointing (F8) on non-pointing poses
const nonPointingResults = makeNonPointingPoses(16 / 9).map(({ name, lm }) => {
  const pose = classifyHandPose(lm, { experimentalRobust: true, aspect: 16 / 9 });
  const gp = evaluateGameplayGesture(lm);
  return {
    case: name,
    classifiedPose: pose,
    gameplayTracked: gp.tracked,
    rawAngleDeg: gp.angle !== null ? Math.round(gp.angle * 100) / 100 : null,
    emittedInput: gp.input,
    unintentionalAction: gp.input.left || gp.input.right || gp.input.jump,
  };
});

// 3. JumpAssist hold-to-repeat simulation vs one-shot
const ja = new JumpAssist();
let jumpsOnHeld = 0;
const simLog: Array<{ step: number; grounded: boolean; jumpHeld: boolean; fired: boolean }> = [];
// Simulate 120 fixed steps (2.4s at 50Hz): grounded steps 0..4, airborne steps 5..29, landed steps 30..59, airborne 60..84, landed 85..119
for (let s = 0; s < 120; s++) {
  const grounded = s < 5 || (s >= 30 && s < 60) || s >= 85;
  const fired = ja.step(grounded, true);
  if (fired) jumpsOnHeld++;
  if (fired) simLog.push({ step: s, grounded, jumpHeld: true, fired });
}

// 4. GameplayGestureFilter boundary chatter & stop-delay check (29 deg <-> 33 deg)
const filter = new GameplayGestureFilter();
const boundaryTrace: Array<{ frame: number; deg: number; input: any }> = [];
// Warm up 3 frames in stop zone (-90 deg)
for (let f = 0; f < 3; f++) filter.update(makePointingHand(-90, 1), f * 33);
const seq = [28, 32, 34, 36, 32, 28, -45];
seq.forEach((deg, idx) => {
  const res = filter.update(makePointingHand(deg, 1), (idx + 3) * 33);
  boundaryTrace.push({ frame: idx + 3, deg, input: res.input });
});

const out = {
  commit: "3ef4cc3685fc64bce729c5ae54bc29689f6d3446",
  aspect_ratio_steering_audit: aspectResults,
  unintentional_pointing_f8: nonPointingResults,
  jump_assist_held_repeat_2_4s: { jumpsFiredWhileHeld: jumpsOnHeld, events: simLog },
  gameplay_filter_boundary_trace: boundaryTrace,
};
writeFileSync("/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/results/r18_ux0_d_geometry.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

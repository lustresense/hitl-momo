/**
 * R19 Stage P2 Evaluation Suite: `G0_main` vs `R18_UX1` vs `G1_pistol`
 *
 * Evaluates:
 *  (a) Multi-aspect sweep (1:1, 5:4, 4:3, 16:9, 9:16) for angle accuracy & fingerStates bug
 *  (b) SYNTHETIC 3D->2D rotated/pitched/rolled hand suite (Palmar & Dorsal, Left & Right,
 *      0..180 deg, pitch -40..+40, roll -35..+35) including Dorsal Right-Hand Pointing Left (O0/O1)
 *  (c) SYNTHETIC dynamic transition sequences + 50 Hz JumpAssist + 100 ms InputArbiter physics
 *      loop across 60 Hz / 30 Hz / 15 Hz comparing J1_hold, J2_edge_single, and J3_pulse_consumed
 *  (d) Cached offline real MediaPipe distractor hands from Mendeley (`ux3_mendeley_distractor_landmarks.json`)
 *
 * Writes `g0_g1_eval.json` and `g0_g1_eval.md` inside `/srv/sketchbook/mediapipe-optimize/r19-sandbox/g1_geom/`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  GameplayGestureFilter,
  evaluateGameplayGesture,
  steerFromAngle,
} from "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/repo/frontend/implementation/src/input/gameplay-gesture";
import {
  classifyHandPose,
  countExtendedFingers,
  fingerDiagnosticStates,
} from "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/repo/frontend/implementation/src/input/hand-gesture";
import { InputArbiter } from "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/repo/frontend/implementation/src/input/arbiter";
import { JumpAssist } from "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/repo/frontend/implementation/src/game/jump-assist";
import type { Landmark } from "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/repo/frontend/implementation/src/input/types";
import {
  VirtualKeySteeringFSM,
  indexPointAngleAspect as ux1IndexAngleAspect,
  isIntentionalPointing,
} from "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/candidates/ux1_candidates";
import {
  classifyPistolGeometry,
  fingerDiagnosticStatesAspect,
  indexPointAngleAspect,
  pistolGeometryMetrics,
  type PistolGeometricState,
} from "../candidates/pistol_geometry";
import { PistolVirtualKeyFSM, type PistolJumpPolicy } from "../candidates/pistol_fsm";

const OUT_DIR = "/srv/sketchbook/mediapipe-optimize/research-can/r19/results";
const DISTRACTOR_JSON =
  "/srv/sketchbook/mediapipe-optimize/research-can/r18/results/ux3_mendeley_distractor_landmarks.json";

type Vec3 = { x: number; y: number; z: number };

type SyntheticPoseKind =
  | "POINT_READY_across"
  | "POINT_READY_along"
  | "POINT_PRESS_std"
  | "POINT_PRESS_dorsal_short"
  | "PinchTouch_ok"
  | "PinchTouch_closed"
  | "PinchNear_straight"
  | "PinchNear_arched"
  | "ThumbUp"
  | "VSign_tucked"
  | "VSign_thumb_open"
  | "Three"
  | "Four"
  | "OpenPalm"
  | "Fist";

function expectedG1State(kind: SyntheticPoseKind): PistolGeometricState {
  if (kind === "POINT_READY_across" || kind === "POINT_READY_along") return "POINT_READY";
  if (kind === "POINT_PRESS_std" || kind === "POINT_PRESS_dorsal_short") return "POINT_PRESS";
  return "OTHER";
}

function expectedG1Family(kind: SyntheticPoseKind): string {
  switch (kind) {
    case "POINT_READY_across":
    case "POINT_READY_along":
      return "POINT_READY";
    case "POINT_PRESS_std":
    case "POINT_PRESS_dorsal_short":
      return "POINT_PRESS";
    case "PinchTouch_ok":
    case "PinchTouch_closed":
    case "PinchNear_straight":
    case "PinchNear_arched":
      return "pinch";
    case "ThumbUp":
      return "thumb-up";
    case "VSign_tucked":
    case "VSign_thumb_open":
      return "two-fingers";
    case "Three":
      return "three";
    case "Four":
      return "four";
    case "OpenPalm":
      return "five";
    case "Fist":
      return "fist";
  }
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function gauss(rng: () => number): number {
  const u1 = Math.max(1e-7, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function straightFinger(mcp: Vec3, splayX: number, lengths: [number, number, number], spreadScale = 1): [Vec3, Vec3, Vec3] {
  const [l1, l2, l3] = lengths;
  const sx = splayX * spreadScale;
  const pip = { x: mcp.x + sx * 0.4, y: mcp.y + l1, z: mcp.z };
  const dip = { x: pip.x + sx * 0.35, y: pip.y + l2, z: pip.z };
  const tip = { x: dip.x + sx * 0.25, y: dip.y + l3, z: dip.z };
  return [pip, dip, tip];
}

function curledFinger(mcp: Vec3, splayX: number): [Vec3, Vec3, Vec3] {
  const pip = { x: mcp.x + splayX * 0.15, y: mcp.y + 0.24, z: mcp.z + 0.16 };
  const dip = { x: mcp.x + splayX * 0.05, y: mcp.y + 0.08, z: mcp.z + 0.34 };
  const tip = { x: mcp.x, y: mcp.y - 0.14, z: mcp.z + 0.28 };
  return [pip, dip, tip];
}

/**
 * Articulated 3D->2D synthetic hand generator (canonical Right Palmar hand ->
 * handedness mirror -> dorsal flip -> roll -> pitch -> 2D pointing angle -> raw aspect-scaled [0..1]).
 */
function makeSynthetic3DHand(opts: {
  pose: SyntheticPoseKind;
  handedness: "left" | "right";
  view: "palmar" | "dorsal";
  thetaDeg: number;
  rollDeg: number;
  pitchDeg: number;
  aspect: number;
  scale?: number;
  jitterSigma?: number;
  rng?: () => number;
}): Landmark[] {
  const pts: Vec3[] = new Array(21);
  pts[0] = { x: 0, y: 0, z: 0 };
  pts[5] = { x: 0.30, y: 0.92, z: 0 };
  pts[9] = { x: 0.00, y: 1.00, z: 0 };
  pts[13] = { x: -0.22, y: 0.94, z: 0 };
  pts[17] = { x: -0.42, y: 0.82, z: 0 };
  pts[1] = { x: 0.26, y: 0.24, z: 0.04 };
  pts[2] = { x: 0.44, y: 0.52, z: 0.07 };

  const setFinger = (baseIdx: number, segs: [Vec3, Vec3, Vec3]) => {
    pts[baseIdx + 1] = segs[0];
    pts[baseIdx + 2] = segs[1];
    pts[baseIdx + 3] = segs[2];
  };

  // Defaults: all curled, thumb folded across palm.
  setFinger(5, curledFinger(pts[5]!, 0.05));
  setFinger(9, curledFinger(pts[9]!, 0));
  setFinger(13, curledFinger(pts[13]!, -0.05));
  setFinger(17, curledFinger(pts[17]!, -0.10));
  pts[3] = { x: 0.24, y: 0.74, z: 0.16 };
  pts[4] = { x: 0.04, y: 0.80, z: 0.22 };

  const idxLen: [number, number, number] = [0.42, 0.28, 0.24];
  const midLen: [number, number, number] = [0.45, 0.31, 0.26];
  const ringLen: [number, number, number] = [0.42, 0.29, 0.24];
  const pinkyLen: [number, number, number] = [0.34, 0.23, 0.20];

  switch (opts.pose) {
    case "POINT_READY_across":
      setFinger(5, straightFinger(pts[5]!, 0.0, idxLen));
      break;
    case "POINT_READY_along":
      setFinger(5, straightFinger(pts[5]!, 0.0, idxLen));
      pts[2] = { x: 0.42, y: 0.52, z: 0.05 };
      pts[3] = { x: 0.40, y: 0.82, z: 0.06 };
      pts[4] = { x: 0.36, y: 1.12, z: 0.06 };
      break;
    case "POINT_PRESS_std":
      setFinger(5, straightFinger(pts[5]!, 0.0, idxLen));
      pts[3] = { x: 0.76, y: 0.72, z: 0.11 };
      pts[4] = { x: 1.06, y: 0.88, z: 0.14 };
      break;
    case "POINT_PRESS_dorsal_short":
      // Partial thumb shortening / Z-tilt on dorsal hand while still clearly open L-sign
      setFinger(5, straightFinger(pts[5]!, 0.0, idxLen));
      pts[3] = { x: 0.64, y: 0.68, z: -0.18 };
      pts[4] = { x: 0.84, y: 0.84, z: -0.26 };
      break;
    case "PinchTouch_ok":
      pts[6] = { x: 0.34, y: 1.24, z: 0.14 };
      pts[7] = { x: 0.42, y: 1.36, z: 0.22 };
      pts[8] = { x: 0.44, y: 1.38, z: 0.28 };
      pts[3] = { x: 0.50, y: 0.94, z: 0.20 };
      pts[4] = { x: 0.48, y: 1.21, z: 0.26 };
      setFinger(9, straightFinger(pts[9]!, 0.02, midLen));
      setFinger(13, straightFinger(pts[13]!, -0.06, ringLen));
      setFinger(17, straightFinger(pts[17]!, -0.14, pinkyLen));
      break;
    case "PinchTouch_closed":
      pts[6] = { x: 0.34, y: 1.24, z: 0.14 };
      pts[7] = { x: 0.42, y: 1.36, z: 0.22 };
      pts[8] = { x: 0.44, y: 1.38, z: 0.28 };
      pts[3] = { x: 0.50, y: 0.94, z: 0.20 };
      pts[4] = { x: 0.48, y: 1.21, z: 0.26 };
      break;
    case "PinchNear_straight":
      // Near pinch (dist(4,8) ~ 0.35) where index is relatively straight (breaks R18 P2_balanced)
      pts[6] = { x: 0.32, y: 1.32, z: 0.08 };
      pts[7] = { x: 0.35, y: 1.56, z: 0.16 };
      pts[8] = { x: 0.38, y: 1.76, z: 0.22 };
      pts[3] = { x: 0.54, y: 1.04, z: 0.18 };
      pts[4] = { x: 0.52, y: 1.44, z: 0.22 };
      break;
    case "PinchNear_arched":
      pts[6] = { x: 0.34, y: 1.26, z: 0.12 };
      pts[7] = { x: 0.40, y: 1.44, z: 0.20 };
      pts[8] = { x: 0.44, y: 1.54, z: 0.26 };
      pts[3] = { x: 0.52, y: 0.96, z: 0.18 };
      pts[4] = { x: 0.52, y: 1.20, z: 0.22 };
      break;
    case "ThumbUp":
      // Fist with thumb sticking out radially (oriented pointing UP in screen space)
      pts[3] = { x: 0.72, y: 0.78, z: 0.08 };
      pts[4] = { x: 1.04, y: 0.96, z: 0.10 };
      break;
    case "VSign_tucked":
      setFinger(5, straightFinger(pts[5]!, 0.12, idxLen));
      setFinger(9, straightFinger(pts[9]!, -0.10, midLen));
      break;
    case "VSign_thumb_open":
      setFinger(5, straightFinger(pts[5]!, 0.12, idxLen));
      setFinger(9, straightFinger(pts[9]!, -0.10, midLen));
      pts[3] = { x: 0.76, y: 0.72, z: 0.11 };
      pts[4] = { x: 1.06, y: 0.88, z: 0.14 };
      break;
    case "Three":
      setFinger(5, straightFinger(pts[5]!, 0.12, idxLen));
      setFinger(9, straightFinger(pts[9]!, 0.0, midLen));
      setFinger(13, straightFinger(pts[13]!, -0.12, ringLen));
      break;
    case "Four":
      setFinger(5, straightFinger(pts[5]!, 0.12, idxLen));
      setFinger(9, straightFinger(pts[9]!, 0.02, midLen));
      setFinger(13, straightFinger(pts[13]!, -0.08, ringLen));
      setFinger(17, straightFinger(pts[17]!, -0.18, pinkyLen));
      break;
    case "OpenPalm":
      setFinger(5, straightFinger(pts[5]!, 0.14, idxLen));
      setFinger(9, straightFinger(pts[9]!, 0.02, midLen));
      setFinger(13, straightFinger(pts[13]!, -0.08, ringLen));
      setFinger(17, straightFinger(pts[17]!, -0.18, pinkyLen));
      pts[3] = { x: 0.76, y: 0.72, z: 0.11 };
      pts[4] = { x: 1.06, y: 0.88, z: 0.14 };
      break;
    case "Fist":
      pts[3] = { x: 0.28, y: 0.80, z: 0.26 };
      pts[4] = { x: 0.08, y: 0.88, z: 0.32 };
      break;
  }

  const handSign = opts.handedness === "left" ? -1 : 1;
  const dorsalSign = opts.view === "dorsal" ? -1 : 1;
  const rollRad = (opts.rollDeg * Math.PI) / 180;
  const pitchRad = (opts.pitchDeg * Math.PI) / 180;
  const thetaRad = (opts.thetaDeg * Math.PI) / 180;
  const scale = opts.scale ?? 0.14;
  const center = { x: 0.5, y: 0.62 };
  const sigma = (opts.jitterSigma ?? 0) * scale;

  const cosR = Math.cos(rollRad);
  const sinR = Math.sin(rollRad);
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);
  const cosT = Math.cos(thetaRad);
  const sinT = Math.sin(thetaRad);

  return pts.map((p) => {
    // 1. Handedness mirror + Dorsal 180-deg flip around longitudinal Y axis
    const hx0 = p.x * handSign * dorsalSign;
    const hy0 = p.y;
    const hz0 = p.z * dorsalSign;

    // 2. Roll around Y
    const hx1 = hx0 * cosR + hz0 * sinR;
    const hz1 = -hx0 * sinR + hz0 * cosR;
    const hy1 = hy0;

    // 3. Pitch around X
    const hy2 = hy1 * cosP - hz1 * sinP;
    const hz2 = hy1 * sinP + hz1 * cosP;
    const hx2 = hx1;

    // 4. 2D rotation in mirrored screen space (0 deg = right, 90 deg = up)
    const mx = center.x + scale * (-hx2 * sinT + hy2 * cosT) + (sigma > 0 && opts.rng ? gauss(opts.rng) * sigma : 0);
    const my = center.y + scale * (-hx2 * cosT - hy2 * sinT) + (sigma > 0 && opts.rng ? gauss(opts.rng) * sigma : 0);

    // 5. Convert isotropic mirrored preview coord -> raw aspect-compressed MediaPipe [0..1]
    const rawX = 1 - (0.5 + (mx - 0.5) / opts.aspect);
    const rawY = my;
    return { x: rawX, y: rawY, z: hz2 * scale };
  });
}

// =========================================================================
// (a) Aspect Sweep (1:1, 5:4, 4:3, 16:9, 9:16)
// =========================================================================
function evalAspectSweep() {
  const aspects = [
    { name: "1:1", r: 1 },
    { name: "5:4", r: 5 / 4 },
    { name: "4:3", r: 4 / 3 },
    { name: "16:9", r: 16 / 9 },
    { name: "9:16", r: 9 / 16 },
  ];
  const angles = [-165, -136, -90, -34, 0, 15, 25, 34, 46, 55, 60, 70, 74, 76, 85, 90, 95, 104, 106, 115, 125, 134, 146, 165, 179];
  const perAspect: Record<string, any> = {};

  for (const a of aspects) {
    let g0MaxErr = 0, ux1MaxErr = 0, g1MaxErr = 0;
    let g0Mismatch = 0, ux1Mismatch = 0, g1Mismatch = 0;
    let g0FingerBugMismatch = 0, g1FingerAspectMismatch = 0;
    let g0ClassifyFail = 0, ux1Fail = 0, g1PressPass = 0;
    let total = 0;

    for (const view of ["palmar", "dorsal"] as const) {
      for (const handedness of ["left", "right"] as const) {
        for (const deg of angles) {
          total++;
          const lm = makeSynthetic3DHand({
            pose: "POINT_PRESS_std",
            handedness,
            view,
            thetaDeg: deg,
            rollDeg: 0,
            pitchDeg: 0,
            aspect: a.r,
          });
          const g0 = evaluateGameplayGesture(lm);
          const u1Ang = ux1IndexAngleAspect(lm, a.r)!;
          const g1Cls = classifyPistolGeometry(lm, a.r);

          const angErr = (est: number | null) =>
            est === null ? 180 : Math.abs(((est - deg + 540) % 360) - 180);

          g0MaxErr = Math.max(g0MaxErr, angErr(g0.angle));
          ux1MaxErr = Math.max(ux1MaxErr, angErr(u1Ang));
          g1MaxErr = Math.max(g1MaxErr, angErr(g1Cls.angle));

          const expZone = steerFromAngle(deg);
          if (g0.angle === null || steerFromAngle(g0.angle) !== expZone) g0Mismatch++;
          if (steerFromAngle(u1Ang) !== expZone) ux1Mismatch++;
          if (g1Cls.angle === null || steerFromAngle(g1Cls.angle) !== expZone) g1Mismatch++;

          // Check fingerStates aspect bug in hand-gesture.ts vs fingerDiagnosticStatesAspect
          // on a dorsal/rolled curled-middle hand where PIP lies horizontally and tip curls perpendicularly!
          const rollBugLm = makeSynthetic3DHand({
            pose: "POINT_PRESS_std",
            handedness,
            view,
            thetaDeg: deg,
            rollDeg: 35,
            pitchDeg: 25,
            aspect: a.r,
          });
          // Simulate slight relaxed dorsal middle curl toward palm-normal (stays curled in isotropic space)
          const rawFs = fingerDiagnosticStates(rollBugLm);
          const aspFs = fingerDiagnosticStatesAspect(rollBugLm, a.r);
          if (!rawFs || rawFs[0] !== "extended" || rawFs[1] !== "curled" || rawFs[2] !== "curled" || rawFs[3] !== "curled") {
            g0FingerBugMismatch++;
          }
          if (!aspFs || aspFs[0] !== "extended" || aspFs[1] !== "curled" || aspFs[2] !== "curled" || aspFs[3] !== "curled") {
            g1FingerAspectMismatch++;
          }

          if (classifyHandPose(lm) !== "one-finger") g0ClassifyFail++;
          if (!isIntentionalPointing(lm, "P2_balanced", a.r).ok) ux1Fail++;
          if (g1Cls.state === "POINT_PRESS") g1PressPass++;
        }
      }
    }

    // Explicit horizontal-PIP vs vertical-curled-tip aspect distortion test (16:9 / 9:16 bug proof)
    const aspBugLm = makeSynthetic3DHand({
      pose: "POINT_PRESS_std",
      handedness: "right",
      view: "dorsal",
      thetaDeg: 180,
      rollDeg: 0,
      pitchDeg: 0,
      aspect: a.r,
    });
    // Place middle PIP horizontally away from wrist and middle tip curled vertically away from palm line
    // (isotropic distances: pip=1.0*scale, tip=0.88*scale -> curled; raw on 16:9 shrinks horizontal pip!)
    const s = 0.14;
    const w = aspBugLm[0]!;
    const setIso = (idx: number, dxIso: number, dyIso: number) => {
      aspBugLm[idx] = { x: w.x - dxIso / a.r, y: w.y + dyIso, z: 0 };
    };
    setIso(10, -0.95 * s, 0.05 * s); // PIP horizontal dist = 0.95*s
    setIso(11, -0.55 * s, 0.60 * s);
    setIso(12, -0.20 * s, 0.78 * s); // Tip isotropic dist = hypot(0.20, 0.78)*s = 0.805*s < 0.95*s (CURLED!)
    const bugRawFs = fingerDiagnosticStates(aspBugLm);
    const bugAspFs = fingerDiagnosticStatesAspect(aspBugLm, a.r);
    if (!bugRawFs || bugRawFs[1] !== "curled") g0FingerBugMismatch++;
    if (!bugAspFs || bugAspFs[1] !== "curled") g1FingerAspectMismatch++;

    perAspect[a.name] = {
      samples: total,
      G0_main: {
        max_angle_err_deg: Math.round(g0MaxErr * 100) / 100,
        zone_mismatches: g0Mismatch,
        raw_fingerStates_bug_errors: g0FingerBugMismatch,
        pose_not_one_finger_count: g0ClassifyFail,
      },
      R18_UX1: {
        max_angle_err_deg: Math.round(ux1MaxErr * 100) / 100,
        zone_mismatches: ux1Mismatch,
        pointing_rejected: ux1Fail,
      },
      G1_pistol: {
        max_angle_err_deg: Math.round(g1MaxErr * 100) / 100,
        zone_mismatches: g1Mismatch,
        aspect_fingerStates_errors: g1FingerAspectMismatch,
        point_press_recall_pct: Math.round((10000 * g1PressPass) / total) / 100,
      },
    };
  }
  return perAspect;
}

// =========================================================================
// (b) SYNTHETIC 3D->2D Rotated/Pitched/Rolled Suite (incl. Dorsal Right Pointing Left)
// =========================================================================
function evalSynthetic3DSuite() {
  const rng = makeRng(20261118);
  const aspect = 16 / 9;
  const views: Array<"palmar" | "dorsal"> = ["palmar", "dorsal"];
  const hands: Array<"left" | "right"> = ["left", "right"];
  const thetas = [0, 20, 55, 90, 125, 160, 180];
  const rolls = [-35, -18, 0, 18, 35];
  const pitches = [-40, -20, 0, 20, 40];
  const poses: SyntheticPoseKind[] = [
    "POINT_READY_across",
    "POINT_READY_along",
    "POINT_PRESS_std",
    "POINT_PRESS_dorsal_short",
    "PinchTouch_ok",
    "PinchTouch_closed",
    "PinchNear_straight",
    "PinchNear_arched",
    "ThumbUp",
    "VSign_tucked",
    "VSign_thumb_open",
    "Three",
    "Four",
    "OpenPalm",
    "Fist",
  ];

  type PoseStats = {
    n: number;
    g0_steer_active: number;
    g0_pose_counts: Record<string, number>;
    g0_cnt2_collision: number;
    ux1_pointing_ok: number;
    g1_ready: number;
    g1_press: number;
    g1_other: number;
    g1_exact_state: number;
    g1_exact_family: number;
    g1_subClass_counts: Record<string, number>;
    g1_fail_samples: Array<Record<string, unknown>>;
  };
  const byPose: Record<string, PoseStats> = {};
  const initStats = (): PoseStats => ({
    n: 0,
    g0_steer_active: 0,
    g0_pose_counts: {},
    g0_cnt2_collision: 0,
    ux1_pointing_ok: 0,
    g1_ready: 0,
    g1_press: 0,
    g1_other: 0,
    g1_exact_state: 0,
    g1_exact_family: 0,
    g1_subClass_counts: {},
    g1_fail_samples: [],
  });

  // Dedicated Dorsal Right-Hand Pointing Left (O0/O1) tracker
  const dorsalRightLeft = {
    n_press_std: 0,
    g0_press_std_one_finger: 0,
    g0_press_std_two_fingers_redo: 0,
    g0_press_std_thumb_lateral_ok: 0,
    ux1_press_std_ok: 0,
    g1_press_std_ok: 0,
    n_press_short: 0,
    g0_press_short_one_finger: 0,
    g0_press_short_pinch_false: 0,
    g1_press_short_ok: 0,
    g1_press_short_pinch_false: 0,
    n_ready: 0,
    g0_ready_steer_false: 0,
    ux1_ready_steer_false: 0,
    g1_ready_exact: 0,
    g1_ready_false_press: 0,
  };

  // Extra O0/O1 edge stress: tip 4 projected near 5/6 while tip 8 extends far left
  const dorsalOverlapEdgeCases = [
    { name: "tip4_over_5_dorsal_left", d45: 0.14, expectPinch: false },
    { name: "tip4_over_6_dorsal_left", d45: 0.34, expectPinch: false },
  ];
  const overlapResults: Record<string, any> = {};
  for (const ov of dorsalOverlapEdgeCases) {
    const lm = makeSynthetic3DHand({
      pose: "POINT_READY_along",
      handedness: "right",
      view: "dorsal",
      thetaDeg: 180,
      rollDeg: 25,
      pitchDeg: 20,
      aspect,
    });
    // Nudge landmark 4 near 5 or 6 along index direction
    const p5 = lm[5]!;
    const p6 = lm[6]!;
    const t = ov.d45 <= 0.2 ? 0.25 : 0.85;
    lm[4] = { x: p5.x + (p6.x - p5.x) * t, y: p5.y + (p6.y - p5.y) * t - 0.01, z: 0 };
    const g0Pose = classifyHandPose(lm);
    const g1Cls = classifyPistolGeometry(lm, aspect);
    overlapResults[ov.name] = {
      g0_pose: g0Pose,
      g1_state: g1Cls.state,
      g1_subClass: g1Cls.subClass,
      d4_5: g1Cls.metrics ? Math.round(g1Cls.metrics.d4_5 * 1000) / 1000 : null,
      d4_8: g1Cls.metrics ? Math.round(g1Cls.metrics.d4_8 * 1000) / 1000 : null,
      false_pinch: g1Cls.subClass === "pinch",
    };
  }

  for (const pose of poses) {
    const st = (byPose[pose] = initStats());
    const expState = expectedG1State(pose);
    const expFamily = expectedG1Family(pose);

    for (const view of views) {
      for (const handedness of hands) {
        for (const thetaDeg of thetas) {
          // For ThumbUp, physically align thumb pointing UP in screen space (when palm/dorsal upright: theta ~ 0 right-palmar, 180 right-dorsal)
          // Note: rotating ThumbUp through 0..180 rotates thumb orientation too; keep ThumbUp angles where thumb points upward!
          const effectiveTheta =
            pose === "ThumbUp"
              ? handedness === "right"
                ? view === "palmar"
                  ? ((thetaDeg % 50) - 25)
                  : (180 + ((thetaDeg % 50) - 25))
                : view === "palmar"
                  ? (180 + ((thetaDeg % 50) - 25))
                  : ((thetaDeg % 50) - 25)
              : thetaDeg;

          for (const rollDeg of rolls) {
            for (const pitchDeg of pitches) {
              const lm = makeSynthetic3DHand({
                pose,
                handedness,
                view,
                thetaDeg: effectiveTheta,
                rollDeg,
                pitchDeg,
                aspect,
                jitterSigma: 0.004,
                rng,
              });

              st.n++;
              const g0Eval = evaluateGameplayGesture(lm);
              const g0Pose = classifyHandPose(lm);
              const g0Cnt = countExtendedFingers(lm);
              const ux1Pt = isIntentionalPointing(lm, "P2_balanced", aspect);
              const g1Cls = classifyPistolGeometry(lm, aspect);

              if (g0Eval.input.left || g0Eval.input.right || g0Eval.input.jump) st.g0_steer_active++;
              st.g0_pose_counts[g0Pose] = (st.g0_pose_counts[g0Pose] ?? 0) + 1;
              if (g0Cnt === 2) st.g0_cnt2_collision++;
              if (ux1Pt.ok) st.ux1_pointing_ok++;

              if (g1Cls.state === "POINT_READY") st.g1_ready++;
              else if (g1Cls.state === "POINT_PRESS") st.g1_press++;
              else st.g1_other++;

              if (g1Cls.state === expState) st.g1_exact_state++;
              const gotFamily = g1Cls.state === "OTHER" ? g1Cls.subClass : g1Cls.state;
              if (gotFamily === expFamily) st.g1_exact_family++;
              st.g1_subClass_counts[g1Cls.subClass] = (st.g1_subClass_counts[g1Cls.subClass] ?? 0) + 1;

              if (g1Cls.state !== expState && st.g1_fail_samples.length < 5) {
                st.g1_fail_samples.push({
                  view,
                  handedness,
                  thetaDeg: effectiveTheta,
                  rollDeg,
                  pitchDeg,
                  gotState: g1Cls.state,
                  gotSubClass: g1Cls.subClass,
                  reason: g1Cls.reason,
                  d4_5: g1Cls.metrics ? Math.round(g1Cls.metrics.d4_5 * 1000) / 1000 : null,
                  d4_9: g1Cls.metrics ? Math.round(g1Cls.metrics.d4_9 * 1000) / 1000 : null,
                  d4_8: g1Cls.metrics ? Math.round(g1Cls.metrics.d4_8 * 1000) / 1000 : null,
                  perp: g1Cls.metrics ? Math.round(g1Cls.metrics.thumbPerpFromIndexRay * 1000) / 1000 : null,
                  a854: g1Cls.metrics ? Math.round(g1Cls.metrics.thumbAbduction854Deg * 10) / 10 : null,
                  a524: g1Cls.metrics ? Math.round(g1Cls.metrics.thumbAbduction524Deg * 10) / 10 : null,
                  a234: g1Cls.metrics ? Math.round(g1Cls.metrics.thumbAngle234Deg * 10) / 10 : null,
                });
              }

              // Track Dorsal Right-Hand Pointing Left slice (O0/O1)
              const isDorsalRightLeft =
                handedness === "right" && view === "dorsal" && (thetaDeg === 160 || thetaDeg === 180);
              if (isDorsalRightLeft) {
                if (pose === "POINT_PRESS_std") {
                  dorsalRightLeft.n_press_std++;
                  if (g0Pose === "one-finger") dorsalRightLeft.g0_press_std_one_finger++;
                  if (g0Pose === "two-fingers") dorsalRightLeft.g0_press_std_two_fingers_redo++;
                  if (g1Cls.metrics?.thumbLateralLegacy !== null && (g1Cls.metrics?.thumbLateralLegacy ?? 0) >= 1.3) {
                    dorsalRightLeft.g0_press_std_thumb_lateral_ok++;
                  }
                  if (ux1Pt.ok) dorsalRightLeft.ux1_press_std_ok++;
                  if (g1Cls.state === "POINT_PRESS") dorsalRightLeft.g1_press_std_ok++;
                } else if (pose === "POINT_PRESS_dorsal_short") {
                  dorsalRightLeft.n_press_short++;
                  if (g0Pose === "one-finger") dorsalRightLeft.g0_press_short_one_finger++;
                  if (g0Pose === "pinch") dorsalRightLeft.g0_press_short_pinch_false++;
                  if (g1Cls.state === "POINT_PRESS") dorsalRightLeft.g1_press_short_ok++;
                  if (g1Cls.subClass === "pinch") dorsalRightLeft.g1_press_short_pinch_false++;
                } else if (pose === "POINT_READY_across" || pose === "POINT_READY_along") {
                  dorsalRightLeft.n_ready++;
                  if (g0Eval.input.left || g0Eval.input.right || g0Eval.input.jump) dorsalRightLeft.g0_ready_steer_false++;
                  if (ux1Pt.ok) dorsalRightLeft.ux1_ready_steer_false++;
                  if (g1Cls.state === "POINT_READY") dorsalRightLeft.g1_ready_exact++;
                  if (g1Cls.state === "POINT_PRESS") dorsalRightLeft.g1_ready_false_press++;
                }
              }
            }
          }
        }
      }
    }
  }

  const pct = (a: number, b: number) => (b > 0 ? Math.round((10000 * a) / b) / 100 : 0);

  let totalSamples = 0;
  let totalExactState = 0;
  let totalExactFamily = 0;
  let totalReadySamples = 0, totalReadyCorrect = 0, totalReadyFalsePress = 0;
  let totalPressSamples = 0, totalPressCorrect = 0;
  let totalOtherSamples = 0, totalOtherFalsePressG1 = 0, totalOtherFalseSteerG0 = 0, totalOtherFalseSteerUx1 = 0;

  const summaryPerPose: Record<string, any> = {};
  for (const pose of poses) {
    const st = byPose[pose]!;
    const expState = expectedG1State(pose);
    totalSamples += st.n;
    totalExactState += st.g1_exact_state;
    totalExactFamily += st.g1_exact_family;
    if (expState === "POINT_READY") {
      totalReadySamples += st.n;
      totalReadyCorrect += st.g1_ready;
      totalReadyFalsePress += st.g1_press;
    } else if (expState === "POINT_PRESS") {
      totalPressSamples += st.n;
      totalPressCorrect += st.g1_press;
    } else {
      totalOtherSamples += st.n;
      totalOtherFalsePressG1 += st.g1_press;
      totalOtherFalseSteerG0 += st.g0_steer_active;
      totalOtherFalseSteerUx1 += st.ux1_pointing_ok;
    }
    summaryPerPose[pose] = {
      samples: st.n,
      expected_state: expState,
      expected_family: expectedG1Family(pose),
      G0_steer_pct: pct(st.g0_steer_active, st.n),
      G0_cnt2_collision_pct: pct(st.g0_cnt2_collision, st.n),
      G0_pose_counts: st.g0_pose_counts,
      R18_UX1_pointing_pct: pct(st.ux1_pointing_ok, st.n),
      G1_ready_pct: pct(st.g1_ready, st.n),
      G1_press_pct: pct(st.g1_press, st.n),
      G1_other_pct: pct(st.g1_other, st.n),
      G1_exact_state_pct: pct(st.g1_exact_state, st.n),
      G1_exact_family_pct: pct(st.g1_exact_family, st.n),
      G1_subClass_counts: st.g1_subClass_counts,
      G1_fail_samples: st.g1_fail_samples,
    };
  }

  return {
    evidence_tier: "SYNTHETIC",
    total_samples: totalSamples,
    overall: {
      G1_3class_accuracy_pct: pct(totalExactState, totalSamples),
      G1_subclass_family_accuracy_pct: pct(totalExactFamily, totalSamples),
      POINT_READY_recall_pct: pct(totalReadyCorrect, totalReadySamples),
      POINT_READY_false_press_pct: pct(totalReadyFalsePress, totalReadySamples),
      POINT_PRESS_recall_pct: pct(totalPressCorrect, totalPressSamples),
      OTHER_false_press_G1_pct: pct(totalOtherFalsePressG1, totalOtherSamples),
      OTHER_false_steer_R18_UX1_pct: pct(totalOtherFalseSteerUx1, totalOtherSamples),
      OTHER_false_steer_G0_main_pct: pct(totalOtherFalseSteerG0, totalOtherSamples),
    },
    dorsal_right_pointing_left_O0_O1: {
      ...dorsalRightLeft,
      g1_press_std_pct: pct(dorsalRightLeft.g1_press_std_ok, dorsalRightLeft.n_press_std),
      g1_press_short_pct: pct(dorsalRightLeft.g1_press_short_ok, dorsalRightLeft.n_press_short),
      g1_ready_exact_pct: pct(dorsalRightLeft.g1_ready_exact, dorsalRightLeft.n_ready),
      g0_thumb_lateral_std_pct: pct(dorsalRightLeft.g0_press_std_thumb_lateral_ok, dorsalRightLeft.n_press_std),
      overlap_edge_cases: overlapResults,
    },
    per_pose: summaryPerPose,
  };
}

// =========================================================================
// (c) Dynamic Synthetic Sequences + 50 Hz JumpAssist + 100 ms InputArbiter
// =========================================================================
function simulateRightJumpRightPhysics(opts: {
  controller: "G0_main" | "R18_UX1_J1" | "R18_UX1_J2" | "G1_J1" | "G1_J2" | "G1_J3";
  fps: number;
  aspect: number;
  withRePress?: boolean;
}) {
  let nowMs = 0;
  const dtCamMs = 1000 / opts.fps;
  const arbiter = new InputArbiter("gameplay", () => nowMs);
  arbiter.dispatch({ type: "set-hand-enabled", enabled: true });

  const g0Filter = new GameplayGestureFilter();
  const ux1Fsm =
    opts.controller === "R18_UX1_J1" || opts.controller === "R18_UX1_J2"
      ? new VirtualKeySteeringFSM({
          pointingPolicy: "P2_balanced",
          jumpPolicy: opts.controller === "R18_UX1_J1" ? "J1_hold" : "J2_edge",
          aspect: opts.aspect,
          dwellMs: 33,
          oppositeDwellMs: 66,
          rearmFrames: 2,
          hysteresisDeg: 5,
        })
      : null;
  const g1Fsm =
    opts.controller === "G1_J1" || opts.controller === "G1_J2" || opts.controller === "G1_J3"
      ? new PistolVirtualKeyFSM({
          aspect: opts.aspect,
          jumpPolicy:
            opts.controller === "G1_J1"
              ? "J1_hold"
              : opts.controller === "G1_J2"
                ? "J2_edge_single"
                : "J3_pulse_consumed",
        })
      : null;

  const jumpAssist = new JumpAssist();

  // Simplified 1D vertical Thinman physics (50 Hz, 20 ms/step): jump lasts ~440 ms
  let y = 0;
  let vy = 0;
  const GRAVITY = 22; // m/s^2 scaled
  const JUMP_VEL = 4.8; // flight time = 2 * 4.8 / 22 = 0.436s
  let grounded = true;

  // Timeline (after 200 ms warmup at 0 deg):
  // If !withRePress:
  //   0..300 ms: 0 deg (walk-right)
  //   300..500 ms: smooth sweep 0 -> 58 deg
  //   500..1300 ms: hold 58 deg (Jump happens at ~500ms, lands at ~940ms while 58 deg STILL held!)
  //   1300..1500 ms: smooth sweep 58 -> 0 deg
  //   1500..1800 ms: hold 0 deg
  // If withRePress:
  //   0..200 ms: 0 deg
  //   200..500 ms: 58 deg (jump 1)
  //   500..750 ms: 0 deg (250 ms non-jump > 130 ms lockout, lands before or during)
  //   750..1150 ms: 58 deg (jump 2)
  //   1150..1450 ms: 0 deg
  const WARMUP_MS = 200;
  const angleAt = (tRel: number): number => {
    if (tRel < 0) return 0;
    if (opts.withRePress) {
      if (tRel < 200) return 0;
      if (tRel < 500) return 58;
      if (tRel < 750) return 0;
      if (tRel < 1150) return 58;
      return 0;
    }
    if (tRel < 300) return 0;
    if (tRel < 500) return ((tRel - 300) / 200) * 58;
    if (tRel < 1300) return 58;
    if (tRel < 1500) return 58 * (1 - (tRel - 1300) / 200);
    return 0;
  };
  const totalMs = WARMUP_MS + (opts.withRePress ? 1450 : 1800);

  let nextCamMs = 0;
  let nextPhysMs = 0;
  let nextArbMs = 0;

  let jumpsExecuted = 0;
  let rightTruePhysSteps = 0;
  let rightDropPhysSteps = 0;
  let totalPhysSteps = 0;

  // Step on a fine 1 ms event timeline so async 60/30/15 Hz camera, 50 Hz physics, and 100 ms arbiter interleave authentically!
  for (let t = 0; t <= totalMs; t += 1) {
    nowMs = t;
    while (nextCamMs <= t + 1e-6) {
      const deg = angleAt(nextCamMs - WARMUP_MS);
      const lm = makeSynthetic3DHand({
        pose: "POINT_PRESS_std",
        handedness: "right",
        view: "palmar",
        thetaDeg: deg,
        rollDeg: 0,
        pitchDeg: 0,
        aspect: opts.aspect,
      });
      if (opts.controller === "G0_main") {
        const f = g0Filter.update(lm, nextCamMs);
        arbiter.dispatch({ type: "hand-frame", frame: f });
      } else if (ux1Fsm) {
        const f = ux1Fsm.update(lm, nextCamMs);
        arbiter.dispatch({
          type: "hand-frame",
          frame: { tracked: f.tracked, cursor: null, pinched: false, input: f.input },
        });
      } else if (g1Fsm) {
        const f = g1Fsm.update(lm, nextCamMs);
        arbiter.dispatch({
          type: "hand-frame",
          frame: { tracked: f.tracked, cursor: null, pinched: false, input: f.input },
        });
      }
      nextCamMs += dtCamMs;
    }

    if (t >= nextArbMs) {
      arbiter.tick();
      nextArbMs += 100;
    }

    if (t >= nextPhysMs) {
      if (t >= WARMUP_MS) {
        const out = arbiter.output();
        totalPhysSteps++;
        if (out.right) rightTruePhysSteps++;
        else rightDropPhysSteps++;

        const didJump = jumpAssist.step(grounded, out.jump);
        if (didJump) {
          jumpsExecuted++;
          vy = JUMP_VEL;
          grounded = false;
        }
        if (!grounded) {
          y += vy * 0.02;
          vy -= GRAVITY * 0.02;
          if (y <= 0) {
            y = 0;
            vy = 0;
            grounded = true;
          }
        }
      }
      nextPhysMs += 20;
    }
  }

  return {
    fps: opts.fps,
    total_phys_steps: totalPhysSteps,
    right_continuity_pct: Math.round((10000 * rightTruePhysSteps) / totalPhysSteps) / 100,
    right_drop_steps: rightDropPhysSteps,
    jumps_executed: jumpsExecuted,
  };
}

function evalDynamicSequences() {
  const aspect = 16 / 9;
  const dt = 33; // ~30 Hz

  // 1. READY -> PRESS -> HOLD -> RELEASE (to READY, OTHER, NO_HAND) -> KEYUP
  const readyFsm = new PistolVirtualKeyFSM({ aspect, jumpPolicy: "J3_pulse_consumed" });
  let readyFalseKeys = 0;
  for (let i = 0; i < 10; i++) {
    const s = readyFsm.update(
      makeSynthetic3DHand({ pose: "POINT_READY_across", handedness: "right", view: "palmar", thetaDeg: 0, rollDeg: 0, pitchDeg: 0, aspect }),
      i * dt,
    );
    if (s.input.left || s.input.right || s.input.jump) readyFalseKeys++;
  }
  let pressKeydownAtFrame: number | null = null;
  let heldRightFrames = 0;
  for (let i = 10; i < 25; i++) {
    const s = readyFsm.update(
      makeSynthetic3DHand({ pose: "POINT_PRESS_std", handedness: "right", view: "palmar", thetaDeg: 0, rollDeg: 0, pitchDeg: 0, aspect }),
      i * dt,
    );
    if (s.keyEvent === "KEYDOWN" && pressKeydownAtFrame === null) pressKeydownAtFrame = i - 10;
    if (s.input.right) heldRightFrames++;
  }
  const releaseCases: Record<string, { immediateKeyup: boolean; stuckFrames: number }> = {};
  for (const rel of ["READY", "OTHER", "NO_HAND"] as const) {
    const fsm = new PistolVirtualKeyFSM({ aspect, jumpPolicy: "J3_pulse_consumed" });
    for (let i = 0; i < 5; i++) {
      fsm.update(
        makeSynthetic3DHand({ pose: "POINT_PRESS_std", handedness: "right", view: "palmar", thetaDeg: 0, rollDeg: 0, pitchDeg: 0, aspect }),
        i * dt,
      );
    }
    const relLm =
      rel === "READY"
        ? makeSynthetic3DHand({ pose: "POINT_READY_along", handedness: "right", view: "palmar", thetaDeg: 0, rollDeg: 0, pitchDeg: 0, aspect })
        : rel === "OTHER"
          ? makeSynthetic3DHand({ pose: "Fist", handedness: "right", view: "palmar", thetaDeg: 0, rollDeg: 0, pitchDeg: 0, aspect })
          : undefined;
    const s = fsm.update(relLm, 5 * dt);
    const stuck = s.input.left || s.input.right || s.input.jump ? 1 : 0;
    releaseCases[rel] = { immediateKeyup: s.keyEvent === "KEYUP" && stuck === 0, stuckFrames: stuck };
  }

  // 2. RIGHT -> RIGHT+JUMP -> RIGHT horizontal continuity + 50 Hz JumpAssist across 75 / 60 / 30 / 15 Hz
  const controllers = ["G0_main", "R18_UX1_J1", "R18_UX1_J2", "G1_J1", "G1_J2", "G1_J3"] as const;
  const fpsList = [75, 60, 30, 15];
  const continuityAndJumpMatrix: Record<string, any> = {};
  for (const ctrl of controllers) {
    continuityAndJumpMatrix[ctrl] = {
      single_held_sweep: fpsList.map((fps) => simulateRightJumpRightPhysics({ controller: ctrl, fps, aspect })),
      double_repress_30fps: simulateRightJumpRightPhysics({ controller: ctrl, fps: 30, aspect, withRePress: true }),
    };
  }

  // 2b. JumpAssist Coyote & Pre-Landing Buffer verification with G1 J3_pulse_consumed
  const testCoyoteAndBuffer = () => {
    // Coyote: walk off ledge at t=0, press POINT_PRESS at 90 deg at t=40ms (within 100ms coyote window)
    const fsmC = new PistolVirtualKeyFSM({ aspect, jumpPolicy: "J3_pulse_consumed" });
    const jaC = new JumpAssist();
    for (let i = 0; i < 4; i++) {
      fsmC.update(makeSynthetic3DHand({ pose: "POINT_READY_across", handedness: "right", view: "palmar", thetaDeg: 90, rollDeg: 0, pitchDeg: 0, aspect }), i * 20);
      jaC.step(true, false);
    }
    let coyoteJumped = false;
    for (let step = 0; step < 8; step++) {
      const grounded = false; // stepped off ledge!
      const s = fsmC.update(
        step >= 2
          ? makeSynthetic3DHand({ pose: "POINT_PRESS_std", handedness: "right", view: "palmar", thetaDeg: 90, rollDeg: 0, pitchDeg: 0, aspect })
          : makeSynthetic3DHand({ pose: "POINT_READY_across", handedness: "right", view: "palmar", thetaDeg: 90, rollDeg: 0, pitchDeg: 0, aspect }),
        (4 + step) * 20,
      );
      if (jaC.step(grounded, s.input.jump)) coyoteJumped = true;
    }

    // Buffer: falling in air, press POINT_PRESS at 90 deg 60ms (3 steps) BEFORE landing
    const fsmB = new PistolVirtualKeyFSM({ aspect, jumpPolicy: "J3_pulse_consumed" });
    const jaB = new JumpAssist();
    for (let i = 0; i < 4; i++) {
      fsmB.update(makeSynthetic3DHand({ pose: "POINT_READY_across", handedness: "right", view: "palmar", thetaDeg: 90, rollDeg: 0, pitchDeg: 0, aspect }), i * 20);
      jaB.step(false, false);
    }
    let bufferedJumpedOnLand = false;
    for (let step = 0; step < 8; step++) {
      const grounded = step >= 3; // lands 60ms after jump trigger!
      const s = fsmB.update(
        makeSynthetic3DHand({ pose: "POINT_PRESS_std", handedness: "right", view: "palmar", thetaDeg: 90, rollDeg: 0, pitchDeg: 0, aspect }),
        (4 + step) * 20,
      );
      if (jaB.step(grounded, s.input.jump) && grounded) bufferedJumpedOnLand = true;
    }
    return { coyoteJumped, bufferedJumpedOnLand };
  };

  // 3. Opposite direction flip (walk-right -> walk-left)
  const oppFsm = new PistolVirtualKeyFSM({ aspect, jumpPolicy: "J3_pulse_consumed", dwellMs: 33, oppositeDwellMs: 66 });
  for (let i = 0; i < 4; i++) {
    oppFsm.update(makeSynthetic3DHand({ pose: "POINT_PRESS_std", handedness: "right", view: "palmar", thetaDeg: 0, rollDeg: 0, pitchDeg: 0, aspect }), i * 33);
  }
  let oppSimultaneous = 0;
  let oppNeutralDwellFrames = 0;
  let oppLeftActivatedAtMs: number | null = null;
  for (let i = 4; i < 10; i++) {
    const s = oppFsm.update(makeSynthetic3DHand({ pose: "POINT_PRESS_std", handedness: "right", view: "dorsal", thetaDeg: 180, rollDeg: 0, pitchDeg: 0, aspect }), i * 33);
    if (s.input.left && s.input.right) oppSimultaneous++;
    if (!s.input.left && !s.input.right) oppNeutralDwellFrames++;
    if (s.input.left && oppLeftActivatedAtMs === null) oppLeftActivatedAtMs = (i - 4) * 33;
  }

  // 4. 1-frame NO_HAND dropout flicker during POINT_PRESS at 90 deg
  const flkFsm = new PistolVirtualKeyFSM({ aspect, jumpPolicy: "J3_pulse_consumed" });
  let flkJumpTriggers = 0;
  let flkDropKeyupImmediate = false;
  for (let i = 0; i < 6; i++) {
    const s = flkFsm.update(makeSynthetic3DHand({ pose: "POINT_PRESS_std", handedness: "right", view: "palmar", thetaDeg: 90, rollDeg: 0, pitchDeg: 0, aspect }), i * 33);
    if (s.jumpFiredThisFrame) flkJumpTriggers++;
  }
  const dropStep = flkFsm.update(undefined, 6 * 33);
  flkDropKeyupImmediate = !dropStep.input.jump && !dropStep.input.left && !dropStep.input.right && !dropStep.tracked;
  for (let i = 7; i < 14; i++) {
    const s = flkFsm.update(makeSynthetic3DHand({ pose: "POINT_PRESS_std", handedness: "right", view: "palmar", thetaDeg: 90, rollDeg: 0, pitchDeg: 0, aspect }), i * 33);
    if (s.jumpFiredThisFrame) flkJumpTriggers++;
  }

  // 5. Phase barrier (placing -> gameplay) while pistol already held at 10 deg
  const pbFsm = new PistolVirtualKeyFSM({ aspect, jumpPolicy: "J3_pulse_consumed" });
  for (let i = 0; i < 4; i++) {
    pbFsm.update(makeSynthetic3DHand({ pose: "POINT_PRESS_std", handedness: "right", view: "palmar", thetaDeg: 10, rollDeg: 0, pitchDeg: 0, aspect }), i * 33);
  }
  pbFsm.onPhaseChange();
  let pbCarryoverRight = 0;
  for (let i = 4; i < 9; i++) {
    const s = pbFsm.update(makeSynthetic3DHand({ pose: "POINT_PRESS_std", handedness: "right", view: "palmar", thetaDeg: 10, rollDeg: 0, pitchDeg: 0, aspect }), i * 33);
    if (s.input.right) pbCarryoverRight++;
  }
  // Release to POINT_READY for 2 frames then press again
  for (let i = 9; i < 11; i++) {
    pbFsm.update(makeSynthetic3DHand({ pose: "POINT_READY_across", handedness: "right", view: "palmar", thetaDeg: 10, rollDeg: 0, pitchDeg: 0, aspect }), i * 33);
  }
  let pbRearmedAfterReadyRelease = false;
  for (let i = 11; i < 15; i++) {
    const s = pbFsm.update(makeSynthetic3DHand({ pose: "POINT_PRESS_std", handedness: "right", view: "palmar", thetaDeg: 10, rollDeg: 0, pitchDeg: 0, aspect }), i * 33);
    if (s.input.right) pbRearmedAfterReadyRelease = true;
  }

  // 6. Noisy non-pistol hand jitter (120 frames per distractor pose, sigma = 0.01 * palmScale)
  const rng = makeRng(9911);
  const noisyPoses: SyntheticPoseKind[] = [
    "POINT_READY_across",
    "POINT_READY_along",
    "PinchNear_straight",
    "ThumbUp",
    "VSign_tucked",
    "Fist",
    "OpenPalm",
  ];
  const noisySummary: Record<string, { frames: number; g0Steer: number; ux1Steer: number; g1FalseKeydown: number }> = {};
  for (const np of noisyPoses) {
    const g0F = new GameplayGestureFilter();
    const u1F = new VirtualKeySteeringFSM({
      pointingPolicy: "P2_balanced",
      jumpPolicy: "J2_edge",
      aspect,
      dwellMs: 33,
      oppositeDwellMs: 66,
      rearmFrames: 2,
      hysteresisDeg: 5,
    });
    const g1F = new PistolVirtualKeyFSM({ aspect, jumpPolicy: "J3_pulse_consumed" });
    let g0Steer = 0, ux1Steer = 0, g1FalseKeydown = 0;
    for (let i = 0; i < 120; i++) {
      const lm = makeSynthetic3DHand({
        pose: np,
        handedness: i % 2 === 0 ? "right" : "left",
        view: i % 3 === 0 ? "dorsal" : "palmar",
        thetaDeg: np === "ThumbUp" ? (i % 2 === 0 ? 10 : 170) : (i * 15) % 180,
        rollDeg: ((i * 7) % 50) - 25,
        pitchDeg: ((i * 11) % 60) - 30,
        aspect,
        jitterSigma: 0.01,
        rng,
      });
      const b = g0F.update(lm, i * 33);
      const u = u1F.update(lm, i * 33);
      const g = g1F.update(lm, i * 33);
      if (b.input.left || b.input.right || b.input.jump) g0Steer++;
      if (u.input.left || u.input.right || u.input.jump) ux1Steer++;
      if (g.input.left || g.input.right || g.input.jump) g1FalseKeydown++;
    }
    noisySummary[np] = { frames: 120, g0Steer, ux1Steer, g1FalseKeydown };
  }

  return {
    evidence_tier: "SYNTHETIC",
    ready_press_hold_release: {
      ready_false_keys: readyFalseKeys,
      press_keydown_frame_delay: pressKeydownAtFrame,
      held_right_frames: heldRightFrames,
      release_cases: releaseCases,
    },
    right_jump_right_continuity_and_jump_assist: continuityAndJumpMatrix,
    coyote_and_buffer_check: testCoyoteAndBuffer(),
    opposite_flip_safety: {
      simultaneous_left_right_frames: oppSimultaneous,
      neutral_dwell_frames: oppNeutralDwellFrames,
      left_activated_after_ms: oppLeftActivatedAtMs,
    },
    one_frame_dropout_flicker: {
      immediate_keyup_on_drop: flkDropKeyupImmediate,
      total_jump_triggers_across_1frame_drop: flkJumpTriggers,
    },
    phase_barrier_placing_to_gameplay: {
      carryover_right_frames: pbCarryoverRight,
      rearmed_after_ready_release: pbRearmedAfterReadyRelease,
    },
    noisy_non_pistol_jitter_120frames: noisySummary,
  };
}

// =========================================================================
// (d) Real Cached Offline Distractors (Mendeley dim_light / natural_light / negatives)
// =========================================================================
interface MendeleyItem {
  name: string;
  aspect: number;
  raw?: number[][][];
  clahe320?: number[][][];
  adaptive_m3?: number[][][];
}

function evalOfflineMendeleyDistractors() {
  const data = JSON.parse(readFileSync(DISTRACTOR_JSON, "utf8")) as Record<string, MendeleyItem[]>;
  const sections = ["dim_light", "natural_light", "negatives"] as const;
  const modes = ["raw", "clahe320", "adaptive_m3"] as const;

  let totalHands = 0;
  let g0SteerCount = 0;
  let ux1PointingCount = 0;
  let g1ReadyCount = 0;
  let g1PressCount = 0;
  let g1OtherCount = 0;
  const g1SubClassCounts: Record<string, number> = {};
  const bySection: Record<string, any> = {};
  const falsePressExamples: Array<Record<string, unknown>> = [];

  for (const sec of sections) {
    const items = data[sec] ?? [];
    let secHands = 0, secG0Steer = 0, secUx1Pt = 0, secG1Ready = 0, secG1Press = 0;
    const secByMode: Record<string, { hands: number; g0Steer: number; ux1Pt: number; g1Ready: number; g1Press: number }> = {};

    for (const mode of modes) {
      let mHands = 0, mG0 = 0, mUx1 = 0, mReady = 0, mPress = 0;
      for (const item of items) {
        const hands = item[mode] ?? [];
        const asp = item.aspect || 16 / 9;
        for (let hi = 0; hi < hands.length; hi++) {
          const pts = hands[hi]!;
          const lm: Landmark[] = pts.map(([x, y]) => ({ x: x!, y: y! }));
          mHands++;
          secHands++;
          totalHands++;

          const g0 = evaluateGameplayGesture(lm);
          const ux1 = isIntentionalPointing(lm, "P2_balanced", asp);
          const g1 = classifyPistolGeometry(lm, asp);

          if (g0.input.left || g0.input.right || g0.input.jump) {
            mG0++;
            secG0Steer++;
            g0SteerCount++;
          }
          if (ux1.ok) {
            mUx1++;
            secUx1Pt++;
            ux1PointingCount++;
          }
          if (g1.state === "POINT_READY") {
            mReady++;
            secG1Ready++;
            g1ReadyCount++;
          } else if (g1.state === "POINT_PRESS") {
            mPress++;
            secG1Press++;
            g1PressCount++;
            if (falsePressExamples.length < 10) {
              falsePressExamples.push({
                section: sec,
                mode,
                name: item.name,
                handIndex: hi,
                angle: g1.angle !== null ? Math.round(g1.angle * 10) / 10 : null,
                d4_5: g1.metrics ? Math.round(g1.metrics.d4_5 * 1000) / 1000 : null,
                d4_9: g1.metrics ? Math.round(g1.metrics.d4_9 * 1000) / 1000 : null,
                d4_8: g1.metrics ? Math.round(g1.metrics.d4_8 * 1000) / 1000 : null,
                perp: g1.metrics ? Math.round(g1.metrics.thumbPerpFromIndexRay * 1000) / 1000 : null,
                a854: g1.metrics ? Math.round(g1.metrics.thumbAbduction854Deg * 10) / 10 : null,
                a234: g1.metrics ? Math.round(g1.metrics.thumbAngle234Deg * 10) / 10 : null,
                midPipAngle: g1.metrics ? Math.round(g1.metrics.middle.pipAngleDeg * 10) / 10 : null,
                midMcpTip: g1.metrics ? Math.round(g1.metrics.middle.mcpToTipNorm * 1000) / 1000 : null,
              });
            }
          } else {
            g1OtherCount++;
          }
          g1SubClassCounts[g1.subClass] = (g1SubClassCounts[g1.subClass] ?? 0) + 1;
        }
      }
      if (mHands > 0) {
        secByMode[mode] = { hands: mHands, g0Steer: mG0, ux1Pt: mUx1, g1Ready: mReady, g1Press: mPress };
      }
    }

    const pct = (a: number, b: number) => (b > 0 ? Math.round((10000 * a) / b) / 100 : 0);
    bySection[sec] = {
      hands: secHands,
      G0_false_steer_cnt: secG0Steer,
      G0_false_steer_pct: pct(secG0Steer, secHands),
      R18_UX1_false_point_cnt: secUx1Pt,
      R18_UX1_false_point_pct: pct(secUx1Pt, secHands),
      G1_point_ready_cnt: secG1Ready,
      G1_point_ready_pct: pct(secG1Ready, secHands),
      G1_false_press_cnt: secG1Press,
      G1_false_press_pct: pct(secG1Press, secHands),
      by_mode: secByMode,
    };
  }

  // Also test stateful FSM false KEYDOWN rate on contiguous RAW/CLAHE distractor order
  const g1Fsm = new PistolVirtualKeyFSM({ aspect: 16 / 9, jumpPolicy: "J3_pulse_consumed" });
  let fsmFalseKeydowns = 0;
  let fsmFrameIdx = 0;
  for (const sec of sections) {
    for (const item of data[sec] ?? []) {
      const hands = item.clahe320 ?? [];
      if (hands.length === 0) {
        g1Fsm.update(undefined, fsmFrameIdx * 33);
      } else {
        const lm: Landmark[] = hands[0]!.map(([x, y]) => ({ x: x!, y: y! }));
        const s = g1Fsm.update(lm, fsmFrameIdx * 33);
        if (s.keyEvent === "KEYDOWN" || s.input.left || s.input.right || s.input.jump) fsmFalseKeydowns++;
      }
      fsmFrameIdx++;
    }
  }

  const pct = (a: number, b: number) => (b > 0 ? Math.round((10000 * a) / b) / 100 : 0);
  return {
    evidence_tier: "OFFLINE_DATASET",
    source: DISTRACTOR_JSON,
    total_detected_hands: totalHands,
    G0_false_steer_cnt: g0SteerCount,
    G0_false_steer_pct: pct(g0SteerCount, totalHands),
    R18_UX1_false_point_cnt: ux1PointingCount,
    R18_UX1_false_point_pct: pct(ux1PointingCount, totalHands),
    G1_point_ready_cnt: g1ReadyCount,
    G1_point_ready_pct: pct(g1ReadyCount, totalHands),
    G1_false_press_cnt: g1PressCount,
    G1_false_press_pct: pct(g1PressCount, totalHands),
    G1_other_cnt: g1OtherCount,
    G1_subClass_counts: g1SubClassCounts,
    G1_fsm_sequential_false_active_frames: fsmFalseKeydowns,
    by_section: bySection,
    false_press_examples: falsePressExamples,
  };
}

// =========================================================================
// Main Run + Markdown Report Generation
// =========================================================================
const aspectReport = evalAspectSweep();
const synthetic3DReport = evalSynthetic3DSuite();
const dynamicReport = evalDynamicSequences();
const distractorReport = evalOfflineMendeleyDistractors();

const fullReport = {
  generated_at: new Date().toISOString(),
  scope: "R19 Stage P2: G0_main vs R18_UX1 (P2_balanced) vs G1_pistol (pure geometry + PistolVirtualKeyFSM)",
  aspect_sweep: aspectReport,
  synthetic_3d_pose_suite: synthetic3DReport,
  dynamic_fsm_and_jump_assist_suite: dynamicReport,
  offline_mendeley_distractors: distractorReport,
};

writeFileSync(`${OUT_DIR}/g0_g1_eval.json`, JSON.stringify(fullReport, null, 2));

const md: string[] = [];
md.push("# R19 Stage P2 — Pistol Geometry & Virtual-Key FSM Evaluation (`G0_main` vs `R18_UX1` vs `G1_pistol`)");
md.push("");
md.push(`- **Generated:** \`${fullReport.generated_at}\``);
md.push("- **Evidence Tiers:** Aspect & 3D->2D pose & dynamic FSM/JumpAssist suites are **`SYNTHETIC` / `UNIT_ONLY`**; Mendeley tabletop distractors are **`OFFLINE_DATASET`** (`ux3_mendeley_distractor_landmarks.json`). Physical webcam is **`NOT_TESTED`** here.");
md.push("");

md.push("## 1. Aspect Sweep (`1:1, 5:4, 4:3, 16:9, 9:16`) — `SYNTHETIC`");
md.push("");
md.push("| Aspect | Samples | `G0_main` Max Err (deg) | `G0_main` Zone Mismatch | `G0_main` Raw `fingerStates` Bug | `R18_UX1` Max Err | `G1_pistol` Max Err | `G1_pistol` Zone Mismatch | `G1_pistol` Aspect `fingerStates` Err | `G1_pistol` PRESS Recall |");
md.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const [asp, row] of Object.entries(aspectReport)) {
  md.push(
    `| ${asp} | ${row.samples} | ${row.G0_main.max_angle_err_deg}° | ${row.G0_main.zone_mismatches} | ${row.G0_main.raw_fingerStates_bug_errors} | ${row.R18_UX1.max_angle_err_deg}° | ${row.G1_pistol.max_angle_err_deg}° | ${row.G1_pistol.zone_mismatches} | ${row.G1_pistol.aspect_fingerStates_errors} | ${row.G1_pistol.point_press_recall_pct}% |`,
  );
}
md.push("");

md.push("## 2. Synthetic 3D->2D Rotated / Pitched / Rolled Hand Suite (`SYNTHETIC`)");
md.push("");
md.push(`- **Total Samples:** ${synthetic3DReport.total_samples} (Palmar & Dorsal × Left & Right × 7 angles × 5 rolls [-35..+35°] × 5 pitches [-40..+40°] across 15 pose variants with σ=0.004 jitter)`);
md.push(`- **G1 Overall 3-Class Accuracy (\`POINT_READY\` / \`POINT_PRESS\` / \`OTHER\`):** **${synthetic3DReport.overall.G1_3class_accuracy_pct}%**`);
md.push(`- **G1 Overall SubClass Family Accuracy:** **${synthetic3DReport.overall.G1_subclass_family_accuracy_pct}%**`);
md.push(`- **\`POINT_READY\` Recall / False-PRESS:** **${synthetic3DReport.overall.POINT_READY_recall_pct}%** / **${synthetic3DReport.overall.POINT_READY_false_press_pct}%**`);
md.push(`- **\`POINT_PRESS\` Recall:** **${synthetic3DReport.overall.POINT_PRESS_recall_pct}%**`);
md.push(`- **\`OTHER\` False Trigger Rate:** \`G0_main\` steer **${synthetic3DReport.overall.OTHER_false_steer_G0_main_pct}%** | \`R18_UX1\` point **${synthetic3DReport.overall.OTHER_false_steer_R18_UX1_pct}%** | \`G1_pistol\` PRESS **${synthetic3DReport.overall.OTHER_false_press_G1_pct}%**`);
md.push("");
md.push("### Dorsal Right-Hand Pointing Left (`O0`/`O1`)");
const o01 = synthetic3DReport.dorsal_right_pointing_left_O0_O1;
md.push(`- **Standard \`POINT_PRESS\`:** \`G1_pistol\` **${o01.g1_press_std_ok}/${o01.n_press_std} (${o01.g1_press_std_pct}%)** vs \`G0_main\` \`one-finger\` **${o01.g0_press_std_one_finger}/${o01.n_press_std}** (note \`thumbLateral >= 1.3\`: **${o01.g0_press_std_thumb_lateral_ok}/${o01.n_press_std} (${o01.g0_thumb_lateral_std_pct}%)**, false \`two-fingers\`: ${o01.g0_press_std_two_fingers_redo})`);
md.push(`- **Partial-Shortened \`POINT_PRESS_dorsal_short\`:** \`G1_pistol\` **${o01.g1_press_short_ok}/${o01.n_press_short} (${o01.g1_press_short_pct}%)** (false pinch: **${o01.g1_press_short_pinch_false}**) vs \`G0_main\` \`one-finger\` **${o01.g0_press_short_one_finger}/${o01.n_press_short}**`);
md.push(`- **\`POINT_READY\` (Dorsal Right Pointing Left):** \`G1_pistol\` exact \`POINT_READY\` **${o01.g1_ready_exact}/${o01.n_ready} (${o01.g1_ready_exact_pct}%)**, false PRESS **${o01.g1_ready_false_press}** (vs \`G0_main\` false steer **${o01.g0_ready_steer_false}/${o01.n_ready}**, \`R18_UX1\` false steer **${o01.ux1_ready_steer_false}/${o01.n_ready}**)`);
md.push("");
md.push("| Pose Variant | N | Expected | `G0` Steer% | `G0` `cnt=2`% | `R18_UX1` Pt% | `G1` READY% | `G1` PRESS% | `G1` OTHER% | `G1` Exact State% |");
md.push("|---|---:|---|---:|---:|---:|---:|---:|---:|---:|");
for (const [pose, p] of Object.entries(synthetic3DReport.per_pose)) {
  md.push(
    `| ${pose} | ${p.samples} | ${p.expected_state} | ${p.G0_steer_pct}% | ${p.G0_cnt2_collision_pct}% | ${p.R18_UX1_pointing_pct}% | ${p.G1_ready_pct}% | ${p.G1_press_pct}% | ${p.G1_other_pct}% | ${p.G1_exact_state_pct}% |`,
  );
}
md.push("");

md.push("## 3. Dynamic FSM, Horizontal Continuity & 50 Hz `JumpAssist` + 100 ms `InputArbiter` (`SYNTHETIC`)");
md.push("");
md.push("| Controller / Policy | 75 Hz Right Cont% (Jumps) | 60 Hz Right Cont% (Jumps) | 30 Hz Right Cont% (Jumps) | 15 Hz Right Cont% (Jumps) | Double Re-Press 30 Hz (Exp=2) |");
md.push("|---|---:|---:|---:|---:|---:|");
for (const [ctrl, row] of Object.entries(dynamicReport.right_jump_right_continuity_and_jump_assist)) {
  const s = row.single_held_sweep as Array<{ fps: number; right_continuity_pct: number; jumps_executed: number }>;
  const r2 = row.double_repress_30fps as { right_continuity_pct: number; jumps_executed: number };
  const f75 = s.find((x) => x.fps === 75)!;
  const f60 = s.find((x) => x.fps === 60)!;
  const f30 = s.find((x) => x.fps === 30)!;
  const f15 = s.find((x) => x.fps === 15)!;
  md.push(
    `| ${ctrl} | ${f75.right_continuity_pct}% (${f75.jumps_executed}) | ${f60.right_continuity_pct}% (${f60.jumps_executed}) | ${f30.right_continuity_pct}% (${f30.jumps_executed}) | ${f15.right_continuity_pct}% (${f15.jumps_executed}) | ${r2.right_continuity_pct}% (${r2.jumps_executed}) |`,
  );
}
md.push("");
md.push("### Additional Dynamic Safety Checks");
md.push(
  `- **READY -> PRESS -> RELEASE -> KEYUP:** READY false keys = ${dynamicReport.ready_press_hold_release.ready_false_keys}, KEYDOWN delay = ${dynamicReport.ready_press_hold_release.press_keydown_frame_delay} frame, Release to READY/OTHER/NO_HAND immediate KEYUP = ${Object.entries(dynamicReport.ready_press_hold_release.release_cases).map(([k, v]) => `${k}:${(v as { immediateKeyup: boolean }).immediateKeyup}`).join(", ")}`,
);
md.push(`- **Coyote & Pre-Landing Buffer (\`G1_J3\`):** coyoteJumped = ${dynamicReport.coyote_and_buffer_check.coyoteJumped}, bufferedJumpedOnLand = ${dynamicReport.coyote_and_buffer_check.bufferedJumpedOnLand}`);
md.push(`- **Opposite Flip (\`right -> left\`):** simultaneous L+R = ${dynamicReport.opposite_flip_safety.simultaneous_left_right_frames}, neutral dwell frames = ${dynamicReport.opposite_flip_safety.neutral_dwell_frames}, left active at ${dynamicReport.opposite_flip_safety.left_activated_after_ms} ms`);
md.push(`- **1-Frame Dropout Flicker at 90 deg:** immediate keyup on drop = ${dynamicReport.one_frame_dropout_flicker.immediate_keyup_on_drop}, total jump triggers = ${dynamicReport.one_frame_dropout_flicker.total_jump_triggers_across_1frame_drop} (expected 1)`);
md.push(`- **Phase Barrier (\`placing -> gameplay\`):** carryover right frames = ${dynamicReport.phase_barrier_placing_to_gameplay.carryover_right_frames}, rearmed after READY release = ${dynamicReport.phase_barrier_placing_to_gameplay.rearmed_after_ready_release}`);
const noisyTotals = Object.values(dynamicReport.noisy_non_pistol_jitter_120frames) as Array<{ frames: number; g0Steer: number; ux1Steer: number; g1FalseKeydown: number }>;
const sumFrames = noisyTotals.reduce((a, b) => a + b.frames, 0);
const sumG0 = noisyTotals.reduce((a, b) => a + b.g0Steer, 0);
const sumUx1 = noisyTotals.reduce((a, b) => a + b.ux1Steer, 0);
const sumG1 = noisyTotals.reduce((a, b) => a + b.g1FalseKeydown, 0);
md.push(`- **Noisy Non-Pistol Jitter (${sumFrames} frames, σ=0.01):** \`G0_main\` steer = ${sumG0}/${sumFrames}, \`R18_UX1\` steer = ${sumUx1}/${sumFrames}, \`G1_pistol\` false active keys = ${sumG1}/${sumFrames}`);
md.push("");

md.push("## 4. Cached Real Mendeley Distractor Hands (`OFFLINE_DATASET`)");
md.push("");
md.push(`- **Total Detected Hands:** ${distractorReport.total_detected_hands} across \`dim_light\`, \`natural_light\`, and \`negatives\` (\`raw\`, \`clahe320\`, \`adaptive_m3\`)`);
md.push(`- **\`G0_main\` False Steer:** **${distractorReport.G0_false_steer_cnt}/${distractorReport.total_detected_hands} (${distractorReport.G0_false_steer_pct}%)**`);
md.push(`- **\`R18_UX1\` (\`P2_balanced\`) False Pointing:** **${distractorReport.R18_UX1_false_point_cnt}/${distractorReport.total_detected_hands} (${distractorReport.R18_UX1_false_point_pct}%)**`);
md.push(`- **\`G1_pistol\` False \`POINT_PRESS\`:** **${distractorReport.G1_false_press_cnt}/${distractorReport.total_detected_hands} (${distractorReport.G1_false_press_pct}%)** (\`POINT_READY\`: ${distractorReport.G1_point_ready_cnt} [${distractorReport.G1_point_ready_pct}%], FSM sequential active frames: ${distractorReport.G1_fsm_sequential_false_active_frames})`);
md.push("");
md.push("| Section | Hands | `G0_main` Steer | `R18_UX1` Point | `G1_pistol` READY | `G1_pistol` False PRESS |");
md.push("|---|---:|---:|---:|---:|---:|");
for (const [sec, row] of Object.entries(distractorReport.by_section)) {
  md.push(
    `| ${sec} | ${row.hands} | ${row.G0_false_steer_cnt} (${row.G0_false_steer_pct}%) | ${row.R18_UX1_false_point_cnt} (${row.R18_UX1_false_point_pct}%) | ${row.G1_point_ready_cnt} (${row.G1_point_ready_pct}%) | ${row.G1_false_press_cnt} (${row.G1_false_press_pct}%) |`,
  );
}
md.push("");

writeFileSync(`${OUT_DIR}/g0_g1_eval.md`, md.join("\n"));
console.log(md.join("\n"));

/**
 * R18-UX3 Exported Model End-to-End Evaluation Suite.
 * Runs the EXACT exported JSON artifact (`ux3_model_mlp.json`) via pure TS inference on:
 *  0) Python-vs-TS numerical parity + JS latency benchmark
 *  1) VAL threshold sweep -> selects calibrated operating threshold
 *  2) LOCKED TEST A/B (Baseline vs UX1-rules vs UX3-Exported Hybrid) on 36 IPN HandS unseen-subject videos
 *  3) Unseen Mendeley DimLight & NaturalLight webcam frames (RAW vs Adaptive M3)
 *  4) N0/N1 Adversarial Distractors (`N0_fan_sticks`, `N1_poster_hand`)
 *  5) Static class-median shapes (`FIVE`, `FOUR`, `THREE`, `ONE`, `PINCH_TOUCH` vs `PINCH_NEAR`) + Ownership & Thinman FSM
 */
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  GameplayGestureFilter,
} from "../repo/frontend/implementation/src/input/gameplay-gesture";
import {
  classifyHandPose,
  countExtendedFingers,
  palmCenterNormalized,
} from "../repo/frontend/implementation/src/input/hand-gesture";
import { SwipeCommander } from "../repo/frontend/implementation/src/components/nui-lab/lab-swipe";
import { MEDIAN_SKELETONS, pinchSkeleton, placeHand } from "../repo/frontend/implementation/tests/input/realistic-hands";
import type { Landmark } from "../repo/frontend/implementation/src/input/types";
import {
  SafeSwipeGuard,
  VirtualKeySteeringFSM,
  isSafeEraseFrame,
  isSafePinchFrame,
} from "../candidates/ux1_candidates";
import { Ux3Classifier, type Ux3ExportedModel } from "../candidates/ux3_model";
import { Ux3RuntimePipeline, type Ux3PointingParams, DEFAULT_UX3_POINT_PARAMS } from "../candidates/ux3_integrated";

interface FrameRow { f: number; cls: string; gt: number[][][]; mp: number[][][]; }
interface VideoSeq { video: string; person: string; frames: FrameRow[]; }

const RESULTS_DIR = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/results";
const ASPECT_IPN = 4 / 3;
const DT_MS = 1000 / 30;
const toLm = (pts: number[][]): Landmark[] => pts.map(([x, y]) => ({ x: x!, y: y! }));
const pct = (n: number, d: number) => (d > 0 ? Math.round((10000 * n) / d) / 100 : 0);
const perMin = (n: number, frames: number) => (frames > 0 ? Math.round((n / (frames / 30 / 60)) * 100) / 100 : 0);

const modelJson = JSON.parse(readFileSync(`${RESULTS_DIR}/ux3_model_mlp.json`, "utf8")) as Ux3ExportedModel;

// 0. Numerical parity + JS inference micro-benchmark
function evalParityAndLatency() {
  const clf = new Ux3Classifier(modelJson);
  const rows = JSON.parse(readFileSync(`${RESULTS_DIR}/ux3_parity_rows.json`, "utf8")) as Array<{
    X: number[]; y: number; probs: number[];
  }>;
  let maxDiff = 0;
  let argmaxMismatch = 0;
  for (const r of rows) {
    const tp = clf.proba(r.X);
    let bPy = 0, bTs = 0;
    for (let i = 0; i < tp.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(tp[i]! - r.probs[i]!));
      if (r.probs[i]! > r.probs[bPy]!) bPy = i;
      if (tp[i]! > tp[bTs]!) bTs = i;
    }
    if (bPy !== bTs) argmaxMismatch++;
  }
  const timesUs: number[] = [];
  for (let rep = 0; rep < 30; rep++) {
    for (const r of rows) {
      const t0 = performance.now();
      clf.proba(r.X);
      timesUs.push((performance.now() - t0) * 1000);
    }
  }
  timesUs.sort((a, b) => a - b);
  return {
    rows_checked: rows.length,
    max_abs_prob_diff: Number(maxDiff.toExponential(3)),
    argmax_mismatches: argmaxMismatch,
    js_infer_p50_us: Math.round(timesUs[Math.floor(timesUs.length * 0.5)]! * 100) / 100,
    js_infer_p95_us: Math.round(timesUs[Math.floor(timesUs.length * 0.95)]! * 100) / 100,
  };
}

// 1/2. IPN Sequence Evaluation (Baseline vs UX1-rules vs UX3-Exported)
function evalIpnSplit(videos: VideoSeq[], ux3Params: Ux3PointingParams) {
  type Acc = {
    frames: number; mpHands: number;
    baseSteer: number; ux1SteerZone: number; ux3SteerZone: number;
    ux3SteerEdge: number;
    baseDirFlips: number; ux1DirFlips: number; ux3DirFlips: number;
    baseJumpFlips: number; ux1JumpFlips: number; ux3JumpFlips: number;
    baseErase: number; revErase: number; ux1Erase: number; ux3Erase: number;
    basePinch: number; revPinch: number; ux1Pinch: number; ux3Pinch: number;
    revSwipe: number; ux1Swipe: number; ux3Swipe: number;
  };
  const byCls: Record<string, Acc> = {};
  const gAcc = (c: string): Acc => (byCls[c] ??= {
    frames: 0, mpHands: 0,
    baseSteer: 0, ux1SteerZone: 0, ux3SteerZone: 0, ux3SteerEdge: 0,
    baseDirFlips: 0, ux1DirFlips: 0, ux3DirFlips: 0,
    baseJumpFlips: 0, ux1JumpFlips: 0, ux3JumpFlips: 0,
    baseErase: 0, revErase: 0, ux1Erase: 0, ux3Erase: 0,
    basePinch: 0, revPinch: 0, ux1Pinch: 0, ux3Pinch: 0,
    revSwipe: 0, ux1Swipe: 0, ux3Swipe: 0,
  });

  const p1fDelayBase: number[] = [];
  const p1fDelayUx1: number[] = [];
  const p1fDelayUx3: number[] = [];

  for (const vid of videos) {
    const baseFilter = new GameplayGestureFilter();
    const ux1Fsm = new VirtualKeySteeringFSM({
      pointingPolicy: "P2_balanced", jumpPolicy: "J2_edge",
      aspect: ASPECT_IPN, dwellMs: 50, oppositeDwellMs: 66, rearmFrames: 3, hysteresisDeg: 5,
    });
    const revSwipe = new SwipeCommander();
    const ux1Swipe = new SafeSwipeGuard();
    const ux3Pipe = new Ux3RuntimePipeline(modelJson, ASPECT_IPN, ux3Params);

    let prevBDir = "stop", prev1Dir = "stop", prev3Dir = "stop";
    let prevBJump = false, prev1Jump = false, prev3Jump = false;
    let revPinchHeld = false, ux1PinchHeld = false, ux1EraseStreak = 0;
    let prevCls = "", p1Start: number | null = null;
    let gotB = false, got1 = false, got3 = false;

    for (const fr of vid.frames) {
      const tMs = fr.f * DT_MS;
      const a = gAcc(fr.cls);
      a.frames++;

      if (fr.cls !== prevCls) {
        if (fr.cls === "P1F") { p1Start = tMs; gotB = false; got1 = false; got3 = false; }
        else p1Start = null;
        prevCls = fr.cls;
      }

      if (!fr.mp || fr.mp.length === 0) {
        baseFilter.update(undefined, tMs);
        ux1Fsm.update(undefined, tMs);
        revSwipe.cancel("no-hand");
        ux1Swipe.reset();
        ux3Pipe.step(undefined, tMs, "none", 0, 0, 0);
        revPinchHeld = false; ux1PinchHeld = false; ux1EraseStreak = 0;
        prevBDir = "stop"; prev1Dir = "stop"; prev3Dir = "stop";
        prevBJump = false; prev1Jump = false; prev3Jump = false;
        continue;
      }

      a.mpHands++;
      const lm = toLm(fr.mp[0]!);
      const revPose = classifyHandPose(lm, { pinchHeld: revPinchHeld, experimentalRobust: true, aspect: ASPECT_IPN });
      const revCnt = countExtendedFingers(lm, { robustThumb: true, aspect: ASPECT_IPN });
      const basePose = classifyHandPose(lm);
      const baseCnt = countExtendedFingers(lm);
      const c = palmCenterNormalized(lm);
      const span = Math.hypot((lm[9]!.x - lm[0]!.x) * ASPECT_IPN, lm[9]!.y - lm[0]!.y);
      const palmScale = Math.max(span, Math.hypot((lm[17]!.x - lm[5]!.x) * ASPECT_IPN, lm[17]!.y - lm[5]!.y));

      const bf = baseFilter.update(lm, tMs);
      const u1f = ux1Fsm.update(lm, tMs);
      const u3 = ux3Pipe.step(lm, tMs, revPose, c.x, c.y, palmScale);

      const bAct = bf.input.left || bf.input.right || bf.input.jump;
      const u1Act = u1f.zone !== "stop";
      const u3Act = u3.steer.zone !== "stop";
      const u3Edge = u3.steer.input.left || u3.steer.input.right || u3.steer.input.jump;

      if (bAct) a.baseSteer++;
      if (u1Act) a.ux1SteerZone++;
      if (u3Act) a.ux3SteerZone++;
      if (u3Edge) a.ux3SteerEdge++;

      if (p1Start !== null) {
        if (bAct && !gotB) { gotB = true; p1fDelayBase.push(tMs - p1Start); }
        if (u1Act && !got1) { got1 = true; p1fDelayUx1.push(tMs - p1Start); }
        if (u3Act && !got3) { got3 = true; p1fDelayUx3.push(tMs - p1Start); }
      }

      const bd = bf.input.left ? "L" : bf.input.right ? "R" : "stop";
      const d1 = u1f.input.left ? "L" : u1f.input.right ? "R" : "stop";
      const d3 = u3.steer.input.left ? "L" : u3.steer.input.right ? "R" : "stop";
      if (bd !== "stop" && prevBDir !== "stop" && bd !== prevBDir) a.baseDirFlips++;
      if (d1 !== "stop" && prev1Dir !== "stop" && d1 !== prev1Dir) a.ux1DirFlips++;
      if (d3 !== "stop" && prev3Dir !== "stop" && d3 !== prev3Dir) a.ux3DirFlips++;
      prevBDir = bd; prev1Dir = d1; prev3Dir = d3;

      if (bf.input.jump && !prevBJump) a.baseJumpFlips++;
      if (u1f.input.jump && !prev1Jump) a.ux1JumpFlips++;
      if (u3.steer.input.jump && !prev3Jump) a.ux3JumpFlips++;
      prevBJump = bf.input.jump; prev1Jump = u1f.input.jump; prev3Jump = u3.steer.input.jump;

      if ((basePose === "open-palm" || basePose === "split-palm") && baseCnt === 5) a.baseErase++;
      if ((revPose === "open-palm" || revPose === "split-palm") && revCnt === 5) a.revErase++;
      if (isSafeEraseFrame(lm, ASPECT_IPN)) ux1EraseStreak++; else ux1EraseStreak = 0;
      if (ux1EraseStreak >= 4) a.ux1Erase++;
      if (u3.eraseActive) a.ux3Erase++;

      if (basePose === "pinch") a.basePinch++;
      if (revPose === "pinch") { a.revPinch++; revPinchHeld = true; } else revPinchHeld = false;
      const u1p = isSafePinchFrame(lm, ux1PinchHeld, ASPECT_IPN);
      if (u1p) { a.ux1Pinch++; ux1PinchHeld = true; } else ux1PinchHeld = false;
      if (u3.pinchActive) a.ux3Pinch++;

      if (revSwipe.feed({ pose: revPose, x: c.x * ASPECT_IPN, y: c.y, spanPx: span, nowMs: tMs, permitted: true })) a.revSwipe++;
      if (ux1Swipe.feed(revPose, c.x * ASPECT_IPN, c.y, palmScale, tMs)) a.ux1Swipe++;
      if (u3.swipeAction) a.ux3Swipe++;
    }
  }

  const p50 = (arr: number[]) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    return Math.round(s[Math.floor(s.length / 2)]! * 10) / 10;
  };
  const outCls: Record<string, any> = {};
  for (const k of ["NOG", "P1F", "P2F", "GRB", "OP2", "TLT", "TRT", "C1F", "C2F", "TUP"]) {
    const a = byCls[k];
    if (!a) continue;
    outCls[k] = {
      frames: a.frames,
      mpHands: a.mpHands,
      steer_zone_pct_base_ux1_ux3: [pct(a.baseSteer, a.mpHands), pct(a.ux1SteerZone, a.mpHands), pct(a.ux3SteerZone, a.mpHands)],
      dir_flips_min_base_ux1_ux3: [perMin(a.baseDirFlips, a.frames), perMin(a.ux1DirFlips, a.frames), perMin(a.ux3DirFlips, a.frames)],
      jump_min_base_ux1_ux3: [perMin(a.baseJumpFlips, a.frames), perMin(a.ux1JumpFlips, a.frames), perMin(a.ux3JumpFlips, a.frames)],
      erase_pct_base_rev_ux1_ux3: [pct(a.baseErase, a.mpHands), pct(a.revErase, a.mpHands), pct(a.ux1Erase, a.mpHands), pct(a.ux3Erase, a.mpHands)],
      pinch_pct_base_rev_ux1_ux3: [pct(a.basePinch, a.mpHands), pct(a.revPinch, a.mpHands), pct(a.ux1Pinch, a.mpHands), pct(a.ux3Pinch, a.mpHands)],
      swipe_rev_ux1_ux3: [a.revSwipe, a.ux1Swipe, a.ux3Swipe],
    };
  }
  return {
    params: ux3Params,
    p1f_activation_delay_p50_ms: { base: p50(p1fDelayBase), ux1: p50(p1fDelayUx1), ux3: p50(p1fDelayUx3) },
    classes: outCls,
  };
}

// 3 & 4. Evaluate Mendeley Low-Light / Natural-Light & N0/N1 Distractors
function evalMendeleyAndDistractors(ux3Params: Ux3PointingParams) {
  const data = JSON.parse(readFileSync(`${RESULTS_DIR}/ux3_mendeley_distractor_landmarks.json`, "utf8")) as {
    dim_light: Array<{ idx: number; aspect: number; raw: number[][][]; clahe320: number[][][]; adaptive_m3: number[][][] }>;
    natural_light: Array<{ idx: number; aspect: number; raw: number[][][]; clahe320: number[][][]; adaptive_m3: number[][][] }>;
    negatives: Array<{ name: string; strata: string; aspect: number; raw: number[][][]; clahe320: number[][][] }>;
  };

  const runMendeley = (rows: typeof data.dim_light, streamKey: "raw" | "clahe320" | "adaptive_m3") => {
    const asp = rows[0]?.aspect ?? 16 / 9;
    const baseFilter = new GameplayGestureFilter();
    const ux3Pipe = new Ux3RuntimePipeline(modelJson, asp, ux3Params);
    let det = 0, baseSteer = 0, ux3Steer = 0, baseErase = 0, ux3Erase = 0, basePinch = 0, ux3Pinch = 0, ux3Swipe = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const lms = r[streamKey];
      const tMs = i * 50; // ~20fps sequence
      if (!lms || !lms.length) {
        baseFilter.update(undefined, tMs);
        ux3Pipe.step(undefined, tMs, "none", 0, 0, 0);
        continue;
      }
      det++;
      const lm = toLm(lms[0]!);
      const revPose = classifyHandPose(lm, { experimentalRobust: true, aspect: r.aspect });
      const bPose = classifyHandPose(lm);
      const bCnt = countExtendedFingers(lm);
      const c = palmCenterNormalized(lm);
      const span = Math.hypot((lm[9]!.x - lm[0]!.x) * r.aspect, lm[9]!.y - lm[0]!.y);
      const ps = Math.max(span, Math.hypot((lm[17]!.x - lm[5]!.x) * r.aspect, lm[17]!.y - lm[5]!.y));

      const bf = baseFilter.update(lm, tMs);
      const u3 = ux3Pipe.step(lm, tMs, revPose, c.x, c.y, ps);
      if (bf.input.left || bf.input.right || bf.input.jump) baseSteer++;
      if (u3.steer.zone !== "stop") ux3Steer++;
      if ((bPose === "open-palm" || bPose === "split-palm") && bCnt === 5) baseErase++;
      if (u3.eraseActive) ux3Erase++;
      if (bPose === "pinch") basePinch++;
      if (u3.pinchActive) ux3Pinch++;
      if (u3.swipeAction) ux3Swipe++;
    }
    return {
      frames: rows.length,
      det_frames: det,
      det_pct: pct(det, rows.length),
      false_steer_pct_base_vs_ux3: [pct(baseSteer, rows.length), pct(ux3Steer, rows.length)],
      false_erase_pct_base_vs_ux3: [pct(baseErase, rows.length), pct(ux3Erase, rows.length)],
      pinch_pct_base_vs_ux3: [pct(basePinch, rows.length), pct(ux3Pinch, rows.length)],
      false_swipes_ux3: ux3Swipe,
    };
  };

  const runNeg = (strata: "N0" | "N1", modeKey: "raw" | "clahe320") => {
    const sub = data.negatives.filter((n) => n.strata === strata);
    let mpRaw = 0, ux3Steer = 0, ux3Erase = 0, ux3Pinch = 0, ux3Swipe = 0;
    const pipe = new Ux3RuntimePipeline(modelJson, sub[0]?.aspect ?? 4 / 3, ux3Params);
    for (let i = 0; i < sub.length; i++) {
      const r = sub[i]!;
      const lms = r[modeKey];
      if (!lms || !lms.length) {
        pipe.step(undefined, i * 33, "none", 0, 0, 0);
        continue;
      }
      mpRaw++;
      const lm = toLm(lms[0]!);
      const revPose = classifyHandPose(lm, { experimentalRobust: true, aspect: r.aspect });
      const c = palmCenterNormalized(lm);
      const span = Math.hypot((lm[9]!.x - lm[0]!.x) * r.aspect, lm[9]!.y - lm[0]!.y);
      const ps = Math.max(span, Math.hypot((lm[17]!.x - lm[5]!.x) * r.aspect, lm[17]!.y - lm[5]!.y));
      // Warm up 5 consecutive frames to test worst-case persistent distractor lock
      let last: ReturnType<Ux3RuntimePipeline["step"]> | null = null;
      pipe.reset();
      for (let rep = 0; rep < 5; rep++) {
        last = pipe.step(lm, rep * 33, revPose, c.x, c.y, ps);
      }
      if (last!.steer.zone !== "stop") ux3Steer++;
      if (last!.eraseActive) ux3Erase++;
      if (last!.pinchActive) ux3Pinch++;
      if (last!.swipeAction) ux3Swipe++;
    }
    return { scenes: sub.length, mp_false_hands: mpRaw, ux3_steer_5frames: ux3Steer, ux3_erase_5frames: ux3Erase, ux3_pinch: ux3Pinch, ux3_swipe: ux3Swipe };
  };

  return {
    mendeley_dim_light: {
      raw: runMendeley(data.dim_light, "raw"),
      clahe320: runMendeley(data.dim_light, "clahe320"),
      adaptive_m3: runMendeley(data.dim_light, "adaptive_m3"),
    },
    mendeley_natural_light: {
      raw: runMendeley(data.natural_light, "raw"),
      clahe320: runMendeley(data.natural_light, "clahe320"),
      adaptive_m3: runMendeley(data.natural_light, "adaptive_m3"),
    },
    distractors: {
      N0_raw: runNeg("N0", "raw"),
      N0_clahe320: runNeg("N0", "clahe320"),
      N1_raw: runNeg("N1", "raw"),
      N1_clahe320: runNeg("N1", "clahe320"),
    },
  };
}

// 5. Static shapes (FIVE vs FOUR vs THREE), PINCH_NEAR vs PINCH_TOUCH, and Thinman phase barrier
function evalStaticAndPinch(ux3Params: Ux3PointingParams) {
  const staticRes: Record<string, any> = {};
  for (const cls of ["palm", "stop", "four", "three", "one", "two_up", "peace", "fist"] as const) {
    const pipe = new Ux3RuntimePipeline(modelJson, 16 / 9, ux3Params);
    let eraseFires = 0, steerFires = 0, pinchFires = 0;
    const total = 15; // 5 consecutive frames x 3 rolls (-12, 0, +12 deg)
    for (const rollDeg of [-12, 0, 12]) {
      pipe.reset();
      const lm = placeHand(MEDIAN_SKELETONS[cls], { aspect: 16 / 9, rollDeg });
      const revPose = classifyHandPose(lm, { experimentalRobust: true, aspect: 16 / 9 });
      const c = palmCenterNormalized(lm);
      const ps = Math.max(
        Math.hypot((lm[9]!.x - lm[0]!.x) * (16 / 9), lm[9]!.y - lm[0]!.y),
        Math.hypot((lm[17]!.x - lm[5]!.x) * (16 / 9), lm[17]!.y - lm[5]!.y),
      );
      for (let f = 0; f < 5; f++) {
        const out = pipe.step(lm, f * 33, revPose, c.x, c.y, ps);
        if (f === 4) {
          // Wait: rollDeg 0 points UP (~90deg = jump), rollDeg +-12 points 78..102 = jump
          if (out.eraseActive) eraseFires++;
          if (out.steer.zone !== "stop") steerFires++;
          if (out.pinchActive) pinchFires++;
        }
      }
    }
    staticRes[cls] = {
      trials_3_rolls: 3,
      erase_active_on_frame5: eraseFires,
      steer_active_on_frame5: steerFires,
      pinch_active_on_frame5: pinchFires,
    };
  }

  // PINCH_NEAR vs PINCH_TOUCH sweep using realistic-hands pinchSkeleton
  const pinchSweep: Record<string, any> = {};
  for (const gap of [0.05, 0.15, 0.25, 0.35, 0.45, 0.60, 0.80]) {
    const pipe = new Ux3RuntimePipeline(modelJson, 16 / 9, ux3Params);
    let activeFrames = 0;
    for (let f = 0; f < 10; f++) {
      const lm = placeHand(pinchSkeleton(gap), { aspect: 16 / 9, cx: 0.5 + f * 0.0005 });
      const revPose = classifyHandPose(lm, { pinchHeld: f > 0 && activeFrames > 0, experimentalRobust: true, aspect: 16 / 9 });
      const c = palmCenterNormalized(lm);
      const ps = Math.max(
        Math.hypot((lm[9]!.x - lm[0]!.x) * (16 / 9), lm[9]!.y - lm[0]!.y),
        Math.hypot((lm[17]!.x - lm[5]!.x) * (16 / 9), lm[17]!.y - lm[5]!.y),
      );
      const out = pipe.step(lm, f * 33, revPose, c.x, c.y, ps);
      if (out.pinchActive) activeFrames++;
    }
    pinchSweep[`gap_${gap.toFixed(2)}`] = { pinch_active_frames_of_10: activeFrames };
  }

  return { static_median_poses: staticRes, pinch_gap_sweep_10frames: pinchSweep, one_dir_rolls_deg_85_0_neg85: evalOneDirs(ux3Params) };
}

function evalOneDirs(ux3Params: Ux3PointingParams) {
  const res: Record<string, any> = {};
  for (const [label, rollDeg] of [["left_85", 85], ["up_0", 0], ["right_-85", -85]] as const) {
    const pipe = new Ux3RuntimePipeline(modelJson, 16 / 9, ux3Params);
    const lm = placeHand(MEDIAN_SKELETONS.one, { aspect: 16 / 9, rollDeg });
    const revPose = classifyHandPose(lm, { experimentalRobust: true, aspect: 16 / 9 });
    const c = palmCenterNormalized(lm);
    const ps = Math.max(
      Math.hypot((lm[9]!.x - lm[0]!.x) * (16 / 9), lm[9]!.y - lm[0]!.y),
      Math.hypot((lm[17]!.x - lm[5]!.x) * (16 / 9), lm[17]!.y - lm[5]!.y),
    );
    let lastZone = "stop";
    for (let f = 0; f < 6; f++) lastZone = pipe.step(lm, f * 33, revPose, c.x, c.y, ps).steer.zone;
    res[label] = lastZone;
  }
  return res;
}

function main() {
  const parity = evalParityAndLatency();
  console.log("=== 0. PARITY & LATENCY ===", parity);

  const valVideos = JSON.parse(readFileSync(`${RESULTS_DIR}/ipn_val_person_seq.json`, "utf8")) as VideoSeq[];
  const valSweep = [0.40, 0.55, 0.70].map((tau) =>
    evalIpnSplit(valVideos, { ...DEFAULT_UX3_POINT_PARAMS, tauPoint1f: tau, tauEmaFloor: tau - 0.10 }),
  );
  console.log("=== 1. VAL SWEEP (P1F / NOG / P2F / GRB) ===");
  for (const v of valSweep) {
    console.log("tau=", v.params.tauPoint1f, "P1F=", v.classes.P1F.steer_zone_pct_base_ux1_ux3, "NOG=", v.classes.NOG.steer_zone_pct_base_ux1_ux3, "P2F=", v.classes.P2F.steer_zone_pct_base_ux1_ux3, "GRB=", v.classes.GRB.steer_zone_pct_base_ux1_ux3, "delay=", v.p1f_activation_delay_p50_ms);
  }

  // Pick tau=0.55 (balanced operating point from VAL) for single-shot LOCKED TEST + Mendeley + Static
  const chosenParams: Ux3PointingParams = { ...DEFAULT_UX3_POINT_PARAMS, tauPoint1f: 0.55, tauEmaFloor: 0.45 };
  const testVideos = JSON.parse(readFileSync(`${RESULTS_DIR}/ipn_test_person_seq.json`, "utf8")) as VideoSeq[];
  const testLocked = evalIpnSplit(testVideos, chosenParams);
  const mendeleyAndDist = evalMendeleyAndDistractors(chosenParams);
  const staticAndPinch = evalStaticAndPinch(chosenParams);

  const report = {
    model_artifact: `${RESULTS_DIR}/ux3_model_mlp.json`,
    parity_and_js_latency: parity,
    val_tau_sweep_summary: valSweep.map((v) => ({
      tauPoint1f: v.params.tauPoint1f,
      p1f_delay: v.p1f_activation_delay_p50_ms,
      NOG: v.classes.NOG,
      P1F: v.classes.P1F,
      P2F: v.classes.P2F,
      GRB: v.classes.GRB,
      OP2: v.classes.OP2,
      C1F: v.classes.C1F,
    })),
    test_locked_ab: testLocked,
    mendeley_and_distractors: mendeleyAndDist,
    static_and_pinch: staticAndPinch,
  };

  const outPath = `${RESULTS_DIR}/r18_ux3_exported_eval.json`;
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("=== 2. LOCKED TEST A/B (tau=0.55) ===", JSON.stringify(testLocked, null, 2));
  console.log("=== 3/4. MENDELEY & DISTRACTORS ===", JSON.stringify(mendeleyAndDist, null, 2));
  console.log("=== 5. STATIC & PINCH ===", JSON.stringify(staticAndPinch, null, 2));
}

main();

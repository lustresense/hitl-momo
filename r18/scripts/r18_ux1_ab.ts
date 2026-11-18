/**
 * R18-UX1 Paired A/B Evaluation:
 * Compares Baseline (`main` 3ef4cc3) vs Candidates (`ux1_candidates.ts`) on:
 *  1) Multi-aspect numerical steering accuracy & F8 non-pointing tests & phase barrier
 *  2) Person-disjoint VAL split (36 IPN HandS videos, 5 held-out persons) -> threshold check
 *  3) Person-disjoint TEST split (36 IPN HandS videos, 5 locked held-out persons) -> final paired A/B
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  GameplayGestureFilter,
  evaluateGameplayGesture,
  steerFromAngle,
} from "../repo/frontend/implementation/src/input/gameplay-gesture";
import {
  classifyHandPose,
  countExtendedFingers,
  palmCenterNormalized,
} from "../repo/frontend/implementation/src/input/hand-gesture";
import { SwipeCommander } from "../repo/frontend/implementation/src/components/nui-lab/lab-swipe";
import { pickPrimaryHand } from "../repo/frontend/implementation/src/camera/primary-hand";
import type { Landmark } from "../repo/frontend/implementation/src/input/types";
import {
  SafeSwipeGuard,
  VirtualKeySteeringFSM,
  indexPointAngleAspect,
  isIntentionalPointing,
  isPlausibleHandSkeleton,
  isSafeEraseFrame,
  isSafePinchFrame,
  type PointingPolicy,
} from "../candidates/ux1_candidates";

interface FrameRow { f: number; cls: string; gt: number[][][]; mp: number[][][]; }
interface VideoSeq { video: string; person: string; frames: FrameRow[]; }

const ASPECT_IPN = 4 / 3;
const DT_MS = 1000 / 30;
const toLm = (pts: number[][]): Landmark[] => pts.map(([x, y]) => ({ x: x!, y: y! }));

function makePointingHand(deg: number, aspect: number): Landmark[] {
  const rad = (deg * Math.PI) / 180;
  const base = { x: 0.5, y: 0.6 };
  const dx = (0.25 * Math.cos(rad)) / aspect;
  const dy = 0.25 * Math.sin(rad);
  const tip = { x: base.x - dx, y: base.y - dy };
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: base.x, y: base.y + 0.08, z: 0 }));
  lm[0] = { x: base.x, y: base.y + 0.16, z: 0 };
  lm[5] = base;
  lm[6] = { x: (base.x + tip.x) / 2, y: (base.y + tip.y) / 2, z: 0 };
  lm[7] = { x: base.x + (tip.x - base.x) * 0.75, y: base.y + (tip.y - base.y) * 0.75, z: 0 };
  lm[8] = tip;
  lm[9] = { x: base.x + 0.02 / aspect, y: base.y, z: 0 };
  return lm;
}

// 1. Numerical multi-aspect verification: baseline vs aspect-corrected
function evalGeometry() {
  const aspects = [
    { name: "1:1", r: 1 },
    { name: "5:4", r: 600 / 480 },
    { name: "4:3", r: 4 / 3 },
    { name: "16:9", r: 16 / 9 },
    { name: "9:16", r: 9 / 16 },
  ];
  const angles = [0, 15, 25, 35, 45, 55, 60, 70, 75, 85, 90, 95, 105, 115, 125, 135, 145, 165, 180, -35, -90];
  const out: Record<string, any> = {};
  for (const a of aspects) {
    let baseMaxErr = 0, candMaxErr = 0, baseMismatch = 0, candMismatch = 0;
    for (const deg of angles) {
      const lm = makePointingHand(deg, a.r);
      const b = evaluateGameplayGesture(lm).angle!;
      const c = indexPointAngleAspect(lm, a.r)!;
      const errB = Math.abs(((b - deg + 540) % 360) - 180);
      const errC = Math.abs(((c - deg + 540) % 360) - 180);
      baseMaxErr = Math.max(baseMaxErr, errB);
      candMaxErr = Math.max(candMaxErr, errC);
      if (steerFromAngle(b) !== steerFromAngle(deg)) baseMismatch++;
      if (steerFromAngle(c) !== steerFromAngle(deg)) candMismatch++;
    }
    out[a.name] = {
      baseline_max_err_deg: Math.round(baseMaxErr * 100) / 100,
      candidate_max_err_deg: Math.round(candMaxErr * 100) / 100,
      baseline_zone_mismatches: baseMismatch,
      candidate_zone_mismatches: candMismatch,
      total: angles.length,
    };
  }
  return out;
}

// 2. Phase barrier + tracking loss + jump policy + jitter boundary simulation
function evalFsmScenarios() {
  // Phase barrier: placing->gameplay while finger still pointing right (10 deg), then drops to neutral (-90), then points right (10 deg)
  const baseFilter = new GameplayGestureFilter();
  const candFsm = new VirtualKeySteeringFSM({
    pointingPolicy: "P1_aspect",
    jumpPolicy: "J2_edge",
    aspect: 1,
    dwellMs: 50,
    oppositeDwellMs: 66,
    rearmFrames: 3,
    hysteresisDeg: 5,
  });

  // Warm up 4 frames pointing right
  for (let i = 0; i < 4; i++) {
    const lm = makePointingHand(10, 1);
    baseFilter.update(lm, i * 33);
    candFsm.update(lm, i * 33);
  }
  // Phase change happens at frame 4 (placing -> gameplay), finger STILL pointing right for 3 frames!
  // Baseline GameplayGestureFilter has NO onPhaseChange barrier unless caller resets, and even if reset, re-arms after 3 frames while still pointing right!
  baseFilter.reset();
  candFsm.onPhaseChange();
  let baseCarryoverMoved = false;
  let candCarryoverMoved = false;
  for (let i = 4; i < 9; i++) {
    const lm = makePointingHand(10, 1);
    const b = baseFilter.update(lm, i * 33);
    const c = candFsm.update(lm, i * 33);
    if (b.input.right) baseCarryoverMoved = true;
    if (c.input.right) candCarryoverMoved = true;
  }
  // Now student relaxes to neutral (-90 deg) for 2 frames, then points right (10 deg) for 4 frames
  for (let i = 9; i < 11; i++) candFsm.update(makePointingHand(-90, 1), i * 33);
  let candMovedAfterNeutralRearm = false;
  for (let i = 11; i < 15; i++) {
    const c = candFsm.update(makePointingHand(10, 1), i * 33);
    if (c.input.right) candMovedAfterNeutralRearm = true;
  }

  // J1 vs J2 jump policy on 30 frames held at 90 deg
  const j1 = new VirtualKeySteeringFSM({ pointingPolicy: "P1_aspect", jumpPolicy: "J1_hold", aspect: 1, dwellMs: 50, oppositeDwellMs: 66, rearmFrames: 3, hysteresisDeg: 5 });
  const j2 = new VirtualKeySteeringFSM({ pointingPolicy: "P1_aspect", jumpPolicy: "J2_edge", aspect: 1, dwellMs: 50, oppositeDwellMs: 66, rearmFrames: 3, hysteresisDeg: 5 });
  let j1FramesTrue = 0, j2FramesTrue = 0;
  for (let i = 0; i < 30; i++) {
    const lm = makePointingHand(90, 1);
    if (j1.update(lm, i * 33).input.jump) j1FramesTrue++;
    if (j2.update(lm, i * 33).input.jump) j2FramesTrue++;
  }
  // Exit jump band (10 deg) then re-enter 90 deg -> J2 should fire again once
  for (let i = 30; i < 35; i++) j2.update(makePointingHand(10, 1), i * 33);
  let j2Rearmed = 0;
  for (let i = 35; i < 42; i++) if (j2.update(makePointingHand(90, 1), i * 33).input.jump) j2Rearmed++;

  // Face-anchor + primary-hand fallback scenario:
  // Frame 0: player hand near face (x=0.5, y=0.6), bystander far right (x=0.9, y=0.6)
  // Frame 5: face detector drops (null), bigger bystander appears -> lock must hold on player, not jump to bystander
  const playerHand = makePointingHand(90, 1).map((p) => ({ ...p, x: p.x - 0.05 }));
  const bystanderHand = makePointingHand(90, 1).map((p) => ({ x: p.x + 0.35, y: p.y, z: 0 }));
  const face = { x: 0.38, y: 0.25, w: 0.16, h: 0.24 };
  let pState = pickPrimaryHand([bystanderHand, playerHand], null, 0, face);
  const lockedWithFace = pState.index === 1;
  // Next frame face is null, bystander bigger -> lock keeps playerHand (index 1)
  pState = pickPrimaryHand([bystanderHand, playerHand], pState.state, 33, null);
  const keptLockOnFaceDrop = pState.index === 1;

  // Positive intentional Undo & Redo swipe test for SafeSwipeGuard
  const sw = new SafeSwipeGuard();
  let undoFiredAtMs: number | null = null;
  let redoFiredAtMs: number | null = null;
  // Hold one-finger still for 8 frames (264ms), then sweep leftward 2.4 spans in 360ms (~11 frames)
  for (let i = 0; i < 8; i++) sw.feed("one-finger", 0.70, 0.5, 0.20, i * 33);
  for (let i = 8; i < 20; i++) {
    const x = 0.70 - ((i - 8) / 11) * (2.4 * 0.20);
    if (sw.feed("one-finger", x, 0.5, 0.20, i * 33) === "undo" && undoFiredAtMs === null) {
      undoFiredAtMs = (i - 8) * 33;
    }
  }
  sw.reset();
  for (let i = 0; i < 8; i++) sw.feed("two-fingers", 0.30, 0.5, 0.20, i * 33);
  for (let i = 8; i < 20; i++) {
    const x = 0.30 + ((i - 8) / 11) * (2.4 * 0.20);
    if (sw.feed("two-fingers", x, 0.5, 0.20, i * 33) === "redo" && redoFiredAtMs === null) {
      redoFiredAtMs = (i - 8) * 33;
    }
  }

  return {
    phase_barrier_F10: { baseCarryoverMoved, candCarryoverMoved, candMovedAfterNeutralRearm },
    jump_policy_30frames_held: { j1_jump_true_frames: j1FramesTrue, j2_jump_true_frames: j2FramesTrue, j2_rearmed_after_exit: j2Rearmed },
    ownership_face_and_fallback: { lockedWithFace, keptLockOnFaceDrop },
    intentional_swipe_scenarios: { undoFiredAtMs, redoFiredAtMs },
  };
}

// 3. Evaluate on IPN HandS person-disjoint sequences (MPHands real predictions & GT reference)
function evalSequences(videos: VideoSeq[], cfg: { policy: PointingPolicy; dwellMs: number }) {
  // Compare Baseline vs Candidate across all videos on MPHands (what browser sees!)
  let gtEmptyFrames = 0, baseMpFalse = 0, candSkelFalse = 0;
  let gtPosMpFrames = 0, candSkelKeptReal = 0;

  // Action counters on MPHands per class
  type Acc = {
    frames: number; mpHands: number;
    baseSteer: number; candSteer: number; candZoneActive: number;
    baseDirFlips: number; candDirFlips: number;
    baseJumpFlips: number; candJumpFlips: number;
    baseEraseFrames: number; revEraseFrames: number; candEraseFrames: number;
    basePinchFrames: number; revPinchFrames: number; candPinchFrames: number;
    revSwipeFire: number; candSwipeFire: number;
  };
  const accByCls: Record<string, Acc> = {};
  const getAcc = (c: string): Acc => (accByCls[c] ??= {
    frames: 0, mpHands: 0, baseSteer: 0, candSteer: 0, candZoneActive: 0,
    baseDirFlips: 0, candDirFlips: 0, baseJumpFlips: 0, candJumpFlips: 0,
    baseEraseFrames: 0, revEraseFrames: 0, candEraseFrames: 0,
    basePinchFrames: 0, revPinchFrames: 0, candPinchFrames: 0,
    revSwipeFire: 0, candSwipeFire: 0,
  });

  // Activation latency measurement on P1F segments: frames from segment start with MP hand to first steering output
  const p1fActDelayBaseMs: number[] = [];
  const p1fActDelayCandMs: number[] = [];

  for (const vid of videos) {
    const baseFilter = new GameplayGestureFilter();
    const candFsm = new VirtualKeySteeringFSM({
      pointingPolicy: cfg.policy,
      jumpPolicy: "J2_edge",
      aspect: ASPECT_IPN,
      dwellMs: cfg.dwellMs,
      oppositeDwellMs: Math.max(cfg.dwellMs, 66),
      rearmFrames: 3,
      hysteresisDeg: 5,
    });
    const revSwipe = new SwipeCommander();
    const candSwipe = new SafeSwipeGuard();

    let prevBaseDir = "stop", prevCandDir = "stop";
    let prevBaseJump = false, prevCandJump = false;
    let revPinchHeld = false, candPinchHeld = false;
    let candEraseStreak = 0;
    let prevCls = "";
    let p1fStartMs: number | null = null;
    let p1fGotBase = false, p1fGotCand = false;

    for (let i = 0; i < vid.frames.length; i++) {
      const fr = vid.frames[i]!;
      const tMs = fr.f * DT_MS;
      const a = getAcc(fr.cls);
      a.frames++;

      if (fr.cls !== prevCls) {
        if (fr.cls === "P1F") {
          p1fStartMs = tMs;
          p1fGotBase = false;
          p1fGotCand = false;
        } else {
          p1fStartMs = null;
        }
        prevCls = fr.cls;
      }

      if (fr.gt.length === 0) {
        gtEmptyFrames++;
        if (fr.mp.length > 0) {
          baseMpFalse++;
          if (isPlausibleHandSkeleton(toLm(fr.mp[0]!), ASPECT_IPN)) candSkelFalse++;
        }
      } else if (fr.mp.length > 0) {
        gtPosMpFrames++;
        if (isPlausibleHandSkeleton(toLm(fr.mp[0]!), ASPECT_IPN)) candSkelKeptReal++;
      }

      if (fr.mp.length === 0) {
        baseFilter.update(undefined, tMs);
        candFsm.update(undefined, tMs);
        revSwipe.cancel("no-hand");
        candSwipe.reset();
        revPinchHeld = false;
        candPinchHeld = false;
        candEraseStreak = 0;
        prevBaseDir = "stop"; prevCandDir = "stop";
        prevBaseJump = false; prevCandJump = false;
        continue;
      }

      a.mpHands++;
      const lm = toLm(fr.mp[0]!);

      // Steering
      const bf = baseFilter.update(lm, tMs);
      const cf = candFsm.update(lm, tMs);
      const bMove = bf.input.left || bf.input.right || bf.input.jump;
      const cMove = cf.input.left || cf.input.right || cf.input.jump;
      if (bMove) a.baseSteer++;
      if (cMove) a.candSteer++;
      if (cf.zone !== "stop") a.candZoneActive++;

      if (p1fStartMs !== null) {
        if (bMove && !p1fGotBase) { p1fGotBase = true; p1fActDelayBaseMs.push(tMs - p1fStartMs); }
        if (cf.zone !== "stop" && !p1fGotCand) { p1fGotCand = true; p1fActDelayCandMs.push(tMs - p1fStartMs); }
      }

      const bDir = bf.input.left ? "L" : bf.input.right ? "R" : "stop";
      const cDir = cf.input.left ? "L" : cf.input.right ? "R" : "stop";
      if (bDir !== "stop" && prevBaseDir !== "stop" && bDir !== prevBaseDir) a.baseDirFlips++;
      if (cDir !== "stop" && prevCandDir !== "stop" && cDir !== prevCandDir) a.candDirFlips++;
      prevBaseDir = bDir;
      prevCandDir = cDir;

      if (bf.input.jump && !prevBaseJump) a.baseJumpFlips++;
      if (cf.input.jump && !prevCandJump) a.candJumpFlips++;
      prevBaseJump = bf.input.jump;
      prevCandJump = cf.input.jump;

      // Drawing / Erase / Pinch
      const basePose = classifyHandPose(lm);
      const baseCnt = countExtendedFingers(lm);
      const revPose = classifyHandPose(lm, { pinchHeld: revPinchHeld, experimentalRobust: true, aspect: ASPECT_IPN });
      const revCnt = countExtendedFingers(lm, { robustThumb: true, aspect: ASPECT_IPN });

      if ((basePose === "open-palm" || basePose === "split-palm") && baseCnt === 5) a.baseEraseFrames++;
      if ((revPose === "open-palm" || revPose === "split-palm") && revCnt === 5) a.revEraseFrames++;
      if (isSafeEraseFrame(lm, ASPECT_IPN)) candEraseStreak++;
      else candEraseStreak = 0;
      if (candEraseStreak >= 4) a.candEraseFrames++;

      if (basePose === "pinch") a.basePinchFrames++;
      if (revPose === "pinch") { a.revPinchFrames++; revPinchHeld = true; } else { revPinchHeld = false; }
      const cPinch = isSafePinchFrame(lm, candPinchHeld, ASPECT_IPN);
      if (cPinch) { a.candPinchFrames++; candPinchHeld = true; } else { candPinchHeld = false; }

      // Swipe
      const c = palmCenterNormalized(lm);
      const span = Math.hypot((lm[9]!.x - lm[0]!.x) * ASPECT_IPN, lm[9]!.y - lm[0]!.y);
      const knuckle = Math.hypot((lm[17]!.x - lm[5]!.x) * ASPECT_IPN, lm[17]!.y - lm[5]!.y);
      const palmScale = Math.max(span, knuckle);
      if (revSwipe.feed({ pose: revPose, x: c.x * ASPECT_IPN, y: c.y, spanPx: span, nowMs: tMs, permitted: true })) a.revSwipeFire++;
      if (candSwipe.feed(revPose, c.x * ASPECT_IPN, c.y, palmScale, tMs)) a.candSwipeFire++;
    }
  }

  const pct = (n: number, d: number) => (d > 0 ? Math.round((10000 * n) / d) / 100 : 0);
  const perMin = (n: number, frames: number) => (frames > 0 ? Math.round((n / (frames / 30 / 60)) * 100) / 100 : 0);

  const summarizeCls = (c: string) => {
    const a = accByCls[c];
    if (!a) return null;
    return {
      frames: a.frames,
      mpHands: a.mpHands,
      duration_min: Math.round((a.frames / 30 / 60) * 100) / 100,
      steer_pct_base_vs_cand_active_zone: [pct(a.baseSteer, a.mpHands), pct(a.candZoneActive, a.mpHands)],
      steer_edge_pct_cand: pct(a.candSteer, a.mpHands),
      dir_flips_per_min_base_vs_cand: [perMin(a.baseDirFlips, a.frames), perMin(a.candDirFlips, a.frames)],
      jump_triggers_per_min_base_vs_cand: [perMin(a.baseJumpFlips, a.frames), perMin(a.candJumpFlips, a.frames)],
      erase_pct_base_rev_cand: [pct(a.baseEraseFrames, a.mpHands), pct(a.revEraseFrames, a.mpHands), pct(a.candEraseFrames, a.mpHands)],
      pinch_pct_base_rev_cand: [pct(a.basePinchFrames, a.mpHands), pct(a.revPinchFrames, a.mpHands), pct(a.candPinchFrames, a.mpHands)],
      swipe_fires_rev_vs_cand: [a.revSwipeFire, a.candSwipeFire],
    };
  };

  p1fActDelayBaseMs.sort((a, b) => a - b);
  p1fActDelayCandMs.sort((a, b) => a - b);

  return {
    config: cfg,
    skeleton_plausibility: {
      gt_empty_frames: gtEmptyFrames,
      mp_false_before: baseMpFalse,
      mp_false_after_skel: candSkelFalse,
      false_hand_reduction_pct: baseMpFalse > 0 ? Math.round((10000 * (baseMpFalse - candSkelFalse)) / baseMpFalse) / 100 : 0,
      real_mp_frames: gtPosMpFrames,
      real_kept_pct: pct(candSkelKeptReal, gtPosMpFrames),
    },
    p1f_activation_delay_ms: {
      base_p50: p1fActDelayBaseMs[Math.floor(p1fActDelayBaseMs.length / 2)] ?? null,
      cand_p50: p1fActDelayCandMs[Math.floor(p1fActDelayCandMs.length / 2)] ?? null,
    },
    key_classes: Object.fromEntries(
      ["NOG", "P1F", "P2F", "GRB", "OP2", "TLT", "TRT", "C1F", "C2F", "TUP"]
        .map((k) => [k, summarizeCls(k)])
        .filter(([, v]) => v !== null),
    ),
  };
}

const valVideos = JSON.parse(readFileSync("/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/results/ipn_val_person_seq.json", "utf8")) as VideoSeq[];
const testVideos = JSON.parse(readFileSync("/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/results/ipn_test_person_seq.json", "utf8")) as VideoSeq[];

// Sweep VAL split across pointing policies & dwell
const valSweep = [
  evalSequences(valVideos, { policy: "P1_aspect", dwellMs: 50 }),
  evalSequences(valVideos, { policy: "P2_balanced", dwellMs: 50 }),
  evalSequences(valVideos, { policy: "P2_balanced", dwellMs: 66 }),
  evalSequences(valVideos, { policy: "P2_strict", dwellMs: 50 }),
];

// Run selected candidate (P2_balanced, dwellMs=50) ONCE on locked person-disjoint TEST split
const testLocked = evalSequences(testVideos, { policy: "P2_balanced", dwellMs: 50 });

const report = {
  geometry_multi_aspect: evalGeometry(),
  fsm_and_ownership_scenarios: evalFsmScenarios(),
  val_person_disjoint_sweep: valSweep,
  test_person_disjoint_locked_P2_balanced_50ms: testLocked,
};

writeFileSync("/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/results/r18_ux1_ab.json", JSON.stringify(report, null, 2));
console.log("=== GEOMETRY ===", JSON.stringify(report.geometry_multi_aspect, null, 2));
console.log("=== FSM SCENARIOS ===", JSON.stringify(report.fsm_and_ownership_scenarios, null, 2));
console.log("=== VAL SWEEP SUMMARY ===");
for (const v of valSweep) {
  console.log(v.config, "skel:", v.skeleton_plausibility, "NOG:", v.key_classes.NOG, "P1F:", v.key_classes.P1F);
}
console.log("=== LOCKED PERSON-DISJOINT TEST (P2_balanced, 50ms) ===");
console.log(JSON.stringify(testLocked, null, 2));

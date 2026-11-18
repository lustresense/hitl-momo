/**
 * R18-UX0-B step 2: Evaluate `main` (3ef4cc3) baseline vs R17 revised heuristics,
 * gameplay-gesture steering (F8 unintentional pointing), and R17 SwipeCommander
 * on continuous IPN HandS test sequences (52 videos, 640x480 -> aspect = 4/3).
 *
 * Uses `ipn_test_sequences.json` exported by `r18_ux0_b_ipn.py` (GT and MPHands).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { classifyHandPose, countExtendedFingers, evaluateGesture } from "../repo/frontend/implementation/src/input/hand-gesture";
import { evaluateGameplayGesture } from "../repo/frontend/implementation/src/input/gameplay-gesture";
import { SwipeCommander } from "../repo/frontend/implementation/src/components/nui-lab/lab-swipe";
import { palmCenterNormalized } from "../repo/frontend/implementation/src/input/hand-gesture";
import type { Landmark } from "../repo/frontend/implementation/src/input/types";

interface FrameRow {
  f: number;
  cls: string;
  gt: number[][][];
  mp: number[][][];
}

interface VideoSeq {
  video: string;
  frames: FrameRow[];
}

const ASPECT_IPN = 640 / 480; // IPN Hand videos are 640x480
const DT_MS = 1000 / 30; // IPN HandS timeline is 30 fps

const toLandmarks = (pts: number[][]): Landmark[] => pts.map(([x, y]) => ({ x: x!, y: y! }));

function evalSource(videos: VideoSeq[], source: "gt" | "mp") {
  type ClsStat = {
    frames: number;
    hasHand: number;
    baseErase: number;
    revErase: number;
    baseOne: number;
    revOne: number;
    baseTwo: number;
    revTwo: number;
    baseThree: number;
    revThree: number;
    baseThumbUp: number;
    revThumbUp: number;
    basePinch: number;
    revPinch: number;
    gpInputAny: number;
    gpJump: number;
    swipeUndoFired: number;
    swipeRedoFired: number;
  };
  const emptyStat = (): ClsStat => ({
    frames: 0, hasHand: 0, baseErase: 0, revErase: 0,
    baseOne: 0, revOne: 0, baseTwo: 0, revTwo: 0,
    baseThree: 0, revThree: 0, baseThumbUp: 0, revThumbUp: 0,
    basePinch: 0, revPinch: 0, gpInputAny: 0, gpJump: 0,
    swipeUndoFired: 0, swipeRedoFired: 0,
  });

  const byCls: Record<string, ClsStat> = {};
  const swipeRev = new SwipeCommander();
  let totalFrames = 0;

  for (const vid of videos) {
    swipeRev.reset();
    for (let i = 0; i < vid.frames.length; i++) {
      const fr = vid.frames[i]!;
      const st = (byCls[fr.cls] ??= emptyStat());
      st.frames++;
      totalFrames++;
      const hands = fr[source];
      if (!hands || hands.length === 0) {
        swipeRev.cancel("no-hand");
        continue;
      }
      st.hasHand++;
      // Pick first/primary hand in single-hand IPN sequence
      const lm = toLandmarks(hands[0]!);
      const basePose = classifyHandPose(lm);
      const baseCount = countExtendedFingers(lm);
      const revPose = classifyHandPose(lm, { experimentalRobust: true, aspect: ASPECT_IPN });
      const revCount = countExtendedFingers(lm, { robustThumb: true, aspect: ASPECT_IPN });

      if ((basePose === "open-palm" || basePose === "split-palm") && baseCount === 5) st.baseErase++;
      if ((revPose === "open-palm" || revPose === "split-palm") && revCount === 5) st.revErase++;
      if (basePose === "one-finger") st.baseOne++;
      if (revPose === "one-finger") st.revOne++;
      if (basePose === "two-fingers") st.baseTwo++;
      if (revPose === "two-fingers") st.revTwo++;
      if (basePose === "three-fingers") st.baseThree++;
      if (revPose === "three-fingers") st.revThree++;
      if (basePose === "thumb-up") st.baseThumbUp++;
      if (revPose === "thumb-up") st.revThumbUp++;
      if (basePose === "pinch") st.basePinch++;
      if (revPose === "pinch") st.revPinch++;

      const gp = evaluateGameplayGesture(lm);
      if (gp.input.left || gp.input.right || gp.input.jump) st.gpInputAny++;
      if (gp.input.jump) st.gpJump++;

      // SwipeCommander using revised pose on IPN 30fps timeline
      const w = lm[0]!;
      const m = lm[9]!;
      const c = palmCenterNormalized(lm);
      const span = Math.hypot((m.x - w.x) * ASPECT_IPN, m.y - w.y);
      const sw = swipeRev.feed({
        pose: revPose,
        x: c.x * ASPECT_IPN,
        y: c.y,
        spanPx: span,
        nowMs: fr.f * DT_MS,
        permitted: true,
      });
      if (sw === "undo") st.swipeUndoFired++;
      if (sw === "redo") st.swipeRedoFired++;
    }
  }

  const pct = (num: number, den: number) => (den > 0 ? Math.round((10000 * num) / den) / 100 : 0);
  const formatted: Record<string, any> = {};
  for (const [cls, st] of Object.entries(byCls).sort((a, b) => b[1].frames - a[1].frames)) {
    formatted[cls] = {
      frames: st.frames,
      hasHand: st.hasHand,
      baseErasePctOfHand: pct(st.baseErase, st.hasHand),
      revErasePctOfHand: pct(st.revErase, st.hasHand),
      baseOnePct: pct(st.baseOne, st.hasHand),
      revOnePct: pct(st.revOne, st.hasHand),
      baseTwoPct: pct(st.baseTwo, st.hasHand),
      revTwoPct: pct(st.revTwo, st.hasHand),
      baseThreePct: pct(st.baseThree, st.hasHand),
      revThreePct: pct(st.revThree, st.hasHand),
      baseThumbUpPct: pct(st.baseThumbUp, st.hasHand),
      revThumbUpPct: pct(st.revThumbUp, st.hasHand),
      basePinchPct: pct(st.basePinch, st.hasHand),
      revPinchPct: pct(st.revPinch, st.hasHand),
      gpAnyMoveOrJumpPct: pct(st.gpInputAny, st.hasHand),
      gpJumpPct: pct(st.gpJump, st.hasHand),
      swipeUndoFired: st.swipeUndoFired,
      swipeRedoFired: st.swipeRedoFired,
    };
  }
  return { totalFrames, videos: videos.length, byClass: formatted };
}

const rawPath = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/results/ipn_test_sequences.json";
const videos = JSON.parse(readFileSync(rawPath, "utf8")) as VideoSeq[];
const out = {
  dataset: "IPN HandS official test split (52 videos, 640x480, CC BY 4.0)",
  aspect: ASPECT_IPN,
  gt_landmarks: evalSource(videos, "gt"),
  mp_hands_landmarks: evalSource(videos, "mp"),
};
writeFileSync("/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/results/r18_ux0_b_ipn_rules.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

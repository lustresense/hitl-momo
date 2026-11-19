/**
 * R20 Feature Invariance, Weight Format Parity (`S0 FP32 JSON / Binary / S1 INT8 / S3 QAT`),
 * and Multi-Hand Ownership / Bystander Anti-Distraction Stress Test (`test_r20_invariants_and_ownership.ts`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { pickPrimaryHand } from "../../../r18-ux0-sandbox/repo/frontend/implementation/src/camera/primary-hand";
import { FullFrameHandLock } from "../../../r18-ux0-sandbox/repo/frontend/implementation/src/components/nui-lab/lab-hand-lock";
import { MEDIAN_SKELETONS, placeHand } from "../../../r18-ux0-sandbox/repo/frontend/implementation/tests/input/realistic-hands";
import type { Landmark } from "../../r19/candidates/pistol_types";
import { R19_FEATURE_COUNT, R19FeatureTracker } from "../../r19/candidates/r19_features";
import { R19RuntimePipeline } from "../../r19/candidates/r19_integrated";
import type { R19ExportedModel } from "../../r19/candidates/r19_model";
import {
  R20Fp32BinaryClassifier,
  R20Fp32JsonClassifier,
  R20Int8Classifier,
  type R20ExportedInt8Model,
} from "../candidates/r20_model";

const SANDBOX = process.env.R20_SANDBOX || "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const REPO = process.env.R20_REPO || "/srv/sketchbook/mediapipe-optimize/research-can";

function testScaleAndAspectInvariance() {
  let maxScaleDiff = 0;
  let maxAspectDiff = 0;
  for (const cls of Object.keys(MEDIAN_SKELETONS) as Array<keyof typeof MEDIAN_SKELETONS>) {
    const baseLm = placeHand(MEDIAN_SKELETONS[cls], { aspect: 1, rollDeg: 27, cx: 0.45, cy: 0.65, scale: 0.45 });
    const t0 = new R19FeatureTracker();
    const v0 = t0.extract(baseLm, 0, 1)!;
    for (const sc of [0.11, 0.22, 0.45, 0.75]) {
      for (const a of [4 / 3, 16 / 9, 1.0]) {
        const lm = placeHand(MEDIAN_SKELETONS[cls], { aspect: a, rollDeg: 27, cx: 0.45, cy: 0.65, scale: sc });
        const v = new R19FeatureTracker().extract(lm, 0, a)!;
        for (let i = 0; i < R19_FEATURE_COUNT; i++) {
          const d = Math.abs(v[i]! - v0[i]!);
          if (a === 1 && d > maxScaleDiff) maxScaleDiff = d;
          if (d > maxAspectDiff) maxAspectDiff = d;
        }
      }
    }
  }
  if (maxAspectDiff > 1e-9) {
    throw new Error(`Feature invariance failed: maxAspectDiff=${maxAspectDiff}`);
  }
  return {
    featuresChecked: R19_FEATURE_COUNT,
    maxScaleDiff: Number(maxScaleDiff.toExponential(3)),
    maxAspectDiff: Number(maxAspectDiff.toExponential(3)),
    pass: true,
  };
}

function testWeightFormatsParity() {
  const jsonModel = JSON.parse(
    readFileSync(`${REPO}/r20/models/r20_model_c4_full_mlp.json`, "utf8"),
  ) as R19ExportedModel;
  const int8Model = JSON.parse(
    readFileSync(`${SANDBOX}/models/c4_full/r20_c4_full_int8.json`, "utf8"),
  ) as R20ExportedInt8Model;
  const qatInt8Model = JSON.parse(
    readFileSync(`${SANDBOX}/models/kd_ablation/r20_s3_qat_int8.json`, "utf8"),
  ) as R20ExportedInt8Model;
  const binBuf = readFileSync(`${SANDBOX}/models/c4_full/r20_c4_full.f32`);
  const parityRows = JSON.parse(
    readFileSync(`${SANDBOX}/models/c4_full/r20_c4_full_parity_rows.json`, "utf8"),
  ) as Array<{ X: number[]; y: number; probs: number[] }>;

  const fp32JsonClf = new R20Fp32JsonClassifier(jsonModel);
  const fp32BinClf = new R20Fp32BinaryClassifier(
    binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.byteLength),
    [82, 64, 32, 3],
    jsonModel.labels,
  );
  const int8PtqClf = new R20Int8Classifier(int8Model);
  const int8QatClf = new R20Int8Classifier(qatInt8Model);

  let binArgmaxMismatch = 0;
  let maxBinProbDiff = 0;
  let int8PtqArgmaxMismatch = 0;
  let maxInt8PtqProbDiff = 0;

  for (const r of parityRows) {
    const pJson = fp32JsonClf.proba(r.X);
    const pBin = fp32BinClf.proba(r.X);
    const pI8 = int8PtqClf.proba(r.X);
    const aJson = pJson.indexOf(Math.max(...pJson));
    const aBin = pBin.indexOf(Math.max(...pBin));
    const aI8 = pI8.indexOf(Math.max(...pI8));
    if (aJson !== aBin) binArgmaxMismatch++;
    if (aJson !== aI8) int8PtqArgmaxMismatch++;
    for (let k = 0; k < 3; k++) {
      maxBinProbDiff = Math.max(maxBinProbDiff, Math.abs(pJson[k]! - pBin[k]!));
      maxInt8PtqProbDiff = Math.max(maxInt8PtqProbDiff, Math.abs(pJson[k]! - pI8[k]!));
    }
  }
  if (binArgmaxMismatch !== 0 || int8PtqArgmaxMismatch !== 0) {
    throw new Error(`Weight format parity mismatch: bin=${binArgmaxMismatch}, int8=${int8PtqArgmaxMismatch}`);
  }
  return {
    rowsChecked: parityRows.length,
    s0_fp32_json_bytes: readFileSync(`${REPO}/r20/models/r20_model_c4_full_mlp.json`).byteLength,
    s0_fp32_binary_bytes: binBuf.byteLength,
    s0_fp32_binary_argmax_mismatch: binArgmaxMismatch,
    s0_fp32_binary_max_prob_diff: Number(maxBinProbDiff.toExponential(3)),
    s1_int8_ptq_packed_bytes: int8Model.packed_binary_bytes,
    s1_int8_ptq_argmax_mismatch_vs_fp32: int8PtqArgmaxMismatch,
    s1_int8_ptq_max_prob_diff_vs_fp32: Number(maxInt8PtqProbDiff.toExponential(3)),
    s3_int8_qat_packed_bytes: qatInt8Model.packed_binary_bytes,
    s3_int8_qat_smoke_pred: int8QatClf.predict(parityRows[0]!.X).topLabel,
  };
}

function testMultiHandOwnershipAndAntiDistraction() {
  const model = JSON.parse(
    readFileSync(`${REPO}/r20/models/r20_model_c4_full_mlp.json`, "utf8"),
  ) as R19ExportedModel;
  const aspect = 16 / 9;

  // Scenario O1: Owner hand locked at (0.45, 0.60, scale=0.28); larger bystander hand (scale=0.38) enters at (0.80, 0.55) doing POINT_PRESS
  const lock1 = new FullFrameHandLock();
  const pipe1 = new R19RuntimePipeline(model, aspect);
  let ownerAcqId = -1;
  let bystanderStoleLock = false;
  let bystanderTriggeredPress = false;

  for (let f = 0; f < 40; f++) {
    const nowMs = f * 33;
    const ownerHand = placeHand(MEDIAN_SKELETONS.one, {
      aspect,
      cx: 0.45 + f * 0.001,
      cy: 0.60,
      scale: 0.28,
      rollDeg: 85,
    });
    const bystanderPress = placeHand(MEDIAN_SKELETONS.thumb_index, {
      aspect,
      cx: 0.82,
      cy: 0.55,
      scale: 0.38,
      rollDeg: 85,
    });
    const hands: Landmark[][] = f >= 10 ? [bystanderPress, ownerHand] : [ownerHand];
    const pick = lock1.pick(hands, nowMs);
    if (f === 5) ownerAcqId = lock1.acquisitionId;
    if (f >= 10) {
      if (lock1.acquisitionId !== ownerAcqId || pick.index !== 1) {
        bystanderStoleLock = true;
      }
    }
    const pickedLm = pick.index !== null ? hands[pick.index]! : undefined;
    const step = pipe1.step(pickedLm, nowMs, "one-finger", 0.45, 0.60, 0.28);
    if (f >= 10 && step.geomState === "POINT_PRESS") {
      bystanderTriggeredPress = true;
    }
  }

  // Scenario O2: Owner hand holding POINT_PRESS leaves frame at f=15 while bystander hand stays in frame
  const lock2 = new FullFrameHandLock();
  const pipe2 = new R19RuntimePipeline(model, aspect);
  let stuckAfterOwnerExit = false;
  let bystanderTookOverOnOwnerExit = false;

  for (let f = 0; f < 30; f++) {
    const nowMs = f * 33;
    const ownerPress = placeHand(MEDIAN_SKELETONS.thumb_index, {
      aspect,
      cx: 0.42,
      cy: 0.60,
      scale: 0.28,
      rollDeg: 85,
    });
    const bystanderPalm = placeHand(MEDIAN_SKELETONS.palm, {
      aspect,
      cx: 0.80,
      cy: 0.55,
      scale: 0.32,
    });
    const hands: Landmark[][] = f < 5 ? [ownerPress] : f < 15 ? [ownerPress, bystanderPalm] : [bystanderPalm];
    const pick = lock2.pick(hands, nowMs);
    const pickedLm = pick.index !== null ? hands[pick.index]! : undefined;
    const step = pipe2.step(pickedLm, nowMs, "one-finger", 0.42, 0.60, 0.28);
    if (f === 16) {
      // Immediately after owner hand exits at f=15, lock must drop (not jump 0.38 distance to bystander in 1 frame!)
      if (pick.index !== null) bystanderTookOverOnOwnerExit = true;
      if (step.fsm.input.left || step.fsm.input.right || step.fsm.input.jump) {
        stuckAfterOwnerExit = true;
      }
    }
  }

  // Scenario O3: Primary-hand face-anchor guard (hand inside player's face region beats distant bystander hand)
  const playerFace = { x: 0.40, y: 0.20, w: 0.16, h: 0.22 };
  const playerHand = placeHand(MEDIAN_SKELETONS.one, { aspect, cx: 0.46, cy: 0.58, scale: 0.26 });
  const farBystander = placeHand(MEDIAN_SKELETONS.thumb_index, { aspect, cx: 0.90, cy: 0.50, scale: 0.27 });
  const pick3 = pickPrimaryHand([farBystander, playerHand], null, 100, playerFace);
  const faceAnchorPickedOwner = pick3.index === 1;

  if (bystanderStoleLock || bystanderTriggeredPress || stuckAfterOwnerExit || bystanderTookOverOnOwnerExit || !faceAnchorPickedOwner) {
    throw new Error(
      `Ownership stress test failed: stole=${bystanderStoleLock} press=${bystanderTriggeredPress} ` +
        `stuck=${stuckAfterOwnerExit} exitTakeover=${bystanderTookOverOnOwnerExit} facePick=${faceAnchorPickedOwner}`,
    );
  }

  return {
    O1_bystander_larger_press_while_owner_locked: {
      bystanderStoleLock,
      bystanderTriggeredPress,
      pass: !bystanderStoleLock && !bystanderTriggeredPress,
    },
    O2_owner_exits_while_bystander_remains: {
      bystanderImmediateJumpTakeover: bystanderTookOverOnOwnerExit,
      stuckKeysAfterOwnerExit: stuckAfterOwnerExit,
      pass: !bystanderTookOverOnOwnerExit && !stuckAfterOwnerExit,
    },
    O3_face_anchor_disambiguation: {
      faceAnchorPickedOwner,
      pass: faceAnchorPickedOwner,
    },
  };
}

function main() {
  const t0 = performance.now();
  const invariance = testScaleAndAspectInvariance();
  const weightFormats = testWeightFormatsParity();
  const ownership = testMultiHandOwnershipAndAntiDistraction();
  const out = {
    elapsedMs: Math.round((performance.now() - t0) * 100) / 100,
    invariance,
    weightFormats,
    ownership,
    allPass: true,
  };
  writeFileSync(`${REPO}/r20/results/r20_invariants_and_ownership.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main();

/**
 * R20 Comprehensive End-to-End Evaluation, TS Parity, Latency & Disjoint OOD Suite (`eval_r20_all.ts`).
 *
 * Evaluates frozen baseline `C0 (R19 G3/G4)` alongside GPU-trained R20 candidates:
 *  - `C1_balanced`    : 3 valid R19 datasets with capped class/source balancing (`[82->64->32->3]`)
 *  - `C2_pos_light`   : + re-extracted MediaPipe landmarks from 12-stratum low-light/backlight/blur/scale HG5G TRAIN images
 *  - `C3_hard_neg`    : + audited `OTHER` hard negatives from `HANDS RGB-D Subject1..2` & `bxr7 Gomoku/Poker` train chunk
 *  - `C4_full`        : focal-loss curriculum variant on `r20_c3_feat`
 *  - `C6_supervised`  : supervised student control (`λ_KD = 0`)
 *  - `C7_distilled`   : teacher–student distilled (`T-IMG MobileNetV3-Small OOF + T-ENSEMBLE -> S-SPATIAL`)
 *  - `S0_fp32_bin`    : compact binary Float32Array weights
 *  - `S1_int8_ptq`    : per-channel INT8 post-training quantized weights
 *  - `S3_int8_qat`    : quantization-aware trained INT8 weights
 *
 * Across 8 distinct evaluation suites:
 *  1) Python/GPU <-> TypeScript/CPU numerical parity (160 rows/model, 0 argmax mismatch gate) & CPU microsecond latency
 *  2) Locked HandGesture-5G TEST (n=230: overall, palmar vs dorsal, exposure buckets, L0 vs L1)
 *  3) Locked Natural RGB v3 TEST (888 hands across 6 lighting strata + point_left/right conversational pointing audit)
 *  4) Locked IPN HandS TEST (36 continuous 30 Hz videos across 5 unseen subjects: NOG, P2F, P1F, all other)
 *  5) Session-disjoint Mendeley bxr7kx84y6 599-frame distractors (Chinese Chess, Dice, Meeting Chess, Aeroplane Chess, Checkers)
 *  6) New Session-Disjoint bxr7 Gomoku/Poker holdout OOD test (85 hands)
 *  7) Person-Disjoint HANDS RGB-D Subject4..5 OOD test (1,080 frames, 2,092 matched hands) + full Subject1..5 reference
 *  8) N0/N1 adversarial pistol distractors (33 scenes) + 50 Hz JumpAssist RIGHT -> RIGHT+JUMP -> RIGHT continuity
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createInterface } from "node:readline";

import { JumpAssist } from "../../../r18-ux0-sandbox/repo/frontend/implementation/src/game/jump-assist";
import { InputArbiter } from "../../../r18-ux0-sandbox/repo/frontend/implementation/src/input/arbiter";
import { classifyHandPose, palmCenterNormalized } from "../../../r18-ux0-sandbox/repo/frontend/implementation/src/input/hand-gesture";
import { MEDIAN_SKELETONS, placeHand } from "../../../r18-ux0-sandbox/repo/frontend/implementation/tests/input/realistic-hands";
import type { Landmark } from "../../r19/candidates/pistol_types";
import { R19_LABELS, R19FeatureTracker, type R19Label } from "../../r19/candidates/r19_features";
import {
  DEFAULT_R19_HYBRID_PARAMS,
  R19RuntimePipeline,
  resolveHybridPistolClassification,
} from "../../r19/candidates/r19_integrated";
import type { R19ExportedModel } from "../../r19/candidates/r19_model";
import {
  R20Fp32BinaryClassifier,
  R20Fp32JsonClassifier,
  R20Int8Classifier,
  type R20ExportedInt8Model,
} from "../candidates/r20_model";

const SANDBOX = process.env.R20_SANDBOX || "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const R19_SANDBOX = process.env.R19_SANDBOX || "/srv/sketchbook/mediapipe-optimize/r19-sandbox";
const REPO = process.env.R20_REPO || "/srv/sketchbook/mediapipe-optimize/research-can";
const PYTHON_BIN = process.env.R20_PYTHON || `${SANDBOX}/.venv/bin/python`;

const HG5G_JSONL = `${R19_SANDBOX}/data/handgesture_5g_derived/handgesture_5g_landmarks.jsonl`;
const N66_JSONL = `${R19_SANDBOX}/data/n66hhk695h_v3_derived/n66hhk695h_v3_landmarks.jsonl`;
const HRGBD_JSONL = `${R19_SANDBOX}/data/hands_rgbd_eval/hands_rgbd_landmarks.jsonl`;
const STREAM_IPN_PY = `${REPO}/r19/scripts/stream_ipn_split.py`;
const MENDELEY_599_JSON = `${REPO}/r18/results/ux3_mendeley_distractor_landmarks.json`;
const BXR7_OOD_JSONL = `${SANDBOX}/data/hard_neg/bxr7_gomoku_poker_ood_test.jsonl`;
const N0_N1_JSON = `${REPO}/r19/results/n0_n1_distractor_landmarks.json`;

const LABEL_TO_ID: Record<R19Label, number> = { POINT_READY: 0, POINT_PRESS: 1, OTHER: 2 };
const N66_OTHER_CLASSES = new Set([
  "thumbs_up", "thumbs_down", "peace_sign", "ok_sign", "fist",
  "stop", "raised_hand", "palm_down_push", "wave", "come_here", "go",
]);

const toLm = (pts: number[][]): Landmark[] => pts.map((p) => ({ x: p[0]!, y: p[1]!, z: p[2] ?? 0 }));
const pct = (n: number, d: number) => (d > 0 ? Math.round((10000 * n) / d) / 100 : 0);
const perMin = (n: number, frames: number) => (frames > 0 ? Math.round((n / (frames / 30 / 60)) * 100) / 100 : 0);

function quant(arr: number[], q: number): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]! * 100) / 100;
}

function confMetrics3(conf: number[][]) {
  let tot = 0;
  let ok = 0;
  const prec: number[] = [];
  const rec: number[] = [];
  const f1s: number[] = [];
  for (let i = 0; i < 3; i++) {
    let sup = 0;
    let pred = 0;
    for (let j = 0; j < 3; j++) {
      tot += conf[i]![j]!;
      sup += conf[i]![j]!;
      pred += conf[j]![i]!;
    }
    const tp = conf[i]![i]!;
    ok += tp;
    const p = pred > 0 ? tp / pred : 0;
    const r = sup > 0 ? tp / sup : 0;
    const f1 = p + r > 0 ? (2 * p * r) / (p + r) : 0;
    prec.push(Math.round(p * 10000) / 10000);
    rec.push(Math.round(r * 10000) / 10000);
    f1s.push(Math.round(f1 * 10000) / 10000);
  }
  const activeF1 = f1s.filter((_, i) => conf[i]!.reduce((a, b) => a + b, 0) > 0);
  return {
    n: tot,
    acc: Math.round((ok / Math.max(1, tot)) * 10000) / 10000,
    macroF1: Math.round((activeF1.reduce((a, b) => a + b, 0) / Math.max(1, activeF1.length)) * 10000) / 10000,
    f1_ready: f1s[0]!,
    f1_press: f1s[1]!,
    f1_other: f1s[2]!,
    recall_ready: rec[0]!,
    recall_press: rec[1]!,
    precision_press: prec[1]!,
    other_to_press: conf[2]![1]!,
    ready_to_press: conf[0]![1]!,
    other_to_ready: conf[2]![0]!,
    confusion: conf,
  };
}

interface CandidateEntry {
  id: string;
  modelPath: string;
  parityPath?: string;
  int8Path?: string;
  f32Path?: string;
  trainedOnHandsRgbdS1S2: boolean;
  trainedOnBxr7GomokuPoker: boolean;
  model: R19ExportedModel;
  clf: R20Fp32JsonClassifier;
}

function loadCandidates(): CandidateEntry[] {
  const specs: Array<{
    id: string;
    modelPath: string;
    parityPath?: string;
    int8Path?: string;
    f32Path?: string;
    trainedOnHandsRgbdS1S2: boolean;
    trainedOnBxr7GomokuPoker: boolean;
  }> = [
    {
      id: "C0_R19_frozen",
      modelPath: `${REPO}/r19/models/r19_model_mlp.json`,
      parityPath: `${R19_SANDBOX}/models_v1/r19_parity_rows.json`,
      trainedOnHandsRgbdS1S2: false,
      trainedOnBxr7GomokuPoker: false,
    },
    {
      id: "C1_R20_balanced",
      modelPath: `${SANDBOX}/models/c1_balanced/r20_c1_balanced.json`,
      parityPath: `${SANDBOX}/models/c1_balanced/r20_c1_balanced_parity_rows.json`,
      int8Path: `${SANDBOX}/models/c1_balanced/r20_c1_balanced_int8.json`,
      f32Path: `${SANDBOX}/models/c1_balanced/r20_c1_balanced.f32`,
      trainedOnHandsRgbdS1S2: false,
      trainedOnBxr7GomokuPoker: false,
    },
    {
      id: "C2_R20_pos_light",
      modelPath: `${SANDBOX}/models/c2_pos_light/r20_c2_pos_light.json`,
      parityPath: `${SANDBOX}/models/c2_pos_light/r20_c2_pos_light_parity_rows.json`,
      int8Path: `${SANDBOX}/models/c2_pos_light/r20_c2_pos_light_int8.json`,
      f32Path: `${SANDBOX}/models/c2_pos_light/r20_c2_pos_light.f32`,
      trainedOnHandsRgbdS1S2: false,
      trainedOnBxr7GomokuPoker: false,
    },
    {
      id: "C3_R20_hard_neg",
      modelPath: `${SANDBOX}/models/c3_hard_neg/r20_c3_hard_neg.json`,
      parityPath: `${SANDBOX}/models/c3_hard_neg/r20_c3_hard_neg_parity_rows.json`,
      int8Path: `${SANDBOX}/models/c3_hard_neg/r20_c3_hard_neg_int8.json`,
      f32Path: `${SANDBOX}/models/c3_hard_neg/r20_c3_hard_neg.f32`,
      trainedOnHandsRgbdS1S2: true,
      trainedOnBxr7GomokuPoker: true,
    },
    {
      id: "C4_R20_full_focal",
      modelPath: `${SANDBOX}/models/c4_full/r20_c4_full.json`,
      parityPath: `${SANDBOX}/models/c4_full/r20_c4_full_parity_rows.json`,
      int8Path: `${SANDBOX}/models/c4_full/r20_c4_full_int8.json`,
      f32Path: `${SANDBOX}/models/c4_full/r20_c4_full.f32`,
      trainedOnHandsRgbdS1S2: true,
      trainedOnBxr7GomokuPoker: true,
    },
    {
      id: "C6_R20_supervised_no_teacher",
      modelPath: `${SANDBOX}/models/kd_ablation/r20_c6_supervised_no_teacher.json`,
      parityPath: `${SANDBOX}/models/kd_ablation/r20_c6_supervised_no_teacher_parity_rows.json`,
      int8Path: `${SANDBOX}/models/kd_ablation/r20_c6_supervised_no_teacher_int8.json`,
      f32Path: `${SANDBOX}/models/kd_ablation/r20_c6_supervised_no_teacher.f32`,
      trainedOnHandsRgbdS1S2: true,
      trainedOnBxr7GomokuPoker: true,
    },
    {
      id: "C7_R20_distilled_l025_T2",
      modelPath: `${SANDBOX}/models/kd_ablation/r20_c7_kd_l025_t2.json`,
      parityPath: `${SANDBOX}/models/kd_ablation/r20_c7_kd_l025_t2_parity_rows.json`,
      int8Path: `${SANDBOX}/models/kd_ablation/r20_c7_kd_l025_t2_int8.json`,
      f32Path: `${SANDBOX}/models/kd_ablation/r20_c7_kd_l025_t2.f32`,
      trainedOnHandsRgbdS1S2: true,
      trainedOnBxr7GomokuPoker: true,
    },
    {
      id: "C7_R20_distilled_l050_T2",
      modelPath: `${SANDBOX}/models/kd_ablation/r20_c7_kd_l050_t2.json`,
      parityPath: `${SANDBOX}/models/kd_ablation/r20_c7_kd_l050_t2_parity_rows.json`,
      int8Path: `${SANDBOX}/models/kd_ablation/r20_c7_kd_l050_t2_int8.json`,
      f32Path: `${SANDBOX}/models/kd_ablation/r20_c7_kd_l050_t2.f32`,
      trainedOnHandsRgbdS1S2: true,
      trainedOnBxr7GomokuPoker: true,
    },
    {
      id: "C7_R20_distilled_l050_T4",
      modelPath: `${SANDBOX}/models/kd_ablation/r20_c7_kd_l050_t4.json`,
      parityPath: `${SANDBOX}/models/kd_ablation/r20_c7_kd_l050_t4_parity_rows.json`,
      int8Path: `${SANDBOX}/models/kd_ablation/r20_c7_kd_l050_t4_int8.json`,
      f32Path: `${SANDBOX}/models/kd_ablation/r20_c7_kd_l050_t4.f32`,
      trainedOnHandsRgbdS1S2: true,
      trainedOnBxr7GomokuPoker: true,
    },
  ];

  const out: CandidateEntry[] = [];
  for (const s of specs) {
    if (!existsSync(s.modelPath)) continue;
    const model = JSON.parse(readFileSync(s.modelPath, "utf8")) as R19ExportedModel;
    out.push({
      ...s,
      model,
      clf: new R20Fp32JsonClassifier(model),
    });
  }
  return out;
}

function handAtConst(theta: number, isPress: boolean, aspect: number): Landmark[] {
  const rad = (theta * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const pts: Array<[number, number]> = [
    [0, 0], [0.26, 0.24], [0.44, 0.52],
    isPress ? [0.76, 0.72] : [0.24, 0.74],
    isPress ? [1.06, 0.88] : [0.04, 0.80],
    [0.30, 0.92], [0.30, 1.34], [0.30, 1.62], [0.30, 1.86],
    [0.00, 1.00], [0.00, 1.24], [0.00, 1.08], [0.00, 0.86],
    [-0.22, 0.94], [-0.22, 1.18], [-0.22, 1.02], [-0.22, 0.80],
    [-0.42, 0.82], [-0.42, 1.06], [-0.42, 0.90], [-0.42, 0.68],
  ];
  return pts.map(([hx, hy]) => {
    const mx = 0.5 + 0.14 * (-hx * s + hy * c);
    const my = 0.62 + 0.14 * (-hx * c - hy * s);
    return { x: 1 - (0.5 + (mx - 0.5) / aspect), y: my, z: 0 };
  });
}

function evalParityAndLatency(cands: CandidateEntry[]) {
  const parity: Record<string, any> = {};
  const lm = placeHand(MEDIAN_SKELETONS.thumb_index, { aspect: 16 / 9, rollDeg: 85 });
  const tracker = new R19FeatureTracker();
  tracker.extract(lm, 0, 16 / 9);
  const feat = tracker.extract(lm, 100, 16 / 9)!;

  for (const c of cands) {
    let rowsChecked = 0;
    let argmaxMismatches = 0;
    let maxProbDiff = 0;
    if (c.parityPath && existsSync(c.parityPath)) {
      const rows = JSON.parse(readFileSync(c.parityPath, "utf8")) as Array<{
        X: number[];
        y: number;
        probs: number[];
      }>;
      for (const r of rows) {
        const pTs = c.clf.proba(r.X);
        const aPy = r.probs.indexOf(Math.max(...r.probs));
        const aTs = pTs.indexOf(Math.max(...pTs));
        if (aPy !== aTs) argmaxMismatches++;
        for (let k = 0; k < 3; k++) {
          const d = Math.abs(pTs[k]! - r.probs[k]!);
          if (d > maxProbDiff) maxProbDiff = d;
        }
        rowsChecked++;
      }
    }

    // Benchmark pure JS/TS CPU latency (2,000 warmup + 5,000 timed iterations)
    for (let i = 0; i < 1000; i++) c.clf.predict(feat);
    const timesFp32: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const t0 = performance.now();
      c.clf.predict(feat);
      timesFp32.push((performance.now() - t0) * 1000);
    }

    // Also benchmark G4 Hybrid pipeline latency
    const pipe = new R19RuntimePipeline(c.model, 16 / 9);
    for (let i = 0; i < 500; i++) pipe.step(lm, i * 16, "one-finger", 0.5, 0.5, 0.25);
    const timesG4: number[] = [];
    for (let i = 0; i < 3000; i++) {
      const t0 = performance.now();
      pipe.step(lm, (i + 600) * 16, "one-finger", 0.5, 0.5, 0.25);
      timesG4.push((performance.now() - t0) * 1000);
    }

    // Optional S0 Binary Float32 & S1 INT8 latency + parity against FP32 JSON
    let binStats: any = null;
    if (c.f32Path && existsSync(c.f32Path)) {
      const buf = readFileSync(c.f32Path);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      const dims = [c.model.mean.length, ...c.model.layers.map((l) => l.b.length)];
      const binClf = new R20Fp32BinaryClassifier(ab, dims, c.model.labels);
      for (let i = 0; i < 500; i++) binClf.proba(feat);
      const timesBin: number[] = [];
      for (let i = 0; i < 3000; i++) {
        const t0 = performance.now();
        binClf.proba(feat);
        timesBin.push((performance.now() - t0) * 1000);
      }
      binStats = {
        bytes: buf.byteLength,
        us_p50: quant(timesBin, 0.5),
        us_p95: quant(timesBin, 0.95),
      };
    }

    let int8Stats: any = null;
    if (c.int8Path && existsSync(c.int8Path)) {
      const i8Doc = JSON.parse(readFileSync(c.int8Path, "utf8")) as R20ExportedInt8Model;
      const i8Clf = new R20Int8Classifier(i8Doc);
      for (let i = 0; i < 500; i++) i8Clf.predict(feat);
      const timesI8: number[] = [];
      for (let i = 0; i < 3000; i++) {
        const t0 = performance.now();
        i8Clf.predict(feat);
        timesI8.push((performance.now() - t0) * 1000);
      }
      int8Stats = {
        packed_bytes: i8Doc.packed_binary_bytes ?? null,
        us_p50: quant(timesI8, 0.5),
        us_p95: quant(timesI8, 0.95),
      };
    }

    parity[c.id] = {
      arch: [c.model.mean.length, ...c.model.layers.map((l) => l.b.length)],
      temperature: c.model.temperature,
      json_bytes: readFileSync(c.modelPath).byteLength,
      parity_rows_checked: rowsChecked,
      argmax_mismatches: argmaxMismatches,
      max_prob_abs_diff: Number(maxProbDiff.toExponential(3)),
      fp32_json_us: { p50: quant(timesFp32, 0.5), p95: quant(timesFp32, 0.95), p99: quant(timesFp32, 0.99) },
      g4_hybrid_us: { p50: quant(timesG4, 0.5), p95: quant(timesG4, 0.95), p99: quant(timesG4, 0.99) },
      s0_fp32_binary: binStats,
      s1_int8_weights: int8Stats,
    };
  }
  return parity;
}

function evalHg5gLockedTest(cands: CandidateEntry[]) {
  const lines = readFileSync(HG5G_JSONL, "utf8").split("\n");
  const out: Record<string, any> = {};

  for (const c of cands) {
    const rawConf = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const g4Conf = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    let dorsalTotal = 0;
    let dorsalG4Ok = 0;
    let lowLightTotal = 0;
    let lowLightG4Ok = 0;

    for (const line of lines) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      if (r.split !== "test") continue;
      const hand = r.l0.n_hands > 0 ? r.l0.hands[0] : r.l1.n_hands > 0 ? r.l1.hands[0] : null;
      if (!hand) continue;
      let yTrue: R19Label | null = null;
      if (r.class_name === "Pointing Up") yTrue = "POINT_READY";
      else if (r.class_name === "L-Sign") yTrue = "POINT_PRESS";
      else if (r.class_name === "Fist" || r.class_name === "V-Sign" || r.class_name === "Open Palm_Open Hand") yTrue = "OTHER";
      if (!yTrue) continue;
      const yi = LABEL_TO_ID[yTrue];
      const lm = toLm(hand.landmarks);
      const t = new R19FeatureTracker();
      const v = t.extract(lm, 0, r.aspect || 1);
      if (!v) continue;

      const pred = c.clf.predict(v);
      rawConf[yi]![LABEL_TO_ID[pred.topLabel]]!++;

      const g4 = resolveHybridPistolClassification(
        lm,
        r.aspect || 1,
        pred.probs,
        c.clf.labels,
        DEFAULT_R19_HYBRID_PARAMS,
      );
      const g4Lbl: R19Label =
        g4.state === "POINT_PRESS" ? "POINT_PRESS" : g4.state === "POINT_READY" ? "POINT_READY" : "OTHER";
      g4Conf[yi]![LABEL_TO_ID[g4Lbl]]!++;

      const facing = hand.geom?.palm_facing_Sign ?? 1;
      if (facing < 0) {
        dorsalTotal++;
        if (g4Lbl === yTrue) dorsalG4Ok++;
      }
      if (r.exposure_bucket === "low_eb" || r.exposure_bucket === "low_luma_no_eb") {
        lowLightTotal++;
        if (g4Lbl === yTrue) lowLightG4Ok++;
      }
    }

    out[c.id] = {
      raw_mlp: confMetrics3(rawConf),
      g4_hybrid: confMetrics3(g4Conf),
      dorsal_slice: { n: dorsalTotal, g4_acc: pct(dorsalG4Ok, dorsalTotal) },
      low_exposure_slice: { n: lowLightTotal, g4_acc: pct(lowLightG4Ok, lowLightTotal) },
    };
  }
  return out;
}

function evalNaturalRgbV3Test(cands: CandidateEntry[]) {
  const byClip = new Map<number, any[]>();
  const pointAmbigClips = new Map<number, any[]>();
  for (const line of readFileSync(N66_JSONL, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (r.split !== "test") continue;
    if (N66_OTHER_CLASSES.has(r.class_name)) {
      const arr = byClip.get(r.clip_idx) ?? [];
      arr.push(r);
      byClip.set(r.clip_idx, arr);
    } else if (r.class_name === "point_left" || r.class_name === "point_right") {
      const arr = pointAmbigClips.get(r.clip_idx) ?? [];
      arr.push(r);
      pointAmbigClips.set(r.clip_idx, arr);
    }
  }

  const out: Record<string, any> = {};
  for (const c of cands) {
    let totalHands = 0;
    let rawFpPress = 0;
    let g4FpPress = 0;
    let fsmActiveFrames = 0;
    let keydowns = 0;
    const byStratum: Record<string, { n: number; raw_fp_press: number; g4_fp_press: number; fsm_active: number }> = {};

    for (const [, frames] of byClip) {
      frames.sort((a, b) => a.frame_idx - b.frame_idx);
      const pipe = new R19RuntimePipeline(c.model, frames[0]?.aspect || 16 / 9);
      const tracker = new R19FeatureTracker();
      for (const r of frames) {
        const hand = r.l0.n_hands > 0 ? r.l0.hands[0] : r.l1.n_hands > 0 ? r.l1.hands[0] : null;
        if (!hand) {
          pipe.reset();
          tracker.reset();
          continue;
        }
        totalHands++;
        const st = (byStratum[r.lighting_stratum] ??= { n: 0, raw_fp_press: 0, g4_fp_press: 0, fsm_active: 0 });
        st.n++;

        const nowMs = (r.frame_idx * 1000) / 30;
        const lm = toLm(hand.landmarks);
        const v = tracker.extract(lm, nowMs, r.aspect || 16 / 9);
        if (v) {
          const p = c.clf.predict(v);
          if (p.topLabel === "POINT_PRESS") {
            rawFpPress++;
            st.raw_fp_press++;
          }
        }
        const revPose = classifyHandPose(lm, { experimentalRobust: true, aspect: r.aspect || 16 / 9 });
        const pc = palmCenterNormalized(lm);
        const step = pipe.step(lm, nowMs, revPose, pc.x, pc.y, 0.25);
        if (step.geomState === "POINT_PRESS") {
          g4FpPress++;
          st.g4_fp_press++;
        }
        if (step.fsm.input.left || step.fsm.input.right || step.fsm.input.jump) {
          fsmActiveFrames++;
          st.fsm_active++;
        }
        if (step.fsm.keyEvent === "KEYDOWN") keydowns++;
      }
    }

    // Also audit point_left/point_right conversational pointing holdout
    let ambigHands = 0;
    let ambigReady = 0;
    let ambigPress = 0;
    let ambigOther = 0;
    for (const [, frames] of pointAmbigClips) {
      frames.sort((a, b) => a.frame_idx - b.frame_idx);
      const pipe = new R19RuntimePipeline(c.model, frames[0]?.aspect || 16 / 9);
      for (const r of frames) {
        const hand = r.l0.n_hands > 0 ? r.l0.hands[0] : r.l1.n_hands > 0 ? r.l1.hands[0] : null;
        if (!hand) {
          pipe.reset();
          continue;
        }
        ambigHands++;
        const lm = toLm(hand.landmarks);
        const nowMs = (r.frame_idx * 1000) / 30;
        const revPose = classifyHandPose(lm, { experimentalRobust: true, aspect: r.aspect || 16 / 9 });
        const pc = palmCenterNormalized(lm);
        const step = pipe.step(lm, nowMs, revPose, pc.x, pc.y, 0.25);
        if (step.geomState === "POINT_READY") ambigReady++;
        else if (step.geomState === "POINT_PRESS") ambigPress++;
        else ambigOther++;
      }
    }

    out[c.id] = {
      total_other_hands: totalHands,
      raw_mlp_fp_press: rawFpPress,
      raw_mlp_fp_press_pct: pct(rawFpPress, totalHands),
      g4_hybrid_fp_press: g4FpPress,
      g4_hybrid_fp_press_pct: pct(g4FpPress, totalHands),
      fsm_active_frames: fsmActiveFrames,
      fsm_active_pct: pct(fsmActiveFrames, totalHands),
      keydowns,
      by_lighting_stratum: byStratum,
      ambiguous_conversational_point_left_right_audit: {
        hands: ambigHands,
        g4_ready_pct: pct(ambigReady, ambigHands),
        g4_press_pct: pct(ambigPress, ambigHands),
        g4_other_pct: pct(ambigOther, ambigHands),
      },
    };
  }
  return out;
}

async function evalIpnLockedTest(cands: CandidateEntry[]) {
  const child = spawn(PYTHON_BIN, [STREAM_IPN_PY, "--split", "test"], { stdio: ["ignore", "pipe", "inherit"] });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const videos: Array<{ video: string; person: string; frames: Array<{ f: number; cls: string; mp: number[][][] }> }> = [];
  for await (const line of rl) {
    if (line.trim()) videos.push(JSON.parse(line));
  }
  await new Promise((res) => child.on("close", res));

  const out: Record<string, any> = {};
  for (const c of cands) {
    const byCat: Record<string, { frames: number; active: number; kd: number }> = {
      NOG: { frames: 0, active: 0, kd: 0 },
      P2F: { frames: 0, active: 0, kd: 0 },
      P1F: { frames: 0, active: 0, kd: 0 },
      OTHER_DYN: { frames: 0, active: 0, kd: 0 },
    };
    let stuckAtVideoEnd = 0;

    for (const vid of videos) {
      const pipe = new R19RuntimePipeline(c.model, 4 / 3);
      for (const fr of vid.frames) {
        const cat = fr.cls === "NOG" ? "NOG" : fr.cls === "P2F" ? "P2F" : fr.cls === "P1F" ? "P1F" : "OTHER_DYN";
        const bucket = byCat[cat]!;
        bucket.frames++;
        const nowMs = (fr.f * 1000) / 30;
        if (!fr.mp || fr.mp.length === 0) {
          pipe.step(null, nowMs, "none", 0.5, 0.5, 0.25);
          continue;
        }
        const lm = toLm(fr.mp[0]!);
        const revPose = classifyHandPose(lm, { experimentalRobust: true, aspect: 4 / 3 });
        const pc = palmCenterNormalized(lm);
        const step = pipe.step(lm, nowMs, revPose, pc.x, pc.y, 0.25);
        if (step.fsm.input.left || step.fsm.input.right || step.fsm.input.jump) bucket.active++;
        if (step.fsm.keyEvent === "KEYDOWN") bucket.kd++;
      }
      // Verify no-hand release at end of video leaves 0 stuck keys
      const endStep = pipe.step(null, (vid.frames.length + 5) * 33.3, "none", 0.5, 0.5, 0.25);
      if (endStep.fsm.input.left || endStep.fsm.input.right || endStep.fsm.input.jump) stuckAtVideoEnd++;
    }

    const summaryCat: Record<string, any> = {};
    for (const [k, v] of Object.entries(byCat)) {
      summaryCat[k] = {
        frames: v.frames,
        active_pct: pct(v.active, v.frames),
        kd_count: v.kd,
        kd_per_min: perMin(v.kd, v.frames),
      };
    }
    out[c.id] = {
      videos: videos.length,
      stuck_keys_after_no_hand: stuckAtVideoEnd,
      by_category: summaryCat,
    };
  }
  return out;
}

function evalMendeleyAndBxr7Ood(cands: CandidateEntry[]) {
  const m18 = JSON.parse(readFileSync(MENDELEY_599_JSON, "utf8"));
  const oodLines = existsSync(BXR7_OOD_JSONL)
    ? readFileSync(BXR7_OOD_JSONL, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l))
    : [];

  const n0n1 = existsSync(N0_N1_JSON) ? JSON.parse(readFileSync(N0_N1_JSON, "utf8")) : { scenes: [] };
  const n0n1Scenes = Array.isArray(n0n1) ? n0n1 : (n0n1.scenes ?? n0n1.rows ?? []);

  const out: Record<string, any> = {};
  for (const c of cands) {
    // 1. Mendeley 599 frames (dim_light + natural_light)
    let m599Hands = 0;
    let m599RawPress = 0;
    let m599G4Press = 0;
    for (const k of ["dim_light", "natural_light"] as const) {
      for (const row of m18[k] ?? []) {
        const hands = (row.raw && row.raw.length > 0 ? row.raw : row.clahe320) ?? [];
        for (const hPts of hands) {
          m599Hands++;
          const lm = toLm(hPts);
          const v = new R19FeatureTracker().extract(lm, 0, row.aspect || 16 / 9);
          if (!v) continue;
          const p = c.clf.predict(v);
          if (p.topLabel === "POINT_PRESS") m599RawPress++;
          const g4 = resolveHybridPistolClassification(
            lm,
            row.aspect || 16 / 9,
            p.probs,
            c.clf.labels,
            DEFAULT_R19_HYBRID_PARAMS,
          );
          if (g4.state === "POINT_PRESS") m599G4Press++;
        }
      }
    }

    // 2. New Session-Disjoint bxr7 Gomoku/Poker holdout OOD test (85 hands)
    let oodHands = 0;
    let oodRawPress = 0;
    let oodG4Press = 0;
    for (const row of oodLines) {
      oodHands++;
      const lm = toLm(row.landmarks);
      const v = new R19FeatureTracker().extract(lm, 0, row.aspect || 16 / 9);
      if (!v) continue;
      const p = c.clf.predict(v);
      if (p.topLabel === "POINT_PRESS") oodRawPress++;
      const g4 = resolveHybridPistolClassification(
        lm,
        row.aspect || 16 / 9,
        p.probs,
        c.clf.labels,
        DEFAULT_R19_HYBRID_PARAMS,
      );
      if (g4.state === "POINT_PRESS") oodG4Press++;
    }

    // 3. N0/N1 adversarial pistol distractors
    let n01Hands = 0;
    let n01G4Press = 0;
    for (const sc of n0n1Scenes) {
      const hands = sc.hands ?? (sc.landmarks ? [sc.landmarks] : []);
      for (const hPts of hands) {
        n01Hands++;
        const lm = toLm(hPts);
        const v = new R19FeatureTracker().extract(lm, 0, sc.aspect || 16 / 9);
        if (!v) continue;
        const p = c.clf.predict(v);
        const g4 = resolveHybridPistolClassification(
          lm,
          sc.aspect || 16 / 9,
          p.probs,
          c.clf.labels,
          DEFAULT_R19_HYBRID_PARAMS,
        );
        if (g4.state === "POINT_PRESS") n01G4Press++;
      }
    }

    out[c.id] = {
      mendeley_599_session_disjoint: {
        hands: m599Hands,
        raw_fp_press: m599RawPress,
        raw_fp_press_pct: pct(m599RawPress, m599Hands),
        g4_fp_press: m599G4Press,
        g4_fp_press_pct: pct(m599G4Press, m599Hands),
      },
      bxr7_gomoku_poker_holdout_ood: {
        hands: oodHands,
        raw_fp_press: oodRawPress,
        raw_fp_press_pct: pct(oodRawPress, oodHands),
        g4_fp_press: oodG4Press,
        g4_fp_press_pct: pct(oodG4Press, oodHands),
      },
      n0_n1_pistol_distractors: {
        hands: n01Hands,
        g4_fp_press: n01G4Press,
        g4_fp_press_pct: pct(n01G4Press, n01Hands),
      },
    };
  }
  return out;
}

function evalHandsRgbdDisjointOod(cands: CandidateEntry[]) {
  const rows = readFileSync(HRGBD_JSONL, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

  const out: Record<string, any> = {};
  for (const c of cands) {
    // Evaluate BOTH:
    //  (A) Person-Disjoint Locked OOD Test: Subject4 + Subject5 ONLY (never in TRAIN/VAL of ANY candidate C0..C7)
    //  (B) Historical Full Subject1..5 (with explicit flag when Subject1..2 were in TRAIN for C3/C4/C6/C7)
    const buckets = {
      ood_s4_s5_disjoint: {
        horiz_n: 0, horiz_raw_press: 0, horiz_g4_press: 0,
        strict_other_n: 0, strict_other_raw_press: 0, strict_other_raw_ready: 0, strict_other_g4_press: 0, strict_other_g4_ready: 0,
        one_vfr_n: 0, one_vfr_raw_ready: 0, one_vfr_g4_ready: 0, one_vfr_g4_press: 0,
      },
      all_s1_to_s5_reference: {
        includes_in_train_s1_s2: c.trainedOnHandsRgbdS1S2,
        horiz_n: 0, horiz_raw_press: 0, horiz_g4_press: 0,
        strict_other_n: 0, strict_other_raw_press: 0, strict_other_raw_ready: 0, strict_other_g4_press: 0, strict_other_g4_ready: 0,
        one_vfr_n: 0, one_vfr_raw_ready: 0, one_vfr_g4_ready: 0, one_vfr_g4_press: 0,
      },
    };

    for (const r of rows) {
      const isOodS4S5 = r.subject === "Subject4" || r.subject === "Subject5";
      const l0Hands = r.l0?.hands ?? [];
      const l1Hands = r.l1?.hands ?? [];
      const m0 = r.gt_match_l0 ?? {};
      const m1 = r.gt_match_l1 ?? {};
      const aspect = r.aspect || 16 / 9;

      for (const cls of r.combo) {
        const hi0 = m0[cls];
        const hi1 = m1[cls];
        let hand: any = null;
        if (hi0 !== null && hi0 !== undefined && hi0 >= 0 && hi0 < l0Hands.length) {
          hand = l0Hands[hi0];
        } else if (r.is_dark && hi1 !== null && hi1 !== undefined && hi1 >= 0 && hi1 < l1Hands.length) {
          hand = l1Hands[hi1];
        }
        if (!hand) continue;

        const lm = toLm(hand.landmarks);
        const v = new R19FeatureTracker().extract(lm, 0, aspect);
        if (!v) continue;
        const p = c.clf.predict(v);
        const g4 = resolveHybridPistolClassification(lm, aspect, p.probs, c.clf.labels, DEFAULT_R19_HYBRID_PARAMS);

        const targets = isOodS4S5 ? [buckets.ood_s4_s5_disjoint, buckets.all_s1_to_s5_reference] : [buckets.all_s1_to_s5_reference];
        for (const b of targets) {
          if (cls.startsWith("Horiz_")) {
            b.horiz_n++;
            if (p.topLabel === "POINT_PRESS") b.horiz_raw_press++;
            if (g4.state === "POINT_PRESS") b.horiz_g4_press++;
          } else if (cls === "One_VFR") {
            b.one_vfr_n++;
            if (p.topLabel === "POINT_READY") b.one_vfr_raw_ready++;
            if (g4.state === "POINT_READY") b.one_vfr_g4_ready++;
            if (g4.state === "POINT_PRESS") b.one_vfr_g4_press++;
          } else if (cls !== "One_VFL") {
            b.strict_other_n++;
            if (p.topLabel === "POINT_PRESS") b.strict_other_raw_press++;
            if (p.topLabel === "POINT_READY") b.strict_other_raw_ready++;
            if (g4.state === "POINT_PRESS") b.strict_other_g4_press++;
            if (g4.state === "POINT_READY") b.strict_other_g4_ready++;
          }
        }
      }
    }

    const fmt = (b: typeof buckets.ood_s4_s5_disjoint) => ({
      horiz_5finger_flat_palm: {
        n: b.horiz_n,
        raw_mlp_fp_press: b.horiz_raw_press,
        raw_mlp_fp_press_pct: pct(b.horiz_raw_press, b.horiz_n),
        g4_hybrid_fp_press: b.horiz_g4_press,
        g4_hybrid_fp_press_pct: pct(b.horiz_g4_press, b.horiz_n),
      },
      strict_other_non_point: {
        n: b.strict_other_n,
        raw_mlp_fp_press: b.strict_other_raw_press,
        raw_mlp_fp_press_pct: pct(b.strict_other_raw_press, b.strict_other_n),
        raw_mlp_fp_ready: b.strict_other_raw_ready,
        raw_mlp_fp_ready_pct: pct(b.strict_other_raw_ready, b.strict_other_n),
        g4_hybrid_fp_press: b.strict_other_g4_press,
        g4_hybrid_fp_press_pct: pct(b.strict_other_g4_press, b.strict_other_n),
        g4_hybrid_fp_ready: b.strict_other_g4_ready,
        g4_hybrid_fp_ready_pct: pct(b.strict_other_g4_ready, b.strict_other_n),
      },
      tiny_scale_one_vfr_ready: {
        n: b.one_vfr_n,
        raw_mlp_ready_recall_pct: pct(b.one_vfr_raw_ready, b.one_vfr_n),
        g4_hybrid_ready_recall_pct: pct(b.one_vfr_g4_ready, b.one_vfr_n),
        g4_hybrid_fp_press_pct: pct(b.one_vfr_g4_press, b.one_vfr_n),
      },
    });

    out[c.id] = {
      person_disjoint_ood_test_Subject4_Subject5: fmt(buckets.ood_s4_s5_disjoint),
      full_Subject1_to_Subject5_reference: {
        in_train_s1_s2_note: c.trainedOnHandsRgbdS1S2
          ? "Subject1..2 audited OTHER used in TRAIN; use Subject4..5 above for independent person-disjoint OOD evaluation (§3)"
          : "All Subject1..5 unseen during training",
        ...fmt(buckets.all_s1_to_s5_reference),
      },
    };
  }
  return out;
}

function evalJumpAssistContinuity(model: R19ExportedModel) {
  const results: Record<string, any> = {};
  const aspect = 16 / 9;
  const WARMUP_MS = 200;
  const angleAt = (tRel: number): number => {
    if (tRel < 0) return 0;
    if (tRel < 300) return 0;
    if (tRel < 500) return ((tRel - 300) / 200) * 58;
    if (tRel < 1300) return 58;
    if (tRel < 1500) return 58 * (1 - (tRel - 1300) / 200);
    return 0;
  };
  for (const fps of [75, 60, 30, 15]) {
    let nowMs = 0;
    const dtMs = 1000 / fps;
    const pipe = new R19RuntimePipeline(model, aspect);
    const arbiter = new InputArbiter("gameplay", () => nowMs);
    arbiter.dispatch({ type: "set-hand-enabled", enabled: true });
    const jumpAssist = new JumpAssist();
    const totalMs = WARMUP_MS + 1800;
    let nextPhysMs = 0;
    let nextCamMs = 0;
    let nextArbMs = 0;
    let walkFrames = 0;
    let rightActive = 0;
    let drops = 0;
    let jumpTriggers = 0;
    let y = 0;
    let vy = 0;
    let grounded = true;
    const GRAVITY = 22;
    const JUMP_VEL = 4.8;

    for (let t = 0; t <= totalMs; t += 1) {
      nowMs = t;
      while (nextCamMs <= t + 1e-6) {
        const theta = angleAt(nextCamMs - WARMUP_MS);
        const out = pipe.step(handAtConst(theta, true, aspect), nextCamMs);
        arbiter.dispatch({
          type: "hand-frame",
          frame: { tracked: out.steer.tracked, cursor: null, pinched: false, input: out.steer.input },
        });
        nextCamMs += dtMs;
      }
      if (t >= nextArbMs) {
        arbiter.tick();
        nextArbMs += 100;
      }
      if (t >= nextPhysMs) {
        if (t >= WARMUP_MS) {
          const eff = arbiter.output();
          walkFrames++;
          if (eff.right) rightActive++;
          else drops++;
          if (jumpAssist.step(grounded, eff.jump)) {
            jumpTriggers++;
            vy = JUMP_VEL;
            grounded = false;
            pipe.notifyJumpConsumed();
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
    const rel = pipe.step(null, totalMs + 100, "none", 0.5, 0.5, 0.25);
    results[`${fps}Hz`] = {
      horizontal_continuity_pct: pct(rightActive, walkFrames),
      right_drops: drops,
      jumps_fired: jumpTriggers,
      stuck_after_release: rel.fsm.input.left || rel.fsm.input.right || rel.fsm.input.jump,
    };
  }
  return results;
}

async function main() {
  const t0 = performance.now();
  const cands = loadCandidates();
  console.log(`[eval_r20_all] Loaded ${cands.length} candidates:`, cands.map((c) => c.id));

  const parityAndLatency = evalParityAndLatency(cands);
  const hg5gTest = evalHg5gLockedTest(cands);
  const naturalRgbV3Test = evalNaturalRgbV3Test(cands);
  const ipnTest = await evalIpnLockedTest(cands);
  const mendeleyAndBxr7 = evalMendeleyAndBxr7Ood(cands);
  const handsRgbd = evalHandsRgbdDisjointOod(cands);
  const jumpContinuity = evalJumpAssistContinuity(cands[0]!.model);

  const report = {
    generated_at: new Date().toISOString(),
    elapsed_sec: Math.round(((performance.now() - t0) / 1000) * 100) / 100,
    candidates_evaluated: cands.map((c) => c.id),
    parity_and_cpu_latency: parityAndLatency,
    locked_hg5g_test: hg5gTest,
    locked_natural_rgb_v3_test: naturalRgbV3Test,
    locked_ipn_hands_test: ipnTest,
    distractors_mendeley_bxr7_n0n1: mendeleyAndBxr7,
    disjoint_ood_hands_rgbd: handsRgbd,
    jump_assist_50hz_continuity: jumpContinuity,
  };

  const outPath = `${REPO}/r20/results/r20_eval_all.json`;
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`[eval_r20_all] Wrote ${outPath} in ${report.elapsed_sec}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

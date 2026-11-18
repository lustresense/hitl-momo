/**
 * R19 Wave B Comprehensive End-to-End Evaluation & VAL Hybrid Tuning (`eval_r19_all.ts`).
 *
 * Compares `G0_main` vs `R18_UX1` vs `G1_pistol` vs `G2_LR` vs `G3_MLP` vs `G4_Hybrid`
 * alongside ablations `G5_r18feat` (68-dim) and `G5_p1f_trap` (P1F == POINT_PRESS conflation):
 *  0) Python-vs-TS numerical parity & JS latency for all exported JSON models
 *  1) VAL-only grid search for G4 Hybrid parameters (tauPress, tauPressRescue, otherVetoTau, softRescue)
 *  2) Locked HandGesture-5G TEST (overall, palmar vs dorsal, L0 vs L1-rec, exposure buckets)
 *  3) Locked Natural RGB v3 TEST (11 OTHER classes across lighting/modality + point_left/right audit)
 *  4) Locked IPN HandS TEST (36 videos, 5 unseen subjects: sequence KEYDOWN/min & active %)
 *  5) Offline Mendeley bxr7kx84y6 (1,133 hands) + N0/N1 distractors + MEDIAN_SKELETONS & pinchSkeleton
 *  6) Synthetic Dorsal O0/O1 extreme roll/pitch + 50 Hz JumpAssist RIGHT -> RIGHT+JUMP -> RIGHT continuity
 */
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { GameplayGestureFilter, evaluateGameplayGesture } from "../../r18-ux0-sandbox/repo/frontend/implementation/src/input/gameplay-gesture";
import { classifyHandPose, palmCenterNormalized } from "../../r18-ux0-sandbox/repo/frontend/implementation/src/input/hand-gesture";
import { InputArbiter } from "../../r18-ux0-sandbox/repo/frontend/implementation/src/input/arbiter";
import { JumpAssist } from "../../r18-ux0-sandbox/repo/frontend/implementation/src/game/jump-assist";
import { MEDIAN_SKELETONS, pinchSkeleton, placeHand } from "../../r18-ux0-sandbox/repo/frontend/implementation/tests/input/realistic-hands";
import type { Landmark } from "../../r18-ux0-sandbox/repo/frontend/implementation/src/input/types";
import { VirtualKeySteeringFSM, isIntentionalPointing } from "../../r18-ux0-sandbox/candidates/ux1_candidates";
import { Ux3FeatureTracker } from "../../r18-ux0-sandbox/candidates/ux3_features";
import { classifyPistolGeometry } from "../g1_geom/pistol_geometry";
import { PistolVirtualKeyFSM } from "../g1_geom/pistol_fsm";
import { R19_LABELS, R19FeatureTracker, type R19Label } from "./r19_features";
import { R19Classifier, type R19ExportedModel } from "./r19_model";
import {
  DEFAULT_R19_HYBRID_PARAMS,
  R19RuntimePipeline,
  resolveHybridPistolClassification,
  type R19HybridParams,
} from "./r19_integrated";

type SplitName = "train" | "val" | "test";
interface MpHand { handedness: string; landmarks: number[][]; geom?: any }
interface Hg5gRow {
  sample_id: string; class_name: string; aspect: number; cluster_id: number;
  exposure_bucket: string; split: SplitName;
  l0: { n_hands: number; hands: MpHand[] };
  l1: { n_hands: number; hands: MpHand[] };
}
interface N66Row {
  clip_idx: number; participant_id: string; class_name: string; modality: string;
  lighting_stratum: string; frame_idx: number; aspect: number; split: SplitName;
  l0: { n_hands: number; hands: MpHand[] };
  l1: { n_hands: number; hands: MpHand[] };
}
interface IpnVideo { video: string; person: string; frames: Array<{ f: number; cls: string; mp: number[][][] }> }

const MODELS_DIR = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/models_v1";
const HG5G_JSONL = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/handgesture_5g_derived/handgesture_5g_landmarks.jsonl";
const N66_JSONL = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/n66hhk695h_v3_derived/n66hhk695h_v3_landmarks.jsonl";
const STREAM_IPN_PY = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/train/stream_ipn_split.py";
const PYTHON_BIN = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/.venv/bin/python";
const MENDELEY_JSON = "/srv/sketchbook/mediapipe-optimize/research-can/r18/results/ux3_mendeley_distractor_landmarks.json";
const N0_N1_JSON = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/train/n0_n1_distractor_landmarks.json";
const OUT_JSON = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/results/r19_eval_all.json";

const N66_OTHER_CLASSES = new Set([
  "thumbs_up", "thumbs_down", "peace_sign", "ok_sign", "fist",
  "stop", "raised_hand", "palm_down_push", "wave", "come_here", "go",
]);

const toLm = (pts: number[][]): Landmark[] => pts.map((p) => ({ x: p[0]!, y: p[1]!, z: p[2] ?? 0 }));
const pct = (n: number, d: number) => (d > 0 ? Math.round((10000 * n) / d) / 100 : 0);
const perMin = (n: number, frames: number) => (frames > 0 ? Math.round((n / (frames / 30 / 60)) * 100) / 100 : 0);
const quant = (arr: number[], q: number) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]! * 100) / 100;
};

function loadModel(file: string): { raw: R19ExportedModel; clf: R19Classifier } {
  const raw = JSON.parse(readFileSync(`${MODELS_DIR}/${file}`, "utf8")) as R19ExportedModel;
  return { raw, clf: new R19Classifier(raw) };
}

function effectiveHg5gSplit(r: Hg5gRow): SplitName {
  if (r.class_name === "Pointing Up") {
    if (r.cluster_id === 18) return "val";
    if (r.cluster_id === 19) return "train";
  }
  return r.split;
}

function hg5gLabel(cls: string): R19Label | null {
  if (cls === "Pointing Up") return "POINT_READY";
  if (cls === "L-Sign") return "POINT_PRESS";
  if (cls === "Fist" || cls === "V-Sign" || cls === "Open Palm_Open Hand") return "OTHER";
  return null;
}

function confMetrics3(conf: number[][]) {
  let tot = 0, ok = 0;
  const prec: number[] = [], rec: number[] = [], f1s: number[] = [];
  for (let i = 0; i < 3; i++) {
    let sup = 0, pred = 0;
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
    precision: prec,
    recall: rec,
    f1: f1s,
    ready_to_press_pct: pct(conf[0]![1]!, conf[0]!.reduce((a, b) => a + b, 0)),
    other_to_press_pct: pct(conf[2]![1]!, conf[2]!.reduce((a, b) => a + b, 0)),
    confusion: conf,
  };
}

function checkParityAndLatency() {
  const specs = [
    { name: "r19_mlp", model: "r19_model_mlp.json", parity: "r19_parity_rows.json" },
    { name: "g5_r18feat_mlp", model: "g5_r18feat_model_mlp.json", parity: "g5_r18feat_parity_rows.json" },
    { name: "g5_p1f_trap_mlp", model: "g5_p1f_trap_model_mlp.json", parity: "g5_p1f_trap_parity_rows.json" },
  ];
  const out: Record<string, any> = {};
  for (const sp of specs) {
    const { raw, clf } = loadModel(sp.model);
    const rows = JSON.parse(readFileSync(`${MODELS_DIR}/${sp.parity}`, "utf8")) as Array<{ X: number[]; y: number; probs: number[] }>;
    let maxDiff = 0, argmaxMismatch = 0;
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
    out[sp.name] = {
      model_bytes: readFileSync(`${MODELS_DIR}/${sp.model}`).byteLength,
      rows_checked: rows.length,
      max_abs_diff: Number(maxDiff.toExponential(3)),
      argmax_mismatches: argmaxMismatch,
      js_infer_p50_us: quant(timesUs, 0.5),
      js_infer_p95_us: quant(timesUs, 0.95),
      temp: raw.temperature,
    };
  }
  return out;
}

async function loadIpnVideos(split: SplitName): Promise<IpnVideo[]> {
  const child = spawn(PYTHON_BIN, [STREAM_IPN_PY, "--split", split], { stdio: ["ignore", "pipe", "inherit"] });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const out: IpnVideo[] = [];
  for await (const line of rl) {
    if (line.trim()) out.push(JSON.parse(line) as IpnVideo);
  }
  const rc: number = await new Promise((res) => child.on("close", (c) => res(c ?? 1)));
  if (rc !== 0) throw new Error(`IPN stream ${split} exit=${rc}`);
  return out;
}

function evalHg5gSplit(
  rows: Hg5gRow[],
  split: SplitName,
  models: {
    g2: R19Classifier;
    g3: R19Classifier;
    g5_r18: R19Classifier;
    g5_p1f: R19Classifier;
    hybridParams: R19HybridParams;
  },
) {
  const sub = rows.filter((r) => effectiveHg5gSplit(r) === split && (r.l0.n_hands > 0 || r.l1.n_hands > 0));
  const lblIdx: Record<R19Label, number> = { POINT_READY: 0, POINT_PRESS: 1, OTHER: 2 };
  const makeConf = () => [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const confs: Record<string, number[][]> = {
    G1_pistol: makeConf(),
    G2_LR: makeConf(),
    G3_MLP: makeConf(),
    G4_Hybrid: makeConf(),
    G5_r18feat: makeConf(),
    G5_p1f_trap: makeConf(),
  };
  let g0SteerOnOther = 0, ux1PointOnOther = 0, otherN = 0, pressN = 0, readyN = 0;
  let g0SteerOnReady = 0, ux1PointOnReady = 0, g0SteerOnPress = 0, ux1PointOnPress = 0;

  type SliceKey = "all" | "palmar" | "dorsal" | "l0_det" | "l1_recovered" | "low_eb" | "correct_eb" | "high_eb";
  const sliceConfs: Record<string, Record<string, number[][]>> = {};
  for (const sk of ["all", "palmar", "dorsal", "l0_det", "l1_recovered", "low_eb", "correct_eb", "high_eb"] as SliceKey[]) {
    sliceConfs[sk] = { G1_pistol: makeConf(), G3_MLP: makeConf(), G4_Hybrid: makeConf(), G5_r18feat: makeConf() };
  }

  for (const r of sub) {
    const gt = hg5gLabel(r.class_name);
    if (!gt) continue;
    const gi = lblIdx[gt];
    const isL1Rec = r.l0.n_hands === 0;
    const hand = !isL1Rec ? r.l0.hands[0]! : r.l1.hands[0]!;
    const lm = toLm(hand.landmarks);
    const aspect = r.aspect || 1;
    const facing = hand.geom?.facing_indicator;
    const isDorsal = typeof facing === "number" ? facing < 0 : false;

    const g0Eval = evaluateGameplayGesture(lm);
    const g0Steer = g0Eval.input.left || g0Eval.input.right || g0Eval.input.jump;
    const ux1Ok = isIntentionalPointing(lm, "P2_balanced", aspect).ok;
    if (gt === "OTHER") {
      otherN++;
      if (g0Steer) g0SteerOnOther++;
      if (ux1Ok) ux1PointOnOther++;
    } else if (gt === "POINT_READY") {
      readyN++;
      if (g0Steer) g0SteerOnReady++;
      if (ux1Ok) ux1PointOnReady++;
    } else {
      pressN++;
      if (g0Steer) g0SteerOnPress++;
      if (ux1Ok) ux1PointOnPress++;
    }

    const t19 = new R19FeatureTracker();
    const t18 = new Ux3FeatureTracker();
    const x19 = t19.extract(lm, 0, aspect);
    const x18 = t18.extract(lm, 0, aspect);
    if (!x19 || !x18) continue;

    const g1 = classifyPistolGeometry(lm, aspect);
    const pG2 = models.g2.predict(x19, 0);
    const pG3 = models.g3.predict(x19, 0);
    const pG5r18 = models.g5_r18.predict(x18, 0);
    const pG5p1f = models.g5_p1f.predict(x19, 0);
    const pPress3 = pG3.probs[1] ?? 0;
    const g4 = resolveHybridPistolClassification(lm, pG3.probs, models.g3.labels, pPress3, aspect, models.hybridParams);

    const preds: Record<string, R19Label> = {
      G1_pistol: g1.state,
      G2_LR: pG2.label as R19Label,
      G3_MLP: pG3.label as R19Label,
      G4_Hybrid: g4.state,
      G5_r18feat: pG5r18.label as R19Label,
      G5_p1f_trap: pG5p1f.label as R19Label,
    };
    for (const [m, pl] of Object.entries(preds)) {
      confs[m]![gi]![lblIdx[pl]]!++;
    }

    const keys: SliceKey[] = [
      "all",
      isDorsal ? "dorsal" : "palmar",
      isL1Rec ? "l1_recovered" : "l0_det",
    ];
    if (r.exposure_bucket === "low_eb" || r.exposure_bucket === "correct_eb" || r.exposure_bucket === "high_eb") {
      keys.push(r.exposure_bucket);
    }
    for (const sk of keys) {
      for (const m of ["G1_pistol", "G3_MLP", "G4_Hybrid", "G5_r18feat"] as const) {
        sliceConfs[sk]![m]![gi]![lblIdx[preds[m]!]]!++;
      }
    }
  }

  return {
    n: sub.length,
    counts: { POINT_READY: readyN, POINT_PRESS: pressN, OTHER: otherN },
    g0_main_rates: {
      steer_on_other_pct: pct(g0SteerOnOther, otherN),
      steer_on_ready_pct: pct(g0SteerOnReady, readyN),
      steer_on_press_pct: pct(g0SteerOnPress, pressN),
    },
    r18_ux1_rates: {
      point_on_other_pct: pct(ux1PointOnOther, otherN),
      point_on_ready_pct: pct(ux1PointOnReady, readyN),
      point_on_press_pct: pct(ux1PointOnPress, pressN),
    },
    models: Object.fromEntries(Object.entries(confs).map(([k, c]) => [k, confMetrics3(c)])),
    slices: Object.fromEntries(
      Object.entries(sliceConfs).map(([sk, mp]) => [
        sk,
        Object.fromEntries(Object.entries(mp).map(([m, c]) => [m, confMetrics3(c)])),
      ]),
    ),
  };
}

function evalN66Split(
  n66Rows: N66Row[],
  split: SplitName,
  g3Model: R19ExportedModel,
  hybridParams: R19HybridParams,
) {
  const byClip = new Map<number, N66Row[]>();
  for (const r of n66Rows) {
    if (r.split !== split) continue;
    const arr = byClip.get(r.clip_idx) ?? [];
    arr.push(r);
    byClip.set(r.clip_idx, arr);
  }

  type Acc = {
    frames: number; det: number;
    g0Steer: number; ux1Pt: number;
    g1Ready: number; g1Press: number;
    g3Press: number; g4Ready: number; g4Press: number; g4Active: number; g4Keydown: number;
  };
  const initAcc = (): Acc => ({
    frames: 0, det: 0, g0Steer: 0, ux1Pt: 0, g1Ready: 0, g1Press: 0, g3Press: 0, g4Ready: 0, g4Press: 0, g4Active: 0, g4Keydown: 0,
  });

  const negOverall = initAcc();
  const byStratum: Record<string, Acc> = {};
  const byModality: Record<string, Acc> = {};
  const negByClass: Record<string, Acc> = {};
  const pointAudit: Record<string, { frames: number; det: number; tlat_ge_13: number; g1Press: number; g4Press: number; g4Ready: number; g4Other: number }> = {
    point_left: { frames: 0, det: 0, tlat_ge_13: 0, g1Press: 0, g4Press: 0, g4Ready: 0, g4Other: 0 },
    point_right: { frames: 0, det: 0, tlat_ge_13: 0, g1Press: 0, g4Press: 0, g4Ready: 0, g4Other: 0 },
  };

  const g3Clf = new R19Classifier(g3Model);

  for (const [, frames] of byClip) {
    frames.sort((a, b) => a.frame_idx - b.frame_idx);
    const cls = frames[0]!.class_name;
    const mod = frames[0]!.modality;
    const t3 = new R19FeatureTracker();
    const pipe = new R19RuntimePipeline(g3Model, frames[0]!.aspect || 1, hybridParams);

    for (const r of frames) {
      const hand = r.l0.n_hands > 0 ? r.l0.hands[0]! : r.l1.n_hands > 0 ? r.l1.hands[0]! : null;
      const nowMs = (r.frame_idx * 1000) / 30;
      const aspect = r.aspect || 1;

      if (cls === "point_left" || cls === "point_right") {
        const pa = pointAudit[cls]!;
        pa.frames++;
        if (!hand) { pipe.step(undefined, nowMs); continue; }
        pa.det++;
        if ((hand.geom?.thumb_lateral ?? 0) >= 1.3) pa.tlat_ge_13++;
        const lm = toLm(hand.landmarks);
        const g1 = classifyPistolGeometry(lm, aspect);
        const out = pipe.step(lm, nowMs);
        if (g1.state === "POINT_PRESS") pa.g1Press++;
        if (out.geomState === "POINT_PRESS") pa.g4Press++;
        else if (out.geomState === "POINT_READY") pa.g4Ready++;
        else pa.g4Other++;
        continue;
      }

      if (!N66_OTHER_CLASSES.has(cls)) continue;
      const targets = [
        negOverall,
        (byStratum[r.lighting_stratum] ??= initAcc()),
        (byModality[mod] ??= initAcc()),
        (negByClass[cls] ??= initAcc()),
      ];
      for (const a of targets) a.frames++;
      if (!hand) { t3.reset(); pipe.step(undefined, nowMs); continue; }

      const lm = toLm(hand.landmarks);
      const g0 = evaluateGameplayGesture(lm);
      const g0St = g0.input.left || g0.input.right || g0.input.jump;
      const ux1Ok = isIntentionalPointing(lm, "P2_balanced", aspect).ok;
      const g1 = classifyPistolGeometry(lm, aspect);
      const f3 = t3.extract(lm, nowMs, aspect);
      const p3Lbl = f3 ? g3Clf.predict(f3, 0).label : "OTHER";
      const revPose = classifyHandPose(lm, { experimentalRobust: true, aspect });
      const c = palmCenterNormalized(lm);
      const ps = Math.max(
        Math.hypot((lm[9]!.x - lm[0]!.x) * aspect, lm[9]!.y - lm[0]!.y),
        Math.hypot((lm[17]!.x - lm[5]!.x) * aspect, lm[17]!.y - lm[5]!.y),
      );
      const out = pipe.step(lm, nowMs, revPose, c.x, c.y, ps);
      const act = out.steer.input.left || out.steer.input.right || out.steer.input.jump;

      for (const a of targets) {
        a.det++;
        if (g0St) a.g0Steer++;
        if (ux1Ok) a.ux1Pt++;
        if (g1.state === "POINT_READY") a.g1Ready++;
        if (g1.state === "POINT_PRESS") a.g1Press++;
        if (p3Lbl === "POINT_PRESS") a.g3Press++;
        if (out.geomState === "POINT_READY") a.g4Ready++;
        if (out.geomState === "POINT_PRESS") a.g4Press++;
        if (act) a.g4Active++;
        if (out.fsm.keyEvent === "KEYDOWN") a.g4Keydown++;
      }
    }
  }

  const fmtAcc = (a: Acc) => ({
    frames: a.frames,
    det: a.det,
    g0_steer_pct: pct(a.g0Steer, a.det),
    ux1_point_pct: pct(a.ux1Pt, a.det),
    g1_press_pct: pct(a.g1Press, a.det),
    g3_press_pct: pct(a.g3Press, a.det),
    g4_press_pct: pct(a.g4Press, a.det),
    g4_fsm_active_pct: pct(a.g4Active, a.det),
    g4_keydown_cnt: a.g4Keydown,
  });

  return {
    other_11_classes: fmtAcc(negOverall),
    by_lighting_stratum: Object.fromEntries(Object.entries(byStratum).map(([k, a]) => [k, fmtAcc(a)])),
    by_modality: Object.fromEntries(Object.entries(byModality).map(([k, a]) => [k, fmtAcc(a)])),
    by_negative_class: Object.fromEntries(Object.entries(negByClass).map(([k, a]) => [k, fmtAcc(a)])),
    casual_point_left_right_audit: pointAudit,
  };
}

function evalIpnSequences(
  videos: IpnVideo[],
  g3Model: R19ExportedModel,
  p1fTrapModel: R19ExportedModel | null,
  hybridParams: R19HybridParams,
) {
  type Acc = {
    frames: number; mp: number; g0: number; ux1Pt: number; ux1St: number;
    g1Ready: number; g1Press: number; g1FsmAct: number; g1Kd: number;
    g3Press: number; g4Ready: number; g4Press: number; g4Act: number; g4Kd: number;
    trapPress: number;
  };
  const init = (): Acc => ({
    frames: 0, mp: 0, g0: 0, ux1Pt: 0, ux1St: 0,
    g1Ready: 0, g1Press: 0, g1FsmAct: 0, g1Kd: 0,
    g3Press: 0, g4Ready: 0, g4Press: 0, g4Act: 0, g4Kd: 0, trapPress: 0,
  });
  const byCls: Record<string, Acc> = {};
  const g3Clf = new R19Classifier(g3Model);
  const trapClf = p1fTrapModel ? new R19Classifier(p1fTrapModel) : null;

  for (const vid of videos) {
    const g0f = new GameplayGestureFilter();
    const ux1 = new VirtualKeySteeringFSM({ pointingPolicy: "P2_balanced", jumpPolicy: "J2_edge", aspect: 4 / 3 });
    const g1Fsm = new PistolVirtualKeyFSM({ aspect: 4 / 3 });
    const g4Pipe = new R19RuntimePipeline(g3Model, 4 / 3, hybridParams);
    const t3 = new R19FeatureTracker();
    const tTrap = trapClf ? new R19FeatureTracker() : null;

    for (const fr of vid.frames) {
      const a = (byCls[fr.cls] ??= init());
      a.frames++;
      const nowMs = (fr.f * 1000) / 30;
      const lm = fr.mp.length > 0 ? toLm(fr.mp[0]!) : undefined;
      if (!lm) {
        g0f.update(undefined, nowMs);
        ux1.update(undefined, nowMs);
        g1Fsm.update(undefined, nowMs);
        g4Pipe.step(undefined, nowMs);
        t3.reset();
        tTrap?.reset();
        continue;
      }
      a.mp++;
      const o0 = g0f.update(lm, nowMs);
      if (o0.input.left || o0.input.right || o0.input.jump) a.g0++;
      if (isIntentionalPointing(lm, "P2_balanced", 4 / 3).ok) a.ux1Pt++;
      const u1 = ux1.update(lm, nowMs);
      if (u1.input.left || u1.input.right || u1.input.jump) a.ux1St++;

      const g1Cls = classifyPistolGeometry(lm, 4 / 3);
      if (g1Cls.state === "POINT_READY") a.g1Ready++;
      else if (g1Cls.state === "POINT_PRESS") a.g1Press++;
      const g1Out = g1Fsm.update(lm, nowMs, g1Cls);
      if (g1Out.input.left || g1Out.input.right || g1Out.input.jump) a.g1FsmAct++;
      if (g1Out.keyEvent === "KEYDOWN") a.g1Kd++;

      const v3 = t3.extract(lm, nowMs, 4 / 3);
      if (v3 && g3Clf.predict(v3, 0).label === "POINT_PRESS") a.g3Press++;
      if (tTrap && trapClf) {
        const vt = tTrap.extract(lm, nowMs, 4 / 3);
        if (vt && trapClf.predict(vt, 0).label === "POINT_PRESS") a.trapPress++;
      }

      const revPose = classifyHandPose(lm, { experimentalRobust: true, aspect: 4 / 3 });
      const c = palmCenterNormalized(lm);
      const ps = Math.max(
        Math.hypot((lm[9]!.x - lm[0]!.x) * (4 / 3), lm[9]!.y - lm[0]!.y),
        Math.hypot((lm[17]!.x - lm[5]!.x) * (4 / 3), lm[17]!.y - lm[5]!.y),
      );
      const g4Out = g4Pipe.step(lm, nowMs, revPose, c.x, c.y, ps);
      if (g4Out.geomState === "POINT_READY") a.g4Ready++;
      else if (g4Out.geomState === "POINT_PRESS") a.g4Press++;
      if (g4Out.steer.input.left || g4Out.steer.input.right || g4Out.steer.input.jump) a.g4Act++;
      if (g4Out.fsm.keyEvent === "KEYDOWN") a.g4Kd++;
    }
  }

  const out: Record<string, any> = {};
  for (const [cls, a] of Object.entries(byCls).sort((x, y) => y[1].frames - x[1].frames)) {
    out[cls] = {
      frames: a.frames,
      mp: a.mp,
      g0_steer_pct: pct(a.g0, a.mp),
      ux1_steer_pct: pct(a.ux1St, a.mp),
      g1_press_pct: pct(a.g1Press, a.mp),
      g1_fsm_active_pct: pct(a.g1FsmAct, a.mp),
      g1_keydown_per_min: perMin(a.g1Kd, a.frames),
      g3_press_pct: pct(a.g3Press, a.mp),
      g4_ready_pct: pct(a.g4Ready, a.mp),
      g4_press_pct: pct(a.g4Press, a.mp),
      g4_fsm_active_pct: pct(a.g4Act, a.mp),
      g4_keydown_per_min: perMin(a.g4Kd, a.frames),
      p1f_trap_press_pct: p1fTrapModel ? pct(a.trapPress, a.mp) : null,
    };
  }
  return out;
}

function evalMendeleyNegsAndMedian(g3Model: R19ExportedModel, g4Params: R19HybridParams) {
  const mdata = JSON.parse(readFileSync(MENDELEY_JSON, "utf8")) as {
    dim_light: Array<{ aspect: number; raw?: number[][][]; clahe320?: number[][][] }>;
    natural_light: Array<{ aspect: number; raw?: number[][][]; clahe320?: number[][][] }>;
  };
  const g3Clf = new R19Classifier(g3Model);

  let tot = 0, g0St = 0, g1Pr = 0, g3Pr = 0, g4Pr = 0, g4SeqActive = 0;
  const g4Pipe = new R19RuntimePipeline(g3Model, 16 / 9, g4Params);
  let fIdx = 0;
  for (const sec of [mdata.dim_light, mdata.natural_light]) {
    for (const item of sec) {
      for (const mk of ["raw", "clahe320"] as const) {
        const hands = item[mk] ?? [];
        if (!hands.length) {
          g4Pipe.step(undefined, fIdx++ * 33);
          continue;
        }
        tot++;
        const lm = toLm(hands[0]!);
        const asp = item.aspect || 16 / 9;
        const g0 = evaluateGameplayGesture(lm);
        if (g0.input.left || g0.input.right || g0.input.jump) g0St++;
        const g1 = classifyPistolGeometry(lm, asp);
        if (g1.state === "POINT_PRESS") g1Pr++;
        const t3 = new R19FeatureTracker();
        const x3 = t3.extract(lm, 0, asp)!;
        const p3 = g3Clf.predict(x3, 0);
        if (p3.label === "POINT_PRESS") g3Pr++;
        const g4 = resolveHybridPistolClassification(lm, p3.probs, g3Clf.labels, p3.probs[1] ?? 0, asp, g4Params);
        if (g4.state === "POINT_PRESS") g4Pr++;
        const stepOut = g4Pipe.step(lm, fIdx++ * 33);
        if (stepOut.steer.input.left || stepOut.steer.input.right || stepOut.steer.input.jump) g4SeqActive++;
      }
    }
  }

  // N0/N1 adversarial hallucinated hands
  const ndata = JSON.parse(readFileSync(N0_N1_JSON, "utf8")) as {
    records: Array<{ scene: string; family: string; strata: string; aspect: number; modes: Record<string, number[][][]> }>;
  };
  let nTot = 0, nG0 = 0, nG1 = 0, nG3 = 0, nG4 = 0;
  for (const rec of ndata.records) {
    for (const mk of ["raw", "scaled_320", "clahe_320"]) {
      const h = rec.modes[mk] ?? [];
      if (!h.length) continue;
      nTot++;
      const lm = toLm(h[0]!);
      const g0 = evaluateGameplayGesture(lm);
      if (g0.input.left || g0.input.right || g0.input.jump) nG0++;
      if (classifyPistolGeometry(lm, rec.aspect).state === "POINT_PRESS") nG1++;
      const x3 = new R19FeatureTracker().extract(lm, 0, rec.aspect)!;
      const p3 = g3Clf.predict(x3, 0);
      if (p3.label === "POINT_PRESS") nG3++;
      if (resolveHybridPistolClassification(lm, p3.probs, g3Clf.labels, p3.probs[1] ?? 0, rec.aspect, g4Params).state === "POINT_PRESS") nG4++;
    }
  }

  // MEDIAN_SKELETONS + pinchSkeleton(0.05..0.80) ownership verification
  const medianRes: Record<string, any> = {};
  for (const cls of ["palm", "stop", "four", "three", "one", "two_up", "peace", "fist"] as const) {
    const pipe = new R19RuntimePipeline(g3Model, 16 / 9, g4Params);
    let steerAct = 0, pressCnt = 0, eraseAct = 0, pinchAct = 0;
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
        const o = pipe.step(lm, f * 33, revPose, c.x, c.y, ps);
        if (f === 4) {
          if (o.steer.input.left || o.steer.input.right || o.steer.input.jump) steerAct++;
          if (o.geomState === "POINT_PRESS") pressCnt++;
          if (o.eraseActive) eraseAct++;
          if (o.pinchActive) pinchAct++;
        }
      }
    }
    medianRes[cls] = { trials: 3, g4_press: pressCnt, g4_steer_active: steerAct, erase_active: eraseAct, pinch_active: pinchAct };
  }

  const pinchRes: Record<string, any> = {};
  for (const gap of [0.05, 0.15, 0.25, 0.35, 0.45, 0.6, 0.8]) {
    const pipe = new R19RuntimePipeline(g3Model, 16 / 9, g4Params);
    let pinchAct = 0, pressFalse = 0;
    for (let f = 0; f < 10; f++) {
      const lm = placeHand(pinchSkeleton(gap), { aspect: 16 / 9, cx: 0.5 + f * 0.0005 });
      const revPose = classifyHandPose(lm, { pinchHeld: f > 0 && pinchAct > 0, experimentalRobust: true, aspect: 16 / 9 });
      const c = palmCenterNormalized(lm);
      const ps = Math.max(
        Math.hypot((lm[9]!.x - lm[0]!.x) * (16 / 9), lm[9]!.y - lm[0]!.y),
        Math.hypot((lm[17]!.x - lm[5]!.x) * (16 / 9), lm[17]!.y - lm[5]!.y),
      );
      const o = pipe.step(lm, f * 33, revPose, c.x, c.y, ps);
      if (o.pinchActive) pinchAct++;
      if (o.geomState === "POINT_PRESS" || o.steer.input.left || o.steer.input.right || o.steer.input.jump) pressFalse++;
    }
    pinchRes[`gap_${gap.toFixed(2)}`] = { pinch_frames_of_10: pinchAct, false_press_or_steer: pressFalse };
  }

  return {
    mendeley_cached: {
      hands: tot,
      g0_steer_pct: pct(g0St, tot),
      g1_press_pct: pct(g1Pr, tot),
      g3_press_pct: pct(g3Pr, tot),
      g4_press_pct: pct(g4Pr, tot),
      g4_fsm_sequential_active: g4SeqActive,
    },
    n0_n1_hallucinated: { hands: nTot, g0_steer: nG0, g1_press: nG1, g3_press: nG3, g4_press: nG4 },
    median_skeletons: medianRes,
    pinch_sweep: pinchRes,
  };
}

function evalSyntheticG4Continuity(g3Model: R19ExportedModel, g4Params: R19HybridParams) {
  const aspect = 16 / 9;
  const rows: Record<string, any> = {};
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
    const pipe = new R19RuntimePipeline(g3Model, aspect, g4Params);
    const arbiter = new InputArbiter("gameplay", () => nowMs);
    arbiter.dispatch({ type: "set-hand-enabled", enabled: true });
    const jumpAssist = new JumpAssist();
    const totalMs = WARMUP_MS + 1800;
    let nextPhysMs = 0, nextCamMs = 0, nextArbMs = 0;
    let walkFrames = 0, rightActive = 0, drops = 0, jumpTriggers = 0;
    let y = 0, vy = 0, grounded = true;
    const GRAVITY = 22, JUMP_VEL = 4.8;

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
    rows[`fps_${fps}`] = {
      horizontal_continuity_pct: pct(rightActive, walkFrames),
      right_drops: drops,
      jumps_fired: jumpTriggers,
    };
  }
  const p = new R19RuntimePipeline(g3Model, aspect, g4Params);
  for (let i = 0; i < 6; i++) p.step(handAtConst(0, true, aspect), i * 33);
  p.onPhaseChange();
  const afterReset = p.step(handAtConst(0, true, aspect), 6 * 33);
  return { continuity_sweep: rows, phase_barrier_requires_reentry_active: afterReset.steer.input.right };
}

function handAtConst(theta: number, isPress: boolean, aspect: number): Landmark[] {
  const rad = (theta * Math.PI) / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
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

async function main() {
  const g2 = loadModel("r19_model_lr.json");
  const g3 = loadModel("r19_model_mlp.json");
  const g5r18 = loadModel("g5_r18feat_model_mlp.json");
  const g5p1f = loadModel("g5_p1f_trap_model_mlp.json");

  const parity = checkParityAndLatency();

  const hgRows = readFileSync(HG5G_JSONL, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as Hg5gRow);
  const n66Rows = readFileSync(N66_JSONL, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as N66Row);
  const ipnVal = await loadIpnVideos("val");

  // 1) VAL-only grid search for G4_Hybrid across HG5G val + N66 val + IPN val
  const grid: R19HybridParams[] = [];
  for (const tauPress of [0.38, 0.45, 0.52]) {
    for (const tauPressRescue of [0.60, 0.72]) {
      grid.push({ ...DEFAULT_R19_HYBRID_PARAMS, tauPress, tauPressRescue, otherVetoTau: 0.72, allowSoftDorsalRescue: true });
    }
  }
  grid.push({ ...DEFAULT_R19_HYBRID_PARAMS, allowSoftDorsalRescue: false });

  let bestParams = DEFAULT_R19_HYBRID_PARAMS;
  let bestScore = -1e9;
  const valSweepLog: Array<Record<string, any>> = [];
  for (const hp of grid) {
    const hgVal = evalHg5gSplit(hgRows, "val", { g2: g2.clf, g3: g3.clf, g5_r18: g5r18.clf, g5_p1f: g5p1f.clf, hybridParams: hp });
    const g4m = hgVal.models.G4_Hybrid!;
    const n66Val = evalN66Split(n66Rows, "val", g3.raw, hp);
    const ipnValRes = evalIpnSequences(ipnVal, g3.raw, null, hp);
    const nogKd = ipnValRes.NOG?.g4_keydown_per_min ?? 0;
    const p2fKd = ipnValRes.P2F?.g4_keydown_per_min ?? 0;
    const p1fAct = ipnValRes.P1F?.g4_fsm_active_pct ?? 0;
    const n66FalsePress = n66Val.other_11_classes.g4_press_pct;
    // Maximize macroF1 on clean val 3-class separation while heavily penalizing OTHER->PRESS & NOG false keydowns
    const score = g4m.macroF1 - 0.04 * g4m.ready_to_press_pct - 0.05 * g4m.other_to_press_pct - 0.05 * n66FalsePress - 0.02 * (nogKd + p2fKd);
    valSweepLog.push({
      tauPress: hp.tauPress,
      tauPressRescue: hp.tauPressRescue,
      otherVetoTau: hp.otherVetoTau,
      softRescue: hp.allowSoftDorsalRescue,
      hg_val_acc: g4m.acc,
      hg_val_macroF1: g4m.macroF1,
      hg_ready_to_press_pct: g4m.ready_to_press_pct,
      hg_other_to_press_pct: g4m.other_to_press_pct,
      n66_val_other_press_pct: n66FalsePress,
      ipn_val_nog_kd_min: nogKd,
      ipn_val_p1f_act_pct: p1fAct,
      val_score: Math.round(score * 10000) / 10000,
    });
    if (score > bestScore) {
      bestScore = score;
      bestParams = hp;
    }
  }
  valSweepLog.sort((a, b) => b.val_score - a.val_score);

  // 2) Locked TEST evaluation (strictly once)
  const hgTest = evalHg5gSplit(hgRows, "test", { g2: g2.clf, g3: g3.clf, g5_r18: g5r18.clf, g5_p1f: g5p1f.clf, hybridParams: bestParams });
  const n66Test = evalN66Split(n66Rows, "test", g3.raw, bestParams);
  const ipnTestVideos = await loadIpnVideos("test");
  const ipnTest = evalIpnSequences(ipnTestVideos, g3.raw, g5p1f.raw, bestParams);
  const mendeleyAndMedian = evalMendeleyNegsAndMedian(g3.raw, bestParams);
  const synContinuity = evalSyntheticG4Continuity(g3.raw, bestParams);

  const report = {
    generated_at: new Date().toISOString(),
    selected_g4_hybrid_params: bestParams,
    parity_and_js_latency: parity,
    val_hybrid_sweep_top5: valSweepLog.slice(0, 5),
    test_bench_a_handgesture_5g: { evidence_tier: "OFFLINE_DATASET", ...hgTest },
    test_bench_b_natural_rgb_v3: { evidence_tier: "OFFLINE_DATASET", ...n66Test },
    test_bench_c_ipn_hands_test: { evidence_tier: "OFFLINE_DATASET", videos: ipnTestVideos.length, classes: ipnTest },
    test_bench_d_mendeley_n0_median_pinch: mendeleyAndMedian,
    test_bench_e_synthetic_g4_continuity: { evidence_tier: "SYNTHETIC", ...synContinuity },
  };
  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

  console.log("=== PARITY ===", JSON.stringify(parity));
  console.log("=== BEST VAL G4 PARAMS ===", JSON.stringify(bestParams), "topVal:", JSON.stringify(valSweepLog[0]));
  console.log("=== HG5G TEST ===", JSON.stringify(hgTest.models));
  console.log("=== HG5G TEST DORSAL vs PALMAR ===", JSON.stringify({ dorsal: hgTest.slices.dorsal, palmar: hgTest.slices.palmar }));
  console.log("=== N66 TEST OTHER (11 classes) ===", JSON.stringify(n66Test.other_11_classes));
  console.log("=== IPN TEST NOG/P1F/P2F/TUP ===", JSON.stringify({ NOG: ipnTest.NOG, P1F: ipnTest.P1F, P2F: ipnTest.P2F, TUP: ipnTest.TUP }));
  console.log("=== MENDELEY/N0/MEDIAN ===", JSON.stringify(mendeleyAndMedian.mendeley_cached), JSON.stringify(mendeleyAndMedian.n0_n1_hallucinated));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

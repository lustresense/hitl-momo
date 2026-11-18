/**
 * R19 Out-of-Domain Multi-Hand Evaluation on HANDS RGB-D (`10.17632/ndrczc35bt.2`, EVAL_ONLY).
 *
 * Uses GT hand bounding-box matching (`gt_match_l0[label]` / `gt_match_l1[label]`) across all
 * curated subjects and hand labels (`Horiz_HBL`, `Horiz_HFR`, `Horiz_HFL`, `Horiz_HBR`,
 * `One_*`, `Two_*`, `Five_*`, `TimeOut`, `Punch_*`, `Span_*`, `Six_*`, `Seven_*`, `Eight_*`).
 *
 * Compares `G0_main` vs `R18_UX1` (`P2_balanced`) vs `G1_pistol` vs `G2_LR` vs `G3_MLP` vs
 * `G4_Hybrid` (and `G5_r18feat` scale-shortcut ablation) on both `L0_matched` and `M3_matched`.
 */
import { createInterface } from "node:readline";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";

import { evaluateGameplayGesture } from "../../r18-ux0-sandbox/repo/frontend/implementation/src/input/gameplay-gesture";
import { classifyHandPose } from "../../r18-ux0-sandbox/repo/frontend/implementation/src/input/hand-gesture";
import type { Landmark } from "../../r18-ux0-sandbox/repo/frontend/implementation/src/input/types";
import { isIntentionalPointing } from "../../r18-ux0-sandbox/candidates/ux1_candidates";
import { Ux3FeatureTracker } from "../../r18-ux0-sandbox/candidates/ux3_features";
import { classifyPistolGeometry } from "../g1_geom/pistol_geometry";
import { zoneOfAngle } from "../g1_geom/pistol_fsm";
import { R19FeatureTracker, type R19Label } from "./r19_features";
import { R19Classifier, type R19ExportedModel } from "./r19_model";
import { DEFAULT_R19_HYBRID_PARAMS, resolveHybridPistolClassification } from "./r19_integrated";

interface MpHand {
  handedness: string | null;
  handedness_score: number | null;
  landmarks: number[][];
  geom?: Record<string, any>;
}

interface HandsRgbdRow {
  sample_id: string;
  subject: string;
  filename: string;
  combo: string[];
  gt_bboxes: Record<string, number[]>;
  gt_match_l0: Record<string, number | null>;
  gt_match_l1: Record<string, number | null>;
  aspect: number;
  mean_luma: number;
  center_luma: number;
  is_dark: boolean;
  l0: { n_hands: number; hands: MpHand[] };
  l1: { n_hands: number; hands: MpHand[] } | null;
}

const JSONL_PATH = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/hands_rgbd_eval/hands_rgbd_landmarks.jsonl";
const MODELS_DIR = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/models_v1";
const OUT_JSON = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/results/r19_hands_rgbd_eval.json";

const toLm = (pts: number[][]): Landmark[] => pts.map((p) => ({ x: p[0]!, y: p[1]!, z: p[2] ?? 0 }));
const pct = (n: number, d: number) => (d > 0 ? Math.round((10000 * n) / d) / 100 : 0);

interface LabelAcc {
  gt_instances: number;
  l0_matched: number;
  m3_matched: number;
  l1_recovered: number;
  // Counters below computed over M3 matched hands (L0, plus L1 when frame is_dark and L0 missed this hand)
  g0_steer: number;
  g0_pinched: number;
  g0_poses: Record<string, number>;
  g0_dirs: Record<string, number>;
  ux1_point: number;
  g1_ready: number;
  g1_press: number;
  g1_other: number;
  g2_ready: number;
  g2_press: number;
  g2_other: number;
  g3_ready: number;
  g3_press: number;
  g3_other: number;
  g4_ready: number;
  g4_press: number;
  g4_other: number;
  g4_reasons: Record<string, number>;
  g4_zones_when_point: Record<string, number>;
  g5_r18_ready: number;
  g5_r18_press: number;
  g5_r18_other: number;
  l0_g4_ready: number;
  l0_g4_press: number;
  l0_g4_other: number;
  handedness: Record<string, number>;
  thumb_lat_values: number[];
  hand_size_values: number[];
}

function makeAcc(): LabelAcc {
  return {
    gt_instances: 0,
    l0_matched: 0,
    m3_matched: 0,
    l1_recovered: 0,
    g0_steer: 0,
    g0_pinched: 0,
    g0_poses: {},
    g0_dirs: { left: 0, right: 0, jump: 0, none: 0 },
    ux1_point: 0,
    g1_ready: 0,
    g1_press: 0,
    g1_other: 0,
    g2_ready: 0,
    g2_press: 0,
    g2_other: 0,
    g3_ready: 0,
    g3_press: 0,
    g3_other: 0,
    g4_ready: 0,
    g4_press: 0,
    g4_other: 0,
    g4_reasons: {},
    g4_zones_when_point: {},
    g5_r18_ready: 0,
    g5_r18_press: 0,
    g5_r18_other: 0,
    l0_g4_ready: 0,
    l0_g4_press: 0,
    l0_g4_other: 0,
    handedness: {},
    thumb_lat_values: [],
    hand_size_values: [],
  };
}

function inc(rec: Record<string, number>, key: string) {
  rec[key] = (rec[key] ?? 0) + 1;
}

function quant(vals: number[], q: number): number | null {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]! * 10000) / 10000;
}

function summarizeAcc(a: LabelAcc) {
  const m = a.m3_matched;
  const l0 = a.l0_matched;
  return {
    gt_instances: a.gt_instances,
    l0_matched: a.l0_matched,
    l0_recall_pct: pct(a.l0_matched, a.gt_instances),
    m3_matched: a.m3_matched,
    m3_recall_pct: pct(a.m3_matched, a.gt_instances),
    l1_recovered_dark: a.l1_recovered,
    hand_size_p10_p50_p90: [quant(a.hand_size_values, 0.1), quant(a.hand_size_values, 0.5), quant(a.hand_size_values, 0.9)],
    thumb_lat_p10_p50_p90: [quant(a.thumb_lat_values, 0.1), quant(a.thumb_lat_values, 0.5), quant(a.thumb_lat_values, 0.9)],
    handedness_m3: a.handedness,
    g0_main: {
      steer_pct: pct(a.g0_steer, m),
      pinched_pct: pct(a.g0_pinched, m),
      dirs_cnt: a.g0_dirs,
      poses_cnt: a.g0_poses,
    },
    r18_ux1: {
      point_pct: pct(a.ux1_point, m),
    },
    g1_pistol: {
      ready_pct: pct(a.g1_ready, m),
      press_pct: pct(a.g1_press, m),
      other_pct: pct(a.g1_other, m),
      point_any_pct: pct(a.g1_ready + a.g1_press, m),
    },
    g2_lr: {
      ready_pct: pct(a.g2_ready, m),
      press_pct: pct(a.g2_press, m),
      other_pct: pct(a.g2_other, m),
      point_any_pct: pct(a.g2_ready + a.g2_press, m),
    },
    g3_mlp: {
      ready_pct: pct(a.g3_ready, m),
      press_pct: pct(a.g3_press, m),
      other_pct: pct(a.g3_other, m),
      point_any_pct: pct(a.g3_ready + a.g3_press, m),
    },
    g4_hybrid: {
      ready_cnt: a.g4_ready,
      press_cnt: a.g4_press,
      other_cnt: a.g4_other,
      ready_pct: pct(a.g4_ready, m),
      press_pct: pct(a.g4_press, m),
      other_pct: pct(a.g4_other, m),
      point_any_pct: pct(a.g4_ready + a.g4_press, m),
      l0_only_press_pct: pct(a.l0_g4_press, l0),
      l0_only_point_any_pct: pct(a.l0_g4_ready + a.l0_g4_press, l0),
      reasons_cnt: a.g4_reasons,
      zones_when_point: a.g4_zones_when_point,
    },
    g5_r18feat_ablation: {
      ready_pct: pct(a.g5_r18_ready, m),
      press_pct: pct(a.g5_r18_press, m),
      other_pct: pct(a.g5_r18_other, m),
      point_any_pct: pct(a.g5_r18_ready + a.g5_r18_press, m),
    },
  };
}

async function main() {
  const g2 = new R19Classifier(JSON.parse(readFileSync(`${MODELS_DIR}/r19_model_lr.json`, "utf8")) as R19ExportedModel);
  const g3 = new R19Classifier(JSON.parse(readFileSync(`${MODELS_DIR}/r19_model_mlp.json`, "utf8")) as R19ExportedModel);
  const g5 = new R19Classifier(JSON.parse(readFileSync(`${MODELS_DIR}/g5_r18feat_model_mlp.json`, "utf8")) as R19ExportedModel);

  const byLabel: Record<string, LabelAcc> = {};
  const byGroup: Record<string, LabelAcc> = {
    ALL_HORIZ_POINTING: makeAcc(),
    HORIZ_DORSAL_HBL_HBR: makeAcc(),
    HORIZ_PALMAR_HFL_HFR: makeAcc(),
    STRICT_OTHER_NON_POINT: makeAcc(),
  };
  let totalFrames = 0;

  const STRICT_OTHER_PREFIXES = ["Punch_", "Five_", "TimeOut", "Span_", "Two_", "Seven_", "Eight_"];
  const isStrictOtherLabel = (lbl: string) => STRICT_OTHER_PREFIXES.some((p) => lbl === p || lbl.startsWith(p));

  const rl = createInterface({ input: createReadStream(JSONL_PATH), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    totalFrames++;
    const r = JSON.parse(line) as HandsRgbdRow;
    const aspect = r.aspect || 1;

    for (const lbl of Object.keys(r.gt_bboxes)) {
      const idx0 = r.gt_match_l0[lbl];
      const idx1 = r.gt_match_l1[lbl];
      const hand0 = idx0 !== null && idx0 !== undefined ? r.l0.hands[idx0] ?? null : null;
      const hand1 = idx1 !== null && idx1 !== undefined && r.l1 ? r.l1.hands[idx1] ?? null : null;
      // Matched M3 uses L0 if present, or L1 CLAHE if dark (plus note raw L1 recovery separately too!)
      // Check both is_dark-gated L1 AND unconditional L1 availability
      const useL1 = !hand0 && hand1 !== null;
      const hand = hand0 ?? (r.is_dark ? hand1 : null);

      const targets: LabelAcc[] = [(byLabel[lbl] ??= makeAcc())];
      if (lbl.startsWith("Horiz_")) targets.push(byGroup.ALL_HORIZ_POINTING!);
      if (lbl === "Horiz_HBL" || lbl === "Horiz_HBR") targets.push(byGroup.HORIZ_DORSAL_HBL_HBR!);
      if (lbl === "Horiz_HFL" || lbl === "Horiz_HFR") targets.push(byGroup.HORIZ_PALMAR_HFL_HFR!);
      if (isStrictOtherLabel(lbl)) targets.push(byGroup.STRICT_OTHER_NON_POINT!);

      for (const a of targets) {
        a.gt_instances++;
        if (hand0) a.l0_matched++;
        if (hand) a.m3_matched++;
        if (useL1 && hand) a.l1_recovered++;
      }

      if (!hand) continue;
      const lm = toLm(hand.landmarks);
      const t19 = new R19FeatureTracker();
      const t18 = new Ux3FeatureTracker();
      const x19 = t19.extract(lm, 0, aspect);
      const x18 = t18.extract(lm, 0, aspect);
      if (!x19 || !x18) continue;

      const g0 = evaluateGameplayGesture(lm);
      const g0Pose = classifyHandPose(lm, { experimentalRobust: false, aspect });
      const ux1Ok = isIntentionalPointing(lm, "P2_balanced", aspect).ok;
      const g1 = classifyPistolGeometry(lm, aspect);
      const p2 = g2.predict(x19, 0);
      const p3 = g3.predict(x19, 0);
      const p5 = g5.predict(x18, 0);
      const g4 = resolveHybridPistolClassification(lm, p3.probs, g3.labels, p3.probs[1] ?? 0, aspect, DEFAULT_R19_HYBRID_PARAMS);
      const g0Steer = g0.input.left || g0.input.right || g0.input.jump;
      const g0Dir = g0.input.left && !g0.input.jump ? "left" : g0.input.right && !g0.input.jump ? "right" : g0.input.jump ? "jump" : "none";
      const g4Zone = g4.state !== "OTHER" && g4.angle !== null ? zoneOfAngle(g4.angle) : "none";

      for (const a of targets) {
        inc(a.handedness, hand.handedness ?? "None");
        if (typeof hand.geom?.hand_size === "number") a.hand_size_values.push(hand.geom.hand_size);
        if (typeof hand.geom?.thumb_lateral === "number") a.thumb_lat_values.push(hand.geom.thumb_lateral);
        if (g0Steer) a.g0_steer++;
        if (g0.pinched) a.g0_pinched++;
        inc(a.g0_poses, g0Pose);
        inc(a.g0_dirs, g0Dir);
        if (ux1Ok) a.ux1_point++;

        const addCls = (lblPred: R19Label, kReady: keyof LabelAcc, kPress: keyof LabelAcc, kOther: keyof LabelAcc) => {
          if (lblPred === "POINT_READY") (a[kReady] as number)++;
          else if (lblPred === "POINT_PRESS") (a[kPress] as number)++;
          else (a[kOther] as number)++;
        };
        addCls(g1.state, "g1_ready", "g1_press", "g1_other");
        addCls(p2.label as R19Label, "g2_ready", "g2_press", "g2_other");
        addCls(p3.label as R19Label, "g3_ready", "g3_press", "g3_other");
        addCls(g4.state, "g4_ready", "g4_press", "g4_other");
        addCls(p5.label as R19Label, "g5_r18_ready", "g5_r18_press", "g5_r18_other");
        inc(a.g4_reasons, `${g4.subClass}:${g4.reason}`);
        if (g4.state !== "OTHER") inc(a.g4_zones_when_point, g4Zone);
        if (hand0) addCls(g4.state, "l0_g4_ready", "l0_g4_press", "l0_g4_other");
      }
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    source_jsonl: JSONL_PATH,
    total_frames: totalFrames,
    groups: Object.fromEntries(Object.entries(byGroup).map(([k, v]) => [k, summarizeAcc(v)])),
    by_label: Object.fromEntries(Object.entries(byLabel).map(([k, v]) => [k, summarizeAcc(v)])),
  };
  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    total_frames: totalFrames,
    Horiz_HBL: report.by_label["Horiz_HBL"] ? {
      gt: report.by_label["Horiz_HBL"].gt_instances,
      m3: report.by_label["Horiz_HBL"].m3_matched,
      hs_p50: report.by_label["Horiz_HBL"].hand_size_p10_p50_p90?.[1],
      g0_steer: report.by_label["Horiz_HBL"].g0_main.steer_pct,
      g0_pinched: report.by_label["Horiz_HBL"].g0_main.pinched_pct,
      g0_poses: report.by_label["Horiz_HBL"].g0_main.poses_cnt,
      ux1_point: report.by_label["Horiz_HBL"].r18_ux1.point_pct,
      g1_point_any: report.by_label["Horiz_HBL"].g1_pistol.point_any_pct,
      g3_point_any: report.by_label["Horiz_HBL"].g3_mlp.point_any_pct,
      g4_point_any: report.by_label["Horiz_HBL"].g4_hybrid.point_any_pct,
      g4_press: report.by_label["Horiz_HBL"].g4_hybrid.press_pct,
      g4_ready: report.by_label["Horiz_HBL"].g4_hybrid.ready_pct,
      g5_r18_point_any: report.by_label["Horiz_HBL"].g5_r18feat_ablation.point_any_pct,
    } : null,
    STRICT_OTHER_NON_POINT: report.groups["STRICT_OTHER_NON_POINT"],
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

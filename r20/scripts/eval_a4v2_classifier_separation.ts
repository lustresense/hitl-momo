/**
 * R20-FIX P0.1 — Detector Failure vs Classifier Failure Separation (`eval_a4v2_classifier_separation.ts`).
 *
 * Reads `r20-sandbox/data/aug/a4v2_detected_landmarks.jsonl` emitted by `eval_a4v2_sequential.py` and runs the
 * exact browser TypeScript G4 Hybrid pipelines (`C0_R19`, `C4_R20`, `C7_R20_Distilled`) on every detected hand frame,
 * reporting per-condition:
 *  - `detector_miss_rate`              (MediaPipe failed to find the hand)
 *  - `conditional_classifier_acc`      (G4 Hybrid accuracy GIVEN MediaPipe detected the hand)
 *  - `classifier_error_rate_overall`   (detected frames misclassified / total frames)
 *  - `false_press_on_non_press`        (OTHER/READY frames misclassified as POINT_PRESS)
 *  - `end_to_end_correct_rate`         (detected AND classified correctly / total frames)
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Landmark } from "../../r19/candidates/pistol_types";
import { R19FeatureTracker } from "../../r19/candidates/r19_features";
import { DEFAULT_R19_HYBRID_PARAMS, resolveHybridPistolClassification } from "../../r19/candidates/r19_integrated";
import type { R19ExportedModel } from "../../r19/candidates/r19_model";
import { R20Fp32JsonClassifier } from "../candidates/r20_model";

const SANDBOX = process.env.R20_SANDBOX || "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const REPO = process.env.R20_REPO || "/srv/sketchbook/mediapipe-optimize/research-can";
const IN_JSONL = `${SANDBOX}/data/aug/a4v2_detected_landmarks.jsonl`;
const OUT_JSON = `${REPO}/r20/results/r20_a4_detector_vs_classifier.json`;

interface Row {
  policy: string;
  sample_id: string;
  aug: string;
  label: "POINT_READY" | "POINT_PRESS" | "OTHER";
  aspect: number;
  frame_idx: number;
  detected: boolean;
  landmarks: Array<[number, number, number]> | null;
}

const MODELS: Record<string, R20Fp32JsonClassifier> = {
  C0_R19: new R20Fp32JsonClassifier(
    JSON.parse(readFileSync(`${REPO}/r19/models/r19_model_mlp.json`, "utf8")) as R19ExportedModel,
  ),
  C4_R20: new R20Fp32JsonClassifier(
    JSON.parse(readFileSync(`${REPO}/r20/models/r20_model_c4_full_mlp.json`, "utf8")) as R19ExportedModel,
  ),
  C7_R20_Distilled: new R20Fp32JsonClassifier(
    JSON.parse(readFileSync(`${REPO}/r20/models/r20_model_c7_distilled_t4_mlp.json`, "utf8")) as R19ExportedModel,
  ),
};

function evalModel(rows: Row[], clf: R20Fp32JsonClassifier) {
  const byPolicy: Record<string, Record<string, {
    total: number;
    detector_miss: number;
    detected: number;
    correct: number;
    clf_error: number;
    false_press: number;
  }>> = {};

  for (const r of rows) {
    const pm = (byPolicy[r.policy] ??= {});
    const st = (pm[r.aug] ??= { total: 0, detector_miss: 0, detected: 0, correct: 0, clf_error: 0, false_press: 0 });
    st.total++;
    if (!r.detected || !r.landmarks || r.landmarks.length !== 21) {
      st.detector_miss++;
      continue;
    }
    st.detected++;
    const lms: Landmark[] = r.landmarks.map(([x, y, z]) => ({ x, y, z }));
    const tracker = new R19FeatureTracker(r.aspect);
    const feat = tracker.extract(lms);
    if (!feat) {
      st.clf_error++;
      continue;
    }
    const probs = clf.proba(feat);
    const pPressIdx = clf.labels.indexOf("POINT_PRESS");
    const pPress = probs[pPressIdx] ?? 0;
    const cls = resolveHybridPistolClassification(lms, probs, clf.labels, pPress, r.aspect, DEFAULT_R19_HYBRID_PARAMS);
    if (cls.state === r.label) {
      st.correct++;
    } else {
      st.clf_error++;
      if (r.label !== "POINT_PRESS" && cls.state === "POINT_PRESS") {
        st.false_press++;
      }
    }
  }

  const out: Record<string, unknown> = {};
  for (const [pol, condMap] of Object.entries(byPolicy)) {
    let tot = 0, miss = 0, det = 0, ok = 0, err = 0, fp = 0;
    const byCond: Record<string, unknown> = {};
    for (const [aug, st] of Object.entries(condMap)) {
      tot += st.total;
      miss += st.detector_miss;
      det += st.detected;
      ok += st.correct;
      err += st.clf_error;
      fp += st.false_press;
      byCond[aug] = {
        total_frames: st.total,
        detector_miss_frames: st.detector_miss,
        detector_miss_rate: +(st.detector_miss / Math.max(1, st.total)).toFixed(4),
        detected_frames: st.detected,
        conditional_classifier_acc: st.detected > 0 ? +(st.correct / st.detected).toFixed(4) : null,
        classifier_error_frames: st.clf_error,
        false_press_on_non_press: st.false_press,
        end_to_end_correct_rate: +(st.correct / Math.max(1, st.total)).toFixed(4),
      };
    }
    out[pol] = {
      overall: {
        total_frames: tot,
        detector_miss_frames: miss,
        detector_miss_rate: +(miss / Math.max(1, tot)).toFixed(4),
        detected_frames: det,
        conditional_classifier_acc: det > 0 ? +(ok / det).toFixed(4) : null,
        classifier_error_frames: err,
        false_press_on_non_press: fp,
        end_to_end_correct_rate: +(ok / Math.max(1, tot)).toFixed(4),
      },
      by_condition: byCond,
    };
  }
  return out;
}

const rawLines = readFileSync(IN_JSONL, "utf8").split("\n").filter((l) => l.trim().length > 0);
const rows: Row[] = rawLines.map((l) => JSON.parse(l) as Row);

const summary: Record<string, unknown> = {
  generated_at: new Date().toISOString(),
  input_rows: rows.length,
  models: {},
};

for (const [name, clf] of Object.entries(MODELS)) {
  (summary.models as Record<string, unknown>)[name] = evalModel(rows, clf);
}

writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));
console.log(`Wrote ${OUT_JSON}`);
for (const [name, res] of Object.entries(summary.models as Record<string, Record<string, { overall: Record<string, unknown> }>>)) {
  for (const [pol, v] of Object.entries(res)) {
    console.log(name, pol, JSON.stringify(v.overall));
  }
}

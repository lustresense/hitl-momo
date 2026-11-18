/**
 * Stage P3 Pre-Training Verification:
 *  1) Multi-aspect mathematical invariance of `R19FeatureTracker` (`1:1`, `5:4`, `4:3`, `16:9`, `9:16`)
 *  2) Collapsed knuckle (`5 == 17`) & degenerate hand zero-NaN safety
 *  3) End-to-end JS latency benchmark (`extract` + `R19Classifier.proba` + `resolveHybrid` + `PistolVirtualKeyFSM`)
 */
import { performance } from "node:perf_hooks";
import { MEDIAN_SKELETONS, placeHand } from "../../r18-ux0-sandbox/repo/frontend/implementation/tests/input/realistic-hands";
import { R19_FEATURE_COUNT, R19_FEATURE_NAMES, R19FeatureTracker } from "./r19_features";
import { R19Classifier, type R19ExportedModel } from "./r19_model";
import { R19RuntimePipeline } from "./r19_integrated";

const dummyModel: R19ExportedModel = {
  name: "bench_mlp_96_48",
  version: "r19-bench",
  license_provenance: "synthetic-bench",
  labels: ["POINT_READY", "POINT_PRESS", "OTHER"],
  feature_names: R19_FEATURE_NAMES,
  mean: new Array(R19_FEATURE_COUNT).fill(0),
  std: new Array(R19_FEATURE_COUNT).fill(1),
  temperature: 1.0,
  layers: [
    { W: Array.from({ length: R19_FEATURE_COUNT }, () => Array.from({ length: 96 }, (_, j) => ((j % 7) - 3) * 0.01)), b: new Array(96).fill(0) },
    { W: Array.from({ length: 96 }, () => Array.from({ length: 48 }, (_, j) => ((j % 5) - 2) * 0.01)), b: new Array(48).fill(0) },
    { W: Array.from({ length: 48 }, () => [0.01, -0.01, 0.0]), b: [0, 0, 0] },
  ],
};

// 1. Strict 82/82 aspect + scale invariance across all 10 realistic poses x 5 aspects x 3 scales
const aspects = [1, 5 / 4, 4 / 3, 16 / 9, 9 / 16];
const scales = [0.22, 0.45, 0.85];
const tr = new R19FeatureTracker();
let maxAspectDiff = 0;

for (const cls of Object.keys(MEDIAN_SKELETONS) as Array<keyof typeof MEDIAN_SKELETONS>) {
  tr.reset();
  const baseLm = placeHand(MEDIAN_SKELETONS[cls], { aspect: 1, rollDeg: 27, cx: 0.45, cy: 0.65, scale: 0.45 });
  const baseFeat = tr.extract(baseLm, 0, 1)!;
  for (const a of aspects) {
    for (const sc of scales) {
      tr.reset();
      const lm = placeHand(MEDIAN_SKELETONS[cls], { aspect: a, rollDeg: 27, cx: 0.45, cy: 0.65, scale: sc });
      const f = tr.extract(lm, 0, a)!;
      for (let i = 0; i < R19_FEATURE_COUNT; i++) {
        maxAspectDiff = Math.max(maxAspectDiff, Math.abs(f[i]! - baseFeat[i]!));
      }
    }
  }
}

// 2. Knuckle-collapse & mirrored flip safety
const cLm = placeHand(MEDIAN_SKELETONS.thumb_index, { aspect: 16 / 9, mirror: true, rollDeg: -90 });
cLm[17] = { ...cLm[5]! };
tr.reset();
const cFeat = tr.extract(cLm, 0, 16 / 9);
if (!cFeat || cFeat.some((v) => !Number.isFinite(v))) throw new Error("Knuckle collapse NaN!");

// 3. End-to-end JS latency micro-benchmark for MLP [82 -> 96 -> 48 -> 3] + G4 hybrid + FSM
const pipe = new R19RuntimePipeline(dummyModel, 16 / 9);
const clf = new R19Classifier(dummyModel);
const seq = [
  placeHand(MEDIAN_SKELETONS.one, { aspect: 16 / 9, rollDeg: 85 }),
  placeHand(MEDIAN_SKELETONS.thumb_index, { aspect: 16 / 9, rollDeg: 85 }),
  placeHand(MEDIAN_SKELETONS.palm, { aspect: 16 / 9 }),
];
const clfUs: number[] = [];
const pipeUs: number[] = [];
for (let i = 0; i < 3000; i++) {
  const lm = seq[i % seq.length]!;
  const t0 = performance.now();
  clf.proba(cFeat);
  clfUs.push((performance.now() - t0) * 1000);
  const t1 = performance.now();
  pipe.step(lm, i * 33.33, "none", 0.5, 0.5, 0.22);
  pipeUs.push((performance.now() - t1) * 1000);
}
clfUs.sort((a, b) => a - b);
pipeUs.sort((a, b) => a - b);
const q = (arr: number[], p: number) => Math.round(arr[Math.floor(p * (arr.length - 1))]! * 100) / 100;

console.log(
  JSON.stringify(
    {
      feature_count: R19_FEATURE_COUNT,
      max_aspect_invariant_diff: Number(maxAspectDiff.toExponential(3)),
      knuckle_collapse_finite: true,
      mlp_only_us: { p50: q(clfUs, 0.5), p95: q(clfUs, 0.95) },
      full_g4_pipeline_us: { p50: q(pipeUs, 0.5), p95: q(pipeUs, 0.95) },
    },
    null,
    2,
  ),
);
if (maxAspectDiff > 1e-12) process.exit(1);

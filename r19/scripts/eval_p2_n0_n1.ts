import { readFileSync, writeFileSync } from "node:fs";
import { classifyHandPose } from "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/repo/frontend/implementation/src/input/hand-gesture";
import { evaluateGameplayGesture } from "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/repo/frontend/implementation/src/input/gameplay-gesture";
import { isIntentionalPointing } from "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/candidates/ux1_candidates";
import type { Landmark } from "../candidates/pistol_types";
import { classifyPistolGeometry } from "../candidates/pistol_geometry";
import { PistolVirtualKeyFSM } from "../candidates/pistol_fsm";

const src = JSON.parse(readFileSync("/srv/sketchbook/mediapipe-optimize/research-can/r19/results/n0_n1_distractor_landmarks.json", "utf8"));
const byMode: Record<string, { total_hands: number; g0_eval_steer: number; ux1_point: number; g1_ready: number; g1_press: number; g1_other: number; g1_fsm_active_5x: number }> = {};

for (const r of src.records) {
  for (const mode of ["raw", "scaled_320", "clahe_320"]) {
    const m = (byMode[mode] ??= { total_hands: 0, g0_eval_steer: 0, ux1_point: 0, g1_ready: 0, g1_press: 0, g1_other: 0, g1_fsm_active_5x: 0 });
    for (const pts of r.modes[mode] as number[][][]) {
      m.total_hands++;
      const lm: Landmark[] = pts.map(([x, y]) => ({ x: x!, y: y! }));
      const ev0 = evaluateGameplayGesture(lm);
      if (ev0.input.left || ev0.input.right || ev0.input.jump) m.g0_eval_steer++;
      if (isIntentionalPointing(lm, "P2_balanced", r.aspect).ok) m.ux1_point++;
      const c1 = classifyPistolGeometry(lm, r.aspect);
      if (c1.state === "POINT_READY") m.g1_ready++;
      else if (c1.state === "POINT_PRESS") m.g1_press++;
      else m.g1_other++;
      classifyHandPose(lm);
      const fsm = new PistolVirtualKeyFSM({ aspect: r.aspect });
      let anyFsm = false;
      for (let k = 0; k < 5; k++) {
        const s = fsm.update(lm, k * 100);
        if (s.input.left || s.input.right || s.input.jump) anyFsm = true;
      }
      if (anyFsm) m.g1_fsm_active_5x++;
    }
  }
}

const out = {
  evidence_tier: "SYNTHETIC",
  total_scenes: src.total_scenes,
  detector_stats: src.stats,
  by_family: src.by_family,
  downstream_on_hallucinated_hands: byMode,
};
writeFileSync("/srv/sketchbook/mediapipe-optimize/research-can/r19/results/n0_n1_p2_eval.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(byMode, null, 2));

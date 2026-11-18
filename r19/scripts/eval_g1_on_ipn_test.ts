/**
 * Zero-disk evaluation of G0_main vs R18_UX1 vs G1_pistol on streamed IPN HandS Val/Test sequences.
 * Measures P1F/C1F pointing behavior vs NOG/P2F/GRB/TUP/OP2 false POINT_PRESS & FSM key activations.
 */
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { GameplayGestureFilter } from "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/repo/frontend/implementation/src/input/gameplay-gesture";
import { isIntentionalPointing, VirtualKeySteeringFSM } from "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/candidates/ux1_candidates";
import type { Landmark } from "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/repo/frontend/implementation/src/input/types";
import { classifyPistolGeometry } from "../candidates/pistol_geometry";
import { PistolVirtualKeyFSM } from "../candidates/pistol_fsm";

interface FrameRow {
  f: number;
  cls: string;
  mp: number[][][];
}
interface VideoSeq {
  video: string;
  person: string;
  frames: FrameRow[];
}

const ASPECT_IPN = 4 / 3;
const DT_MS = 1000 / 30;
const toLm = (pts: number[][]): Landmark[] => pts.map(([x, y]) => ({ x: x!, y: y! }));
const pct = (n: number, d: number) => (d > 0 ? Math.round((10000 * n) / d) / 100 : 0);
const perMin = (n: number, frames: number) => (frames > 0 ? Math.round((n / (frames / 30 / 60)) * 100) / 100 : 0);

async function main() {
  const outPath = process.argv[2] || "/srv/sketchbook/mediapipe-optimize/r19-sandbox/train/ipn_test_g0_g1_baseline.json";
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

  type Acc = {
    frames: number;
    mpHands: number;
    g0Steer: number;
    ux1Point: number;
    ux1Steer: number;
    g1Ready: number;
    g1Press: number;
    g1Other: number;
    g1FsmActive: number;
    g1FsmKeydown: number;
    g1FsmJump: number;
    g1OtherSub: Record<string, number>;
  };
  const byCls: Record<string, Acc> = {};
  const gAcc = (c: string): Acc =>
    (byCls[c] ??= {
      frames: 0,
      mpHands: 0,
      g0Steer: 0,
      ux1Point: 0,
      ux1Steer: 0,
      g1Ready: 0,
      g1Press: 0,
      g1Other: 0,
      g1FsmActive: 0,
      g1FsmKeydown: 0,
      g1FsmJump: 0,
      g1OtherSub: {},
    });

  let videos = 0;
  const persons = new Set<string>();

  for await (const line of rl) {
    if (!line.trim()) continue;
    const vid = JSON.parse(line) as VideoSeq;
    videos++;
    persons.add(vid.person);

    const g0 = new GameplayGestureFilter();
    const ux1 = new VirtualKeySteeringFSM({
      pointingPolicy: "P2_balanced",
      jumpPolicy: "J2_edge",
      aspect: ASPECT_IPN,
      dwellMs: 50,
      oppositeDwellMs: 66,
      rearmFrames: 3,
      hysteresisDeg: 5,
    });
    const g1Fsm = new PistolVirtualKeyFSM({ aspect: ASPECT_IPN });

    for (const fr of vid.frames) {
      const a = gAcc(fr.cls);
      a.frames++;
      const nowMs = fr.f * DT_MS;
      const lm = fr.mp.length > 0 ? toLm(fr.mp[0]!) : undefined;
      if (lm) a.mpHands++;

      const o0 = g0.update(lm, nowMs);
      if (o0.input.left || o0.input.right || o0.input.jump) a.g0Steer++;

      const u1 = ux1.update(lm, nowMs);
      if (lm && isIntentionalPointing(lm, "P2_balanced", ASPECT_IPN).ok) a.ux1Point++;
      if (u1.input.left || u1.input.right || u1.input.jump) a.ux1Steer++;

      const g1Cls = lm ? classifyPistolGeometry(lm, ASPECT_IPN) : null;
      if (g1Cls) {
        if (g1Cls.state === "POINT_READY") a.g1Ready++;
        else if (g1Cls.state === "POINT_PRESS") a.g1Press++;
        else {
          a.g1Other++;
          a.g1OtherSub[g1Cls.subClass] = (a.g1OtherSub[g1Cls.subClass] ?? 0) + 1;
        }
      }

      const g1Out = g1Fsm.update(lm, nowMs, g1Cls ?? undefined);
      if (g1Out.input.left || g1Out.input.right || g1Out.input.jump) a.g1FsmActive++;
      if (g1Out.keyEvent === "KEYDOWN") a.g1FsmKeydown++;
      if (g1Out.jumpFiredThisFrame) a.g1FsmJump++;
    }
  }

  const summary: Record<string, any> = {};
  for (const [cls, a] of Object.entries(byCls).sort((x, y) => y[1].frames - x[1].frames)) {
    summary[cls] = {
      frames: a.frames,
      mpHands: a.mpHands,
      duration_min: Math.round((a.frames / 30 / 60) * 100) / 100,
      g0_steer_pct: pct(a.g0Steer, a.mpHands),
      ux1_point_pct: pct(a.ux1Point, a.mpHands),
      ux1_steer_pct: pct(a.ux1Steer, a.mpHands),
      g1_ready_pct: pct(a.g1Ready, a.mpHands),
      g1_press_pct: pct(a.g1Press, a.mpHands),
      g1_other_pct: pct(a.g1Other, a.mpHands),
      g1_fsm_active_pct: pct(a.g1FsmActive, a.mpHands),
      g1_fsm_keydown_per_min: perMin(a.g1FsmKeydown, a.frames),
      g1_fsm_jump_per_min: perMin(a.g1FsmJump, a.frames),
      g1_other_sub_top: a.g1OtherSub,
    };
  }

  const out = {
    evidence_tier: "OFFLINE_DATASET",
    dataset: "IPN HandS (person-disjoint test split)",
    note: "IPN HandS has NO explicit pistol POINT_PRESS class; P1F/C1F are ordinary 1-finger pointing, while NOG/P2F/GRB/T*/OP2/Z* are OTHER negatives.",
    videos,
    persons: Array.from(persons).sort(),
    classes: summary,
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Processed videos=${videos}, persons=${out.persons.join(",")}`);
  for (const cls of ["NOG", "P1F", "C1F", "P2F", "GRB", "TUP", "OP2"]) {
    if (summary[cls]) console.log(cls, JSON.stringify(summary[cls]));
  }
}

void main();

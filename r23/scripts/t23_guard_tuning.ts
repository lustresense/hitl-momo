/**
 * T23 Langkah 3: Guard onset parameter tuning evaluation
 * Combinations: window in {400, 300, 250} x hold in {300, 200, 150}
 * Evaluated on s352-r22b-strokes-v1.json (16 strokes) and s970-t002-landmark-replay-v1.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LabAnalyzer } from "@/src/components/nui-lab/lab-analyzer";
import { validateR19Model } from "@/src/components/nui-lab/r19/r19_loader";
import type { Landmark } from "@/src/input/types";

const S970_PATH = resolve(process.cwd(), "tests/fixtures/s970-t002-landmark-replay-v1.json");
const S352_PATH = resolve(process.cwd(), "tests/fixtures/s352-r22b-strokes-v1.json");
const R20_C4_MODEL = validateR19Model(
  JSON.parse(readFileSync(resolve(process.cwd(), "public/models/r20-c4-model.json"), "utf8")),
);

const OUT_PATH = resolve("/srv/sketchbook/research-can/r23/results/T23_guard_tuning.json");

interface Frame {
  t: number;
  aspect: number;
  lm: Array<[number, number]> | null;
  captureFrameId?: number;
  frameAgeMs?: number;
  trialId?: string;
}

function toLandmarks(pairs: Array<[number, number]> | null): Landmark[] | undefined {
  if (!pairs || pairs.length < 21) return undefined;
  return pairs.map(([x, y]) => ({ x, y, z: 0 }));
}

interface ComboResult {
  windowMs: number;
  holdMs: number;
  s970FalseStrokes: number;
  s352FalseStrokes: number;
  s352StrokeCount: number;
  s352OnsetsGte330: number;
  s352MaxOnsetMs: number;
  s352OnsetWaitedMs: number[];
  qualifies: boolean;
}

describe("T23 Langkah 3: Guard Onset Tuning Grid Search", () => {
  it("evaluates all 9 combinations and saves r23/results/T23_guard_tuning.json", () => {
    const s970Fixture = JSON.parse(readFileSync(S970_PATH, "utf8"));
    const s970Frames: Frame[] = s970Fixture.frames;
    const [undoStart, undoEnd] = s970Fixture.undoWindowMs as [number, number];

    const s352Fixture = JSON.parse(readFileSync(S352_PATH, "utf8"));
    const s352Frames: Frame[] = s352Fixture.frames;

    const windows = [400, 300, 250];
    const holds = [300, 200, 150];

    const results: ComboResult[] = [];

    for (const w of windows) {
      for (const h of holds) {
        // 1. Evaluate S-970 T002 for false strokes inside undoWindow
        const a970 = new LabAnalyzer({
          route: "canvas",
          fullFrameLock: true,
          enableInk: true,
          preset: "default-any-pinch",
          resolverConfig: {
            postFistOnsetGuardWindowMs: w,
            postFistOnsetHoldMs: h,
          },
        });
        a970.enableR19(R20_C4_MODEL, 0);

        let s970FalseStrokes = 0;
        let prevActive970 = false;

        for (const f of s970Frames) {
          const lm = toLandmarks(f.lm);
          a970.analyse({
            landmarks: lm ? [lm] : [],
            inferMs: 12,
            nowMs: f.t,
            aspect: f.aspect,
            captureFrameId: f.captureFrameId ?? 1,
            frameAgeMs: Math.min(f.frameAgeMs ?? 30, 140),
            isStale: false,
          });

          const snap = a970.snapshot(f.t);
          const st = a970.strokes();
          const activeNow = Boolean(st.active);
          if (activeNow && !prevActive970) {
            // Stroke started
            if (f.t >= undoStart && f.t <= undoEnd) {
              s970FalseStrokes++;
            }
          }
          prevActive970 = activeNow;
        }

        // 2. Evaluate S-352 (T003 + T004) for onsets and false strokes
        // S-352 undo transition window in T003: [213000, 257500]
        const a352 = new LabAnalyzer({
          route: "canvas",
          fullFrameLock: true,
          enableInk: true,
          preset: "default-any-pinch",
          resolverConfig: {
            postFistOnsetGuardWindowMs: w,
            postFistOnsetHoldMs: h,
          },
        });
        a352.enableR19(R20_C4_MODEL, 0);

        const onsets: number[] = [];
        let s352FalseStrokes = 0;
        let prevActive352 = false;
        let currentTrial = "";

        const s352UndoWindows: [number, number][] = [
          [213000, 222500],
          [227000, 232000],
          [256500, 257500],
        ];

        for (const f of s352Frames) {
          if (f.trialId && f.trialId !== currentTrial) {
            currentTrial = f.trialId;
            a352.releaseAll("trial-switch", f.t);
            prevActive352 = false;
          }

          const lm = toLandmarks(f.lm);
          a352.analyse({
            landmarks: lm ? [lm] : [],
            inferMs: 12,
            nowMs: f.t,
            aspect: f.aspect,
            captureFrameId: f.captureFrameId ?? 1,
            frameAgeMs: Math.min(f.frameAgeMs ?? 30, 140),
            isStale: false,
          });

          const snap = a352.snapshot(f.t);
          if (snap.actionResolution.onsetConfirmedMeta) {
            onsets.push(snap.actionResolution.onsetConfirmedMeta.waitedMs);
          }

          const st = a352.strokes();
          const activeNow = Boolean(st.active);
          if (activeNow && !prevActive352) {
            // Check false strokes inside any undo window
            if (currentTrial === "S-352b2d78-T003") {
              const inUndo = s352UndoWindows.some(([start, end]) => f.t >= start && f.t <= end);
              if (inUndo) {
                s352FalseStrokes++;
              }
            }
          }
          prevActive352 = activeNow;
        }

        const onsetsGte330 = onsets.filter((ms) => ms >= 330).length;
        const maxOnset = onsets.length > 0 ? Math.max(...onsets) : 0;
        const qualifies =
          s970FalseStrokes === 0 &&
          s352FalseStrokes === 0 &&
          onsetsGte330 <= 1;

        results.push({
          windowMs: w,
          holdMs: h,
          s970FalseStrokes,
          s352FalseStrokes,
          s352StrokeCount: onsets.length,
          s352OnsetsGte330: onsetsGte330,
          s352MaxOnsetMs: maxOnset,
          s352OnsetWaitedMs: onsets,
          qualifies,
        });
      }
    }

    const payload = {
      task: "T23_step3_guard_tuning",
      evaluatedAt: new Date().toISOString(),
      grid: {
        windows,
        holds,
      },
      results,
      summary: {
        totalEvaluated: results.length,
        qualifyingCombos: results.filter((r) => r.qualifies).map((r) => `${r.windowMs}x${r.holdMs}`),
        bestCombo: results.find((r) => r.qualifies) ?? null,
      },
    };

    writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), "utf8");
    console.log("T23 guard tuning results written to", OUT_PATH);
    console.log("Summary:", JSON.stringify(payload.summary));

    expect(results.length).toBe(9);
  });
});

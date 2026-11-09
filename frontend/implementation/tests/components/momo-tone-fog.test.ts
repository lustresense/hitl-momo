import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PredictionResult } from "@/src/domain/types";
import { MomoEngine, fogFrame, clampFog } from "@/src/components/momo/momo-engine";
import { WING_GEOMETRY, type WingSide } from "@/src/components/momo/momo-wing";
import {
  momoLevelTone, momoGuessQuestion, momoGuessMumble, confidencePercent,
  reliefForDecision, takeFirstCorrectionRelief, resetCorrectionReliefForTests, FIRST_CORRECTION_RELIEF,
} from "@/src/domain/momo-script";
import { resolveMomoCue } from "@/src/components/drawing/momo-cue";

describe("R14 fog per level", () => {
  it("L1 none, L2 passing puffs, L3 settles on the face", () => {
    expect(momoLevelTone(1)).toMatchObject({ tone: "confident", fog: 0 });
    expect(momoLevelTone(2).tone).toBe("doubtful");
    expect(momoLevelTone(3).tone).toBe("humble");
    expect(momoLevelTone(2).fog).toBeGreaterThan(momoLevelTone(1).fog);
    expect(momoLevelTone(3).fog).toBeGreaterThan(momoLevelTone(2).fog);
    for (let t = 0; t < 12; t += 0.25) expect(fogFrame(0, t).opacity).toBe(0);
    const l2 = Array.from({ length: 48 }, (_, i) => fogFrame(0.4, i * 0.25).opacity);
    expect(Math.max(...l2)).toBeGreaterThan(0.2);
    expect(Math.min(...l2)).toBe(0); // only now and then
    for (let t = 0; t < 12; t += 0.25) {
      const f = fogFrame(0.9, t);
      expect(f.opacity).toBeGreaterThan(0.8);
      expect(Math.abs(f.x)).toBeLessThan(40);
    }
    expect(clampFog(5)).toBe(1);
    expect(clampFog(Number.NaN)).toBe(0);
  });
});

describe("R14 tone keeps provider numbers", () => {
  it("each tone says the exact provider percent", () => {
    for (const stage of [1, 2, 3]) {
      expect(momoGuessQuestion(stage, "papan", 0.5, "balok")).toContain("50%");
      expect(momoGuessQuestion(stage, "papan", 0.537)).toContain("54%");
    }
    expect(momoGuessQuestion(1, "papan", 0.5)).toMatch(/Gampang/);
    expect(momoGuessQuestion(2, "papan", 0.5, "balok")).toMatch(/bingung/);
    expect(momoGuessQuestion(3, "papan", 0.5)).toMatch(/Kamu yang lebih tahu/);
    expect(confidencePercent(0.884)).toBe(88);
    expect(momoGuessMumble(1, null)).toBe("hmm...");
  });

  it("drawing cue uses the level tone and fog only while Momo reads", () => {
    const prediction: PredictionResult = { candidates: [{ label: "papan", confidence: 0.5 }, { label: "balok", confidence: 0.3 }, { label: "tangga", confidence: 0.2 }] };
    const l3 = resolveMomoCue(null, "evaluating", { stage: 3, prediction });
    expect(l3.fog).toBeGreaterThan(0.7);
    expect(String(l3.message)).toContain("50%");
    expect(resolveMomoCue(null, "drawing", { stage: 3, prediction }).fog).toBe(0);
  });
});

describe("R16 first-correction relief", () => {
  beforeEach(() => resetCorrectionReliefForTests());
  it("plays once per session and only for a correction", () => {
    expect(reliefForDecision("accept")).toBeNull();
    const beats = reliefForDecision("override");
    expect(beats?.map((b) => b.mood)).toEqual(["Kaget", "Malu", "Senang"]);
    expect(beats).toBe(FIRST_CORRECTION_RELIEF);
    expect(reliefForDecision("correct")).toBeNull();
    expect(takeFirstCorrectionRelief()).toBeNull();
  });
});

describe("R16 pointing with a wing keeps wings attached", () => {
  let engine: MomoEngine | null = null;
  afterEach(() => { engine?.destroy(); engine = null; });
  it("both sides, with fog", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    engine = new MomoEngine(host);
    engine.setFog(0.9);
    const step = (engine as unknown as { step(dt: number): void }).step.bind(engine);
    const gsap = (await import("gsap")).default;
    for (const side of ["left", "right"] as const) {
      engine.point(side);
      for (let i = 0; i < 120; i++) {
        gsap.updateRoot(gsap.ticker.time + 0.016 * (i + 1));
        step(0.016);
        for (const w of ["L", "R"] as WingSide[]) {
          const m = /matrix\(([^)]+)\)/.exec(host.querySelector(".f" + w)!.getAttribute("transform")!)![1]!.trim().split(/\s+/).map(Number);
          const { a, b } = WING_GEOMETRY[w];
          for (const p of [a, b]) {
            const qx = m[0]! * p[0] + m[2]! * p[1] + m[4]!, qy = m[1]! * p[0] + m[3]! * p[1] + m[5]!;
            expect(Math.hypot(qx - p[0], qy - p[1])).toBeLessThan(1e-3);
          }
        }
      }
    }
    expect(Number(host.querySelector(".fog")!.getAttribute("opacity"))).toBeGreaterThan(0.5);
  });
});

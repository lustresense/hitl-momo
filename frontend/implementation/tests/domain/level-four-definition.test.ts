import { describe, expect, it } from "vitest";
import { FINAL_LEVEL_STAGE, LEVELS, getLevel, providerVocabulary } from "@/src/domain/levels";
import { resolveBehavior } from "@/src/domain/behavior-resolver";

const [L1, L2, L3, L4] = LEVELS as [(typeof LEVELS)[number], (typeof LEVELS)[number], (typeof LEVELS)[number], (typeof LEVELS)[number]];

describe("Bab 4 Pembuktian: level definition", () => {
  it("is the fourth and last level, after the three existing ones", () => {
    expect(LEVELS.map((level) => level.stage)).toEqual([1, 2, 3, 4]);
    expect(FINAL_LEVEL_STAGE).toBe(4);
    expect(getLevel("stage-4-proof")?.stage).toBe(4);
    expect(L4.title).toBe("Bab 4 · Pembuktian");
  });

  it("uses only labels that levels 1-3 already teach, so the model needs no new label", () => {
    const earlier = new Set(LEVELS.slice(0, 3).flatMap((level) => providerVocabulary(level)));
    for (const label of providerVocabulary(L4)) expect(earlier.has(label), label).toBe(true);
  });

  it("keeps the behaviour each label already has in an earlier level", () => {
    for (const [label, behavior] of Object.entries(L4.behaviorMap)) {
      const earlier = LEVELS.slice(0, 3).find((level) => level.behaviorMap[label] !== undefined);
      expect(earlier?.behaviorMap[label], label).toBe(behavior);
    }
  });

  it("has a trap: a danger label and a solid label are both on offer", () => {
    expect(resolveBehavior("tali", L4).behavior).toBe("danger");
    expect(resolveBehavior("papan", L4).behavior).toBe("solid");
    expect(resolveBehavior("ember", L4).behavior).toBe("unresolved");
  });

  it("is harder than level 3: wider gap and three objects needed", () => {
    expect(L4.scene.gapWidth).toBeGreaterThan(L3.scene.gapWidth);
    expect(L4.minDrawings).toBe(3);
    expect(L4.cyclesRequired).toBe(1);
  });

  it("keeps the earlier levels' numbers unchanged", () => {
    expect([L1.minDrawings, L2.minDrawings, L3.minDrawings]).toEqual([2, 2, 2]);
    expect([L1.cyclesRequired, L2.cyclesRequired, L3.cyclesRequired]).toEqual([1, 2, 1]);
  });

  it("summary copy is short Indonesian text for a middle-school reader", () => {
    for (const text of [L4.task, L4.summary.gameplay, L4.summary.literacy]) {
      expect(text.length).toBeGreaterThan(10);
      expect(text.length).toBeLessThanOrEqual(110);
    }
    expect(L4.summary.literacy).toMatch(/persen/i);
  });
});

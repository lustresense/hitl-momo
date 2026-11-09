import { describe, expect, it } from "vitest";
import { LEVELS } from "@/src/domain/levels";
import { buildLevelSummary } from "@/src/app/level-summary";

describe("Bab 4 summary copy", () => {
  it("fills the character name and keeps the literacy line", () => {
    const level = LEVELS[3]!;
    const summary = buildLevelSummary(level, { type: "accept", finalLabel: "papan", sourceRank: 1 }, "Thinman");
    expect(summary.gameplay).toContain("Thinman");
    expect(summary.gameplay).not.toContain("{character}");
    expect(summary.literacy).toBe(level.summary.literacy);
    expect(summary.decision).toBe("Keputusanmu: terima tebakan, label papan.");
  });
});

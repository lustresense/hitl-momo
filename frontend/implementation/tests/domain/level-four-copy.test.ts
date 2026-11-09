import { describe, expect, it } from "vitest";
import { LEVELS } from "@/src/domain/levels";
import { introLines, nudgeLines } from "@/src/domain/world-intro-script";
import { getMissionConfigForLevel } from "@/src/domain/mission-config";
import { momoLevelTone } from "@/src/domain/momo-script";

/** Same limit as momo-script-lines.test.ts (brief e). */
const MAX_LINE = 90;
const L4 = LEVELS[3]!;

describe("Bab 4 Pembuktian: story copy", () => {
  it("intro lines name the character, tell the way to the tower, and stay short", () => {
    const lines = introLines(4, "Thinman");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(MAX_LINE);
    const text = lines.join(" ");
    expect(text).toContain("Thinman");
    expect(text).toContain("menara");
  });

  it("intro teaches checking, not trusting a percentage, and never names the flag", () => {
    const text = introLines(4, "Thinman").join(" ");
    expect(text).toMatch(/persen/i);
    expect(text).not.toMatch(/bendera/i);
  });

  it("nudge asks a question, never orders, and keeps every line within 90 characters", () => {
    const lines = nudgeLines(4, "Thinman");
    for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(MAX_LINE);
    const text = lines.join(" ");
    expect(text).toMatch(/\?/);
    expect(text).not.toMatch(/jangan|harus gambar|\(|\)/i);
    expect(text).toContain("Thinman");
  });

  it("an out-of-range stage still falls back to the Bab 1 copy", () => {
    expect(introLines(0, "Thinman")).toEqual(introLines(1, "Thinman"));
    expect(introLines(5, "Thinman")).toEqual(introLines(1, "Thinman"));
    expect(nudgeLines(9, "Thinman")).toEqual(nudgeLines(1, "Thinman"));
  });
});

describe("Bab 4 Pembuktian: mission card", () => {
  it("uses Bab 4 wording with the character name and the three solid objects only", () => {
    const config = getMissionConfigForLevel(L4, "Thinman");
    expect(config.stage).toBe(4);
    expect(config.title).toBe("Bantu Thinman sampai ke menara!");
    expect(config.instruction).toContain("Thinman");
    expect(config.instruction).toMatch(/cek akibat/i);
    expect(config.examples.map((e) => e.labelId)).toEqual(["papan", "balok", "tangga"]);
  });
});

describe("Bab 4 Pembuktian: Momo tone", () => {
  it("is humble like Bab 3, and the fog is at least as strong as Bab 3", () => {
    expect(momoLevelTone(4).tone).toBe("humble");
    expect(momoLevelTone(4).fog).toBeGreaterThanOrEqual(momoLevelTone(3).fog);
  });

  it("an out-of-range stage still falls back to the Bab 1 tone", () => {
    expect(momoLevelTone(5)).toEqual(momoLevelTone(1));
  });
});

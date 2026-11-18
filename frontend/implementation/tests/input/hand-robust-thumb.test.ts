import { describe, expect, it } from "vitest";
import {
  THUMB_OPEN_LATERAL,
  classifyHandPose,
  countExtendedFingers,
  thumbDiagnostics,
  thumbLateral,
  withAspect,
  type HandPose,
} from "@/src/input/hand-gesture";
import { MEDIAN_SKELETONS, placeHand, type RealisticClass } from "./realistic-hands";

/**
 * NUI-R17-02 / NUI-R17-04 (REV4): five fingers were not recognised and three fingers read as four.
 * The skeletons are real class medians (see realistic-hands.ts). Evidence class: UNIT_ONLY on real-landmark
 * aggregates. These tests do not prove anything about a physical webcam.
 *
 * The lab rule (experimentalRobust + aspect) is compared with the legacy rule on the SAME frames, so the failure
 * stays reproducible: the legacy thumb ratio reads a tucked thumb as extended (four, three) and the lab rule does not.
 */
const LAB = { experimentalRobust: true, aspect: 16 / 9 } as const;
const isPalmPose = (p: HandPose) => p === "open-palm" || p === "split-palm";
const eraseEligible = (lm: ReturnType<typeof placeHand>, lab: boolean) =>
  isPalmPose(classifyHandPose(lm, lab ? LAB : {})) &&
  countExtendedFingers(lm, lab ? { robustThumb: true, aspect: 16 / 9 } : {}) === 5;

const place = (c: RealisticClass, o: Parameters<typeof placeHand>[1] = {}) => placeHand(MEDIAN_SKELETONS[c], o);

describe("legacy thumb rule: the reproduced failure (kept so the bug cannot return unnoticed)", () => {
  it("a four-finger hand with the thumb tucked is erase-eligible under the legacy rule (false Hapus risk)", () => {
    expect(eraseEligible(place("four"), false)).toBe(true);
  });

  it("a three-finger hand with the thumb tucked on the pinky is NOT read as three fingers under the legacy rule", () => {
    expect(classifyHandPose(place("three"))).not.toBe("three-fingers");
    expect(countExtendedFingers(place("three"))).toBe(4);
  });
});

describe("lab thumb rule on class-median hands, 16:9 camera", () => {
  it("open palm, thumb out: five fingers, erase-eligible", () => {
    const lm = place("palm");
    expect(classifyHandPose(lm, LAB)).toBe("open-palm");
    expect(countExtendedFingers(lm, { robustThumb: true, aspect: 16 / 9 })).toBe(5);
    expect(eraseEligible(lm, true)).toBe(true);
  });

  it("flat palm with the thumb straight along the hand (HaGRID 'stop'): five fingers", () => {
    expect(eraseEligible(place("stop"), true)).toBe(true);
  });

  it("four fingers with the thumb tucked is NOT erase-eligible (count 4)", () => {
    const lm = place("four");
    expect(countExtendedFingers(lm, { robustThumb: true, aspect: 16 / 9 })).toBe(4);
    expect(eraseEligible(lm, true)).toBe(false);
  });

  it("three fingers with the thumb tucked on the pinky is three fingers, count 3", () => {
    const lm = place("three");
    expect(classifyHandPose(lm, LAB)).toBe("three-fingers");
    expect(countExtendedFingers(lm, { robustThumb: true, aspect: 16 / 9 })).toBe(3);
  });

  it("index and middle with the thumb OUT is two fingers, not three", () => {
    expect(classifyHandPose(place("three2"), LAB)).toBe("two-fingers");
  });

  it("one finger with the thumb tucked is one finger", () => {
    expect(classifyHandPose(place("one"), LAB)).toBe("one-finger");
  });

  it("two fingers together and a V sign are two fingers", () => {
    expect(classifyHandPose(place("two_up"), LAB)).toBe("two-fingers");
    expect(classifyHandPose(place("peace"), LAB)).toBe("two-fingers");
  });

  it("a fist is never erase-eligible and never a command pose", () => {
    const lm = place("fist");
    expect(eraseEligible(lm, true)).toBe(false);
    expect(["fist", "none", "thumb-up"]).toContain(classifyHandPose(lm, LAB));
  });

  it("an L shape (thumb and index spread) is no drawing pose and not erase-eligible", () => {
    const lm = place("thumb_index");
    expect(eraseEligible(lm, true)).toBe(false);
    expect(classifyHandPose(lm, LAB)).not.toBe("pinch");
  });
});

describe("the lab rule holds when the hand is turned, mirrored, small or on a 4:3 camera", () => {
  const cases: Array<[string, { rollDeg?: number; mirror?: boolean; span?: number; aspect: number }]> = [
    ["rolled 25 degrees", { rollDeg: 25, aspect: 16 / 9 }],
    ["rolled -35 degrees", { rollDeg: -35, aspect: 16 / 9 }],
    ["the other hand (mirrored)", { mirror: true, aspect: 16 / 9 }],
    ["small in the frame (far from the camera)", { span: 0.12, aspect: 16 / 9 }],
    ["on a 4:3 camera", { aspect: 4 / 3 }],
  ];
  for (const [label, o] of cases) {
    const lab = { experimentalRobust: true as const, aspect: o.aspect };
    const count = (lm: ReturnType<typeof placeHand>) => countExtendedFingers(lm, { robustThumb: true, aspect: o.aspect });
    it(`open palm ${label}: five fingers`, () => {
      const lm = placeHand(MEDIAN_SKELETONS.palm, o);
      expect(count(lm)).toBe(5);
      expect(isPalmPose(classifyHandPose(lm, lab))).toBe(true);
    });
    it(`four fingers ${label}: still four, no erase`, () => {
      const lm = placeHand(MEDIAN_SKELETONS.four, o);
      expect(count(lm)).toBe(4);
    });
    it(`three fingers ${label}: still three fingers`, () => {
      const lm = placeHand(MEDIAN_SKELETONS.three, o);
      expect(classifyHandPose(lm, lab)).toBe("three-fingers");
    });
  }
});

describe("thumb diagnostics are exact and do not invent a confidence", () => {
  it("publishes the legacy ratio, the lateral coordinate and the IP angle for the same frame", () => {
    const d = thumbDiagnostics(place("four"), 16 / 9)!;
    expect(d.legacyExtended).toBe(true); // the legacy misread, shown honestly
    expect(d.robustOpen).toBe(false);
    expect(d.lateral!).toBeLessThan(THUMB_OPEN_LATERAL);
    expect(d.ipAngleDeg).toBeGreaterThan(90);
    const open = thumbDiagnostics(place("palm"), 16 / 9)!;
    expect(open.robustOpen).toBe(true);
    expect(open.lateral!).toBeGreaterThan(THUMB_OPEN_LATERAL);
  });

  it("returns null for short or broken landmark lists", () => {
    expect(thumbDiagnostics(undefined)).toBeNull();
    expect(thumbDiagnostics(place("palm").slice(0, 10))).toBeNull();
    expect(thumbLateral([])).toBeNull();
  });

  it("withAspect scales x only and never mutates its input", () => {
    const lm = place("palm");
    const before = JSON.stringify(lm);
    const scaled = withAspect(lm, 2);
    expect(JSON.stringify(lm)).toBe(before);
    expect(scaled[5]!.x).toBeCloseTo(lm[5]!.x * 2, 9);
    expect(scaled[5]!.y).toBe(lm[5]!.y);
    expect(withAspect(lm, 1)).toBe(lm);
  });
});

describe("regression: the game keeps the legacy classifier (no aspect, no robust thumb)", () => {
  it("classifyHandPose without options is unchanged by the lab geometry", () => {
    // Same frame, same result as before this change: the lab path is strictly opt-in.
    expect(classifyHandPose(place("palm"))).toBe("open-palm");
    expect(classifyHandPose(place("fist"))).not.toBe("open-palm");
  });
});

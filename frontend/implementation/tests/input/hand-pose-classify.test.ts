import { describe, expect, it } from "vitest";
import {
  classifyHandPose,
  isFist,
  isSplitPalm,
  isThumbUp,
  palmCenterNormalized,
} from "@/src/input/hand-gesture";
import { makeHand } from "./hand-fixtures";

describe("pinch is read before fist (a thumb touching a folded index is ink, not erase)", () => {
  it("thumb touching a folded index with the other fingers folded is a pinch, not a fist", () => {
    // Bug: the old order checked fist first, so this drawing hand erased.
    const lm = makeHand({ ratios: [0.5, 0.5, 0.5, 0.5], thumbTip: { x: 0.444, y: 0.7625 } });
    expect(classifyHandPose(lm)).toBe("pinch");
    expect(isFist(lm)).toBe(false);
  });

  it("a real fist with the thumb tucked 0.25 span from the folded index stays a fist", () => {
    const lm = makeHand({ ratios: [0.5, 0.5, 0.5, 0.5], thumbTip: { x: 0.49, y: 0.7625 } });
    expect(classifyHandPose(lm)).toBe("fist");
    expect(isFist(lm)).toBe(true);
  });

  it("one straight index with a far thumb and folded fingers is no pose", () => {
    expect(classifyHandPose(makeHand({ ratios: [1.5, 0.5, 0.5, 0.5] }))).toBe("none");
  });
});

describe("half-bent fingers count for Mundur (two fingers) and Maju (split palm)", () => {
  it("a half-bent index (ratio 1.05) with a straight middle finger is two fingers", () => {
    // Bug: the old rule needed the index to be above 1.15 times its PIP distance.
    expect(classifyHandPose(makeHand({ ratios: [1.05, 1.5, 0.5, 0.5] }))).toBe("two-fingers");
  });

  it("a half-bent ring finger (ratio 1.05) still counts as folded for two fingers", () => {
    expect(classifyHandPose(makeHand({ ratios: [1.5, 1.5, 1.05, 0.5] }))).toBe("two-fingers");
  });

  it("a split palm whose middle-ring gap is 0.30 of the span is still a split palm", () => {
    // Bug: the old rule needed the middle-ring gap to be 0.35 of the span.
    const lm = makeHand({ ratios: [1.5, 1.5, 1.5, 1.5], tipX: [0.44, 0.45, 0.51, 0.52] });
    expect(classifyHandPose(lm)).toBe("split-palm");
    expect(isSplitPalm(lm)).toBe(true);
  });

  it("a fully open palm with equal finger gaps is an open palm, not a split palm", () => {
    expect(classifyHandPose(makeHand({ ratios: [1.5, 1.5, 1.5, 1.5] }))).toBe("open-palm");
  });

  it("a relaxed hand with every finger half-bent is no pose", () => {
    expect(classifyHandPose(makeHand({ ratios: [1, 1, 1, 1] }))).toBe("none");
  });
});

describe("thumb-up is never a fist (it must not erase)", () => {
  it("a raised thumb (lift 0.35) over folded fingers is no pose, not a fist", () => {
    // Bug: a thumb that is up but not up enough for thumb-up read as a fist and erased.
    const lm = makeHand({
      ratios: [0.5, 0.5, 0.5, 0.5],
      thumbMcp: { x: 0.36, y: 0.7 },
      thumbTip: { x: 0.36, y: 0.63 },
    });
    expect(isThumbUp(lm)).toBe(false);
    expect(classifyHandPose(lm)).toBe("none");
  });

  it("a clearly raised thumb over folded fingers is the thumb-up pose", () => {
    const lm = makeHand({
      ratios: [0.5, 0.5, 0.5, 0.5],
      thumbMcp: { x: 0.36, y: 0.7 },
      thumbTip: { x: 0.36, y: 0.5 },
    });
    expect(classifyHandPose(lm)).toBe("thumb-up");
  });
});

describe("pinch hysteresis: enter below 0.42 of the span, stay until 0.55", () => {
  // Thumb 0.096 to the right of a straight index tip: a gap of 0.48 of the 0.2 span.
  const gap048 = makeHand({ ratios: [1.5, 0.5, 0.5, 0.5], thumbTip: { x: 0.536, y: 0.454 } });
  // Gap 0.12 = 0.6 of the span: clearly released.
  const gap060 = makeHand({ ratios: [1.5, 0.5, 0.5, 0.5], thumbTip: { x: 0.56, y: 0.454 } });

  it("a pinch already held stays a pinch at a 0.48 span gap", () => {
    // Bug: the old rule ignored the held state and dropped the ink at 0.42.
    expect(classifyHandPose(gap048, { pinchHeld: true })).toBe("pinch");
  });

  it("a 0.48 span gap does not start a pinch", () => {
    expect(classifyHandPose(gap048, { pinchHeld: false })).toBe("none");
  });

  it("a held pinch releases at a 0.6 span gap", () => {
    expect(classifyHandPose(gap060, { pinchHeld: true })).toBe("none");
  });
});

describe("palm centre is the eraser point", () => {
  it("is the centre of the knuckles, mirrored like the cursor, not the fingertip", () => {
    // Knuckle columns 0.44, 0.50, 0.56, 0.62 average 0.53; the frame is mirrored (1 - x).
    const p = palmCenterNormalized(makeHand({ ratios: [0.5, 0.5, 0.5, 0.5] }));
    expect(p.x).toBeCloseTo(0.47, 6);
    expect(p.y).toBeCloseTo(0.7, 6);
  });
});

describe("a bent index that stays pinched keeps its ink (hysteresis for a folded index)", () => {
  // Folded index tip at (0.44, 0.7625); thumb 0.036 to its right = 0.18 of the 0.2 span.
  const loose = makeHand({ ratios: [0.5, 0.5, 0.5, 0.5], thumbTip: { x: 0.476, y: 0.7625 } });

  it("a pinch already held stays a pinch at a 0.18 span gap", () => {
    // Bug: a loose thumb released the pinch, and the same folded hand then read as a fist and erased.
    expect(classifyHandPose(loose, { pinchHeld: true })).toBe("pinch");
  });

  it("the same gap does not start a pinch: it is still a fist", () => {
    expect(classifyHandPose(loose, { pinchHeld: false })).toBe("fist");
  });
});

import { describe, expect, it } from "vitest";
import { arbiterStep, createArbiterState, type ArbiterEvent, type ArbiterState } from "@/src/input/arbiter";
import { handDirections } from "@/src/components/game/game-directions";

const NOW = 1000;

function apply(state: ArbiterState, event: ArbiterEvent): ArbiterState {
  return arbiterStep(state, event, NOW).state;
}

/** Gameplay with the hand enabled and one fresh, tracked hand frame. */
function withHand(
  input: { left?: boolean; right?: boolean; jump?: boolean },
  base: ArbiterState = apply(createArbiterState("gameplay"), { type: "set-hand-enabled", enabled: true }),
): ArbiterState {
  return apply(base, {
    type: "hand-frame",
    frame: {
      tracked: true,
      cursor: { x: 0.5, y: 0.5 },
      pinched: Boolean(input.jump),
      input: { left: Boolean(input.left), right: Boolean(input.right), jump: Boolean(input.jump) },
    },
  });
}

describe("handDirections: which on-screen buttons the hand is lighting", () => {
  it("hand on the student's left side lights only Kiri", () => {
    expect(handDirections(withHand({ left: true }))).toEqual(["left"]);
  });

  it("hand on the student's right side lights only Kanan", () => {
    expect(handDirections(withHand({ right: true }))).toEqual(["right"]);
  });

  it("pinch (hand jump) lights Lompat", () => {
    expect(handDirections(withHand({ jump: true }))).toEqual(["jump"]);
  });

  it("neutral hand lights nothing, so the highlight clears when Thinman stops", () => {
    expect(handDirections(withHand({}))).toEqual([]);
  });

  it("a held keyboard/button direction overrides the hand's left/right, so the hand must not light it", () => {
    const withKey = apply(withHand({ left: true }), { type: "key", dir: "right", down: true });
    expect(handDirections(withKey)).toEqual([]);
  });

  it("a held keyboard jump does not stop the hand's left from lighting Kiri", () => {
    const withKey = apply(withHand({ left: true }), { type: "key", dir: "jump", down: true });
    expect(handDirections(withKey)).toEqual(["left"]);
  });

  it("lost hand lights nothing at once", () => {
    const lost = apply(withHand({ left: true }), {
      type: "hand-frame",
      frame: { tracked: false, cursor: null, pinched: false, input: { left: false, right: false, jump: false } },
    });
    expect(handDirections(lost)).toEqual([]);
  });

  it("outside gameplay (placing) the hand lights no movement button", () => {
    const placing = apply(createArbiterState("placing"), { type: "set-hand-enabled", enabled: true });
    expect(handDirections(placing)).toEqual([]);
  });

  it("with the hand disabled (fallback mode) nothing is lit", () => {
    const off = apply(withHand({ left: true }), { type: "set-hand-enabled", enabled: false });
    expect(handDirections(off)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { arbiterOutput, arbiterStep, createArbiterState, type ArbiterState } from "@/src/input/arbiter";
import { GameplayGestureFilter } from "@/src/input/gameplay-gesture";
import { pointingHand } from "./gameplay-fixtures";

/**
 * Steering rule checked on synthetic 21-point hands through the same two stages the UI uses:
 * GameplayGestureFilter (driver rules) -> InputArbiter (UI rules) -> DirectionInput.
 */

interface Run {
  filter: GameplayGestureFilter;
  state: ArbiterState;
  t: number;
}

function gameplayRun(enableJump: boolean): Run {
  const state = arbiterStep(createArbiterState("gameplay"), { type: "set-hand-enabled", enabled: true }, 0).state;
  return { filter: new GameplayGestureFilter({ enableJump }), state, t: 0 };
}

type Lm = ReturnType<typeof pointingHand> | undefined;

/** One camera frame (`undefined` = no hand). Returns the DirectionInput Thinman gets. */
function frame(run: Run, landmarks: Lm) {
  run.t += 33;
  const sample = run.filter.update(landmarks, run.t);
  run.state = arbiterStep(run.state, { type: "hand-frame", frame: sample }, run.t).state;
  const out = arbiterOutput(run.state);
  return { left: out.left, right: out.right, jump: out.jump };
}

function frames(run: Run, landmarks: Lm, n: number) {
  let last = { left: false, right: false, jump: false };
  for (let i = 0; i < n; i++) last = frame(run, landmarks);
  return last;
}

describe("gameplay hand mapping: finger angle -> DirectionInput", () => {
  it("finger pointing to the student's left -> left only", () => {
    const run = gameplayRun(true);
    expect(frames(run, pointingHand(170), 5)).toEqual({ left: true, right: false, jump: false });
  });

  it("finger pointing to the student's right -> right only", () => {
    const run = gameplayRun(true);
    expect(frames(run, pointingHand(10), 5)).toEqual({ left: false, right: true, jump: false });
  });

  it("finger pointing down -> stop (no left, no right, no jump)", () => {
    const run = gameplayRun(true);
    expect(frames(run, pointingHand(-90), 5)).toEqual({ left: false, right: false, jump: false });
  });

  it("finger straight up -> jump on the spot, no walk", () => {
    const run = gameplayRun(true);
    expect(frames(run, pointingHand(90), 5)).toEqual({ left: false, right: false, jump: true });
  });

  it("finger up and to the right -> jump and walk right together", () => {
    const run = gameplayRun(true);
    expect(frames(run, pointingHand(60), 6)).toEqual({ left: false, right: true, jump: true });
  });

  it("hand lost -> neutral at once, even right after walking left", () => {
    const run = gameplayRun(true);
    frames(run, pointingHand(170), 5);
    expect(frame(run, undefined)).toEqual({ left: false, right: false, jump: false });
  });

  it("a pinch alone never jumps when jump is not enabled (placing uses the pinch to grab)", () => {
    const run = gameplayRun(false);
    expect(frames(run, pointingHand(-60, { pinchGap: 0.2 }), 8).jump).toBe(false);
  });
});

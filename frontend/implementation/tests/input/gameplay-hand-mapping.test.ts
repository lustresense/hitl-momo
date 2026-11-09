import { describe, expect, it } from "vitest";
import { arbiterOutput, arbiterStep, createArbiterState, type ArbiterState } from "@/src/input/arbiter";
import { GameplayGestureFilter } from "@/src/input/gameplay-gesture";
import type { Landmark } from "@/src/input/types";

/**
 * Provisional gameplay mapping, checked on synthetic 21-point hands through the same two stages
 * the UI uses: GameplayGestureFilter (driver rules) -> InputArbiter (UI rules) -> DirectionInput.
 */

/** `side` = where the index fingertip sits on the student's screen (0 far left, 1 far right). */
function hand(side: number, pinchGap = 1): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  lm[0] = { x: 0.5, y: 0.9 };
  lm[9] = { x: 0.5, y: 0.7 };
  lm[8] = { x: 1 - side, y: 0.4 };
  lm[4] = { x: 1 - side - pinchGap * 0.2, y: 0.4 };
  return lm;
}

interface Run {
  filter: GameplayGestureFilter;
  state: ArbiterState;
  t: number;
}

function gameplayRun(enableJump: boolean): Run {
  const state = arbiterStep(createArbiterState("gameplay"), { type: "set-hand-enabled", enabled: true }, 0).state;
  return { filter: new GameplayGestureFilter({ enableJump }), state, t: 0 };
}

/** One camera frame (`undefined` = no hand). Returns the DirectionInput Thinman gets. */
function frame(run: Run, landmarks: Landmark[] | undefined) {
  run.t += 33;
  const sample = run.filter.update(landmarks, run.t);
  run.state = arbiterStep(run.state, { type: "hand-frame", frame: sample }, run.t).state;
  const out = arbiterOutput(run.state);
  return { left: out.left, right: out.right, jump: out.jump };
}

function frames(run: Run, landmarks: Landmark[] | undefined, n: number) {
  let last = { left: false, right: false, jump: false };
  for (let i = 0; i < n; i++) last = frame(run, landmarks);
  return last;
}

describe("gameplay hand mapping: hand -> DirectionInput", () => {
  it("finger on the student's left side -> left only", () => {
    const run = gameplayRun(true);
    expect(frames(run, hand(0.2), 5)).toEqual({ left: true, right: false, jump: false });
  });

  it("finger on the student's right side -> right only", () => {
    const run = gameplayRun(true);
    expect(frames(run, hand(0.8), 5)).toEqual({ left: false, right: true, jump: false });
  });

  it("finger in the middle third -> stop (no left, no right, no jump)", () => {
    const run = gameplayRun(true);
    expect(frames(run, hand(0.5), 5)).toEqual({ left: false, right: false, jump: false });
  });

  it("hand lost -> neutral at once, even right after walking left", () => {
    const run = gameplayRun(true);
    frames(run, hand(0.2), 5);
    expect(frame(run, undefined)).toEqual({ left: false, right: false, jump: false });
  });

  it("held pinch with jump enabled -> jump; it can combine with a direction", () => {
    const run = gameplayRun(true);
    expect(frames(run, hand(0.8, 0.2), 6)).toEqual({ left: false, right: true, jump: true });
  });

  it("jump stays off when the driver is not told to enable it (placing uses the pinch to grab)", () => {
    const run = gameplayRun(false);
    expect(frames(run, hand(0.5, 0.2), 8).jump).toBe(false);
  });
});

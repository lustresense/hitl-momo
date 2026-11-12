import { describe, expect, it } from "vitest";
import {
  arbiterStep,
  createArbiterState,
  type ArbiterEffect,
  type ArbiterEvent,
  type ArbiterState,
  type HandSample,
  type Phase,
} from "@/src/input/arbiter";

/**
 * Intent gating (REVISI §18C): only a PINCH may start or extend a hand drag. A frame carries no
 * pose, only `pinched`; thumb-up, open palm, one and three fingers all arrive as `pinched: false`,
 * so none of them may start a stroke or grab an object, not even while the pose is changing.
 */
function run(phase: Phase, frames: HandSample[]): { state: ArbiterState; effects: ArbiterEffect[] } {
  let state = createArbiterState(phase);
  let now = 0;
  const effects: ArbiterEffect[] = [];
  state = arbiterStep(state, { type: "set-hand-enabled", enabled: true }, now).state;
  for (const frame of frames) {
    now += 16;
    const r = arbiterStep(state, { type: "hand-frame", frame } as ArbiterEvent, now);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

const at = (x: number, y: number, pinched: boolean): HandSample => ({
  tracked: true,
  cursor: { x, y },
  pinched,
  input: { left: false, right: false, jump: false },
});

describe("arbiter intent gating: only a pinch starts a drag", () => {
  for (const phase of ["drawing", "placing"] as const) {
    it(`${phase}: a hand that is not pinching never begins or moves a drag`, () => {
      const frames = [at(0.2, 0.2, false), at(0.3, 0.3, false), at(0.4, 0.4, false)];
      const { state, effects } = run(phase, frames);
      expect(effects).toEqual([]);
      expect(state.dragOwner).toBeNull();
    });

    it(`${phase}: a pinch begins a drag, and dropping the pinch ends it`, () => {
      const { state, effects } = run(phase, [at(0.2, 0.2, true), at(0.3, 0.3, true), at(0.3, 0.3, false)]);
      expect(effects.map((e) => e.type)).toEqual(["drag-begin", "drag-move", "drag-end"]);
      expect(state.dragOwner).toBeNull();
    });
  }

  it("a thumb-up that follows a pinch does not extend the drag", () => {
    const { effects } = run("placing", [at(0.2, 0.2, true), at(0.5, 0.5, false), at(0.6, 0.6, false)]);
    expect(effects.filter((e) => e.type === "drag-move")).toEqual([]);
    expect(effects.at(-1)).toEqual({ type: "drag-end", source: "hand", reason: "release" });
  });
});

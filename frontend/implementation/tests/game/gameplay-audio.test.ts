// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  DistanceStepper,
  GameplayAudioObserver,
  HARD_LAND_SPEED,
  MIN_LAND_SPEED,
  createRefusalEdge,
  outcomeSoundFor,
  walkFrameIndex,
} from "@/src/game/runtime/gameplay-audio";
import { silenceKaplayAudio } from "@/src/game/runtime/engine";

function observer() {
  const emit = vi.fn();
  return { emit, obs: new GameplayAudioObserver(emit) };
}
const air = (vy: number) => ({ grounded: false, vy, frameId: vy < 0 ? "RISE" : "FALL" });
const ground = (frameId = "STAND") => ({ grounded: true, vy: 0, frameId });

describe("GameplayAudioObserver landings", () => {
  it("treats the first sample after a reset as a baseline, not a landing", () => {
    const { emit, obs } = observer();
    obs.step(air(0));
    obs.step(air(60));
    obs.step(ground()); // spawn settles onto the floor
    expect(emit).not.toHaveBeenCalled();
  });

  it("plays a soft landing after an ordinary jump and a hard one after a long drop", () => {
    const { emit, obs } = observer();
    obs.step(ground());
    obs.step(air(-300));
    obs.step(air(520));
    obs.step(ground());
    expect(emit).toHaveBeenLastCalledWith("thinman.land", { variant: 0 });
    obs.step(air(300));
    obs.step(air(HARD_LAND_SPEED + 40));
    obs.step(ground());
    expect(emit).toHaveBeenLastCalledWith("thinman.land", { variant: 1 });
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it("ignores tiny hops and grounded flicker below the minimum landing speed", () => {
    const { emit, obs } = observer();
    obs.step(ground());
    obs.step(air(MIN_LAND_SPEED - 1));
    obs.step(ground());
    expect(emit).not.toHaveBeenCalled();
  });

  it("starts clean after reset (retry / re-created body)", () => {
    const { emit, obs } = observer();
    obs.step(ground());
    obs.step(air(700));
    obs.reset();
    obs.step(ground());
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("GameplayAudioObserver footsteps", () => {
  it("steps on walk-frame contact edges only (frames 0 and 4), once per frame change", () => {
    const { emit, obs } = observer();
    obs.step(ground("STAND"));
    for (const f of ["WALK_0", "WALK_0", "WALK_1", "WALK_2", "WALK_3", "WALK_4", "WALK_4", "WALK_5"]) obs.step(ground(f));
    expect(emit.mock.calls.filter(([id]) => id === "thinman.step")).toHaveLength(2);
  });

  it("is silent while standing, airborne or in the LAND keyframe, and re-arms after stopping", () => {
    const { emit, obs } = observer();
    obs.step(ground("STAND"));
    obs.step(ground("STAND"));
    obs.step(air(-200));
    obs.step({ grounded: false, vy: 0, frameId: "WALK_0" });
    obs.step(ground("LAND"));
    expect(emit.mock.calls.filter(([id]) => id === "thinman.step")).toHaveLength(0);
    obs.step(ground("WALK_0"));
    obs.step(ground("STAND"));
    obs.step(ground("WALK_0"));
    expect(emit.mock.calls.filter(([id]) => id === "thinman.step")).toHaveLength(2);
  });
});

describe("helpers", () => {
  it("parses walk frame ids", () => {
    expect(walkFrameIndex("WALK_3")).toBe(3);
    expect(walkFrameIndex("STAND")).toBeNull();
    expect(walkFrameIndex("WALK_x")).toBeNull();
  });

  it("maps each reported cause to its result sound", () => {
    expect(outcomeSoundFor("hazard")).toBe("hazard.hit");
    expect(outcomeSoundFor("abyss")).toBe("fall.abyss");
    expect(outcomeSoundFor("goal")).toBe("goal.reach");
  });

  it("DistanceStepper paces footfalls by travel and ignores standing still", () => {
    const s = new DistanceStepper(27);
    expect(s.advance(0)).toBe(false);
    expect(s.advance(Number.NaN)).toBe(false);
    expect(s.advance(20)).toBe(false);
    expect(s.advance(10)).toBe(true); // 30 >= 27, 3 carried over
    expect(s.advance(20)).toBe(false); // 23
    expect(s.advance(5)).toBe(true); // 28
  });

  it("refusal edge fires on the first refused move of a streak, then only after a free move and the gap", () => {
    const edge = createRefusalEdge(600);
    expect(edge(false, 0)).toBe(false);
    expect(edge(true, 100)).toBe(true);
    expect(edge(true, 200)).toBe(false); // same streak (dragging along the wall)
    expect(edge(true, 5000)).toBe(false); // still the same streak
    expect(edge(false, 5100)).toBe(false);
    expect(edge(true, 5200)).toBe(true); // new streak, far past the gap
  });

  it("refusal edge honours the min gap between streaks", () => {
    const edge = createRefusalEdge(600);
    expect(edge(true, 1000)).toBe(true);
    expect(edge(false, 1100)).toBe(false);
    expect(edge(true, 1200)).toBe(false); // 200 ms after the last sound
    expect(edge(false, 1300)).toBe(false);
    expect(edge(true, 1700)).toBe(true);
  });
});

describe("silenceKaplayAudio", () => {
  it("closes KAPLAY's own AudioContext exactly once and never throws", async () => {
    const close = vi.fn(() => Promise.resolve());
    silenceKaplayAudio({ audioCtx: { state: "running", close } }, 0);
    expect(close).toHaveBeenCalledTimes(1);

    const closed = vi.fn();
    silenceKaplayAudio({ audioCtx: { state: "closed", close: closed } }, 0);
    expect(closed).not.toHaveBeenCalled();

    expect(() => silenceKaplayAudio({}, 0)).not.toThrow();
    expect(() => silenceKaplayAudio({ audioCtx: { state: "running", close: () => { throw new Error("boom"); } } }, 0)).not.toThrow();
    const rejects = vi.fn(() => Promise.reject(new Error("already closed")));
    silenceKaplayAudio({ audioCtx: { state: "running", close: rejects } }, 0);
    await Promise.resolve();
    expect(rejects).toHaveBeenCalledTimes(1);
  });

  it("defers the close so KAPLAY's startup decode can finish", () => {
    vi.useFakeTimers();
    try {
      const close = vi.fn(() => Promise.resolve());
      silenceKaplayAudio({ audioCtx: { state: "running", close } });
      expect(close).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2000);
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

import { NuiEngine, type InputSample, type Rect } from "@/src/nui/core";

export const rect = (left: number, top: number, right: number, bottom: number): Rect => ({
  left,
  top,
  right,
  bottom,
});

export interface EngineHarness {
  engine: NuiEngine;
  sample: (p?: Partial<InputSample>) => InputSample;
  advance: (ms: number, step?: number) => void;
  setNow: (t: number) => void;
  getNow: () => number;
}

export function makeHarness(startMs = 1000): EngineHarness {
  let now = startMs;
  const engine = new NuiEngine(() => now);
  const sample = (p: Partial<InputSample> = {}): InputSample => ({
    t: now,
    x: 0,
    y: 0,
    inFrame: true,
    pinch: false,
    pinchStrength: p.pinch ? 1 : 0,
    source: "mouse",
    ...p,
  });
  const advance = (ms: number, step = 50): void => {
    let rem = ms;
    while (rem > 0) {
      const d = Math.min(step, rem);
      now += d;
      engine.tick(now);
      rem -= d;
    }
  };
  return {
    engine,
    sample,
    advance,
    setNow: (t) => {
      now = t;
    },
    getNow: () => now,
  };
}

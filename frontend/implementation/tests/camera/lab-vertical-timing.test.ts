import { describe, expect, it } from "vitest";
import { WaveLabSampler } from "@/src/components/nui-lab/lab-metrics";

describe("NUI Lab vertical-wave timing", () => {
  it("timestamps first movement on Y alone, not only X", () => {
    const sampler = new WaveLabSampler();
    const ys = [0.35, 0.52, 0.35, 0.53, 0.35, 0.53, 0.35];
    ys.forEach((y, i) => sampler.feed({ x: 0.5, y }, i * 100, { handSize: 0.2 }));
    expect(sampler.detected).toBe(true);
    expect(sampler.movedAtMs).toBe(100);
    expect(sampler.elapsedMs).not.toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { isThumbUp } from "@/src/input/hand-gesture";
import type { Landmark } from "@/src/input/types";
import { getInputMode, reportCameraUnavailable, reportTrackerFailed, resetInputModeForTest, subscribeInputMode } from "@/src/input/input-mode";
import { resetSharedStreamForTest, setSharedStream } from "@/src/camera/shared-stream";

/** Upright fist at wrist (0.5,0.8), hand span 0.2. */
function fist(): Landmark[] {
  const h: Landmark[] = new Array(21).fill(null).map(() => ({ x: 0.5, y: 0.6 }));
  h[0] = { x: 0.5, y: 0.8 };
  h[9] = { x: 0.5, y: 0.6 };
  // fingers: PIP out at y 0.58, tips curled back to y 0.68
  for (const [pip, tip, x] of [[6, 8, 0.45], [10, 12, 0.5], [14, 16, 0.55], [18, 20, 0.6]] as const) {
    h[pip] = { x, y: 0.58 };
    h[tip] = { x, y: 0.68 };
  }
  h[2] = { x: 0.4, y: 0.65 }; // thumb MCP
  h[4] = { x: 0.4, y: 0.65 }; // thumb tip tucked
  return h;
}

describe("isThumbUp (R4)", () => {
  it("thumb raised over a fist = thumbs-up", () => {
    const h = fist();
    h[4] = { x: 0.4, y: 0.45 };
    expect(isThumbUp(h)).toBe(true);
  });
  it("plain fist is not", () => {
    expect(isThumbUp(fist())).toBe(false);
  });
  it("open palm with thumb up is not (fingers extended)", () => {
    const h = fist();
    h[4] = { x: 0.4, y: 0.45 };
    for (const tip of [8, 12, 16, 20]) h[tip] = { x: h[tip]!.x, y: 0.4 };
    expect(isThumbUp(h)).toBe(false);
  });
  it("thumb pointing down is not", () => {
    const h = fist();
    h[4] = { x: 0.4, y: 0.85 };
    expect(isThumbUp(h)).toBe(false);
  });
  it("missing or short landmark list is not", () => {
    expect(isThumbUp(undefined)).toBe(false);
    expect(isThumbUp(fist().slice(0, 10))).toBe(false);
  });
});

describe("input mode (R13)", () => {
  it("camera by default, fallback on failure, back to camera when a stream returns", () => {
    resetInputModeForTest();
    resetSharedStreamForTest();
    const seen: string[] = [];
    const off = subscribeInputMode((m) => seen.push(m));
    expect(getInputMode()).toBe("camera");
    reportCameraUnavailable();
    expect(getInputMode()).toBe("fallback");
    setSharedStream({} as MediaStream);
    expect(getInputMode()).toBe("camera");
    reportTrackerFailed(true);
    expect(getInputMode()).toBe("fallback");
    reportTrackerFailed(false);
    expect(seen).toEqual(["camera", "fallback", "camera", "fallback", "camera"]);
    off();
  });
});

import { describe, expect, it } from "vitest";
import {
  END_GROUND_AT,
  END_GROUND_Y,
  END_THINMAN_HEIGHT_RATIO,
  computeEndCameraFit,
  computeEndCameraTx,
  screenPxToUnits,
  stepEndCameraTx,
  unitsToScreenPx,
  worldPercentX,
  worldPercentY,
} from "@/src/features/ending/end-camera";
import {
  GROUND_LUT,
  GROUND_LUT_MAX_X,
  GROUND_LUT_MIN_X,
  PARACHUTE_START_X,
  POND_X,
  TALK_SPOT_X,
  createInitialWalkerState,
  hasEnteredPond,
  sampleGroundY,
  stepEndWalker,
  type EndWalkerState,
} from "@/src/features/ending/end-walker";

describe("end-camera (21% screen-height zoom)", () => {
  it("scales world so Thinman height is at least 21% of screen height", () => {
    const viewportW = 1280;
    const viewportH = 720;
    const worldW = 1280;
    const worldH = 720; // 16:9 full width
    const heroHeightPx = worldW * 0.056; // 71.68 px unscaled
    const fit = computeEndCameraFit({ viewportW, viewportH, worldW, worldH, heroHeightPx });

    const renderedThinmanH = fit.scale * heroHeightPx;
    expect(renderedThinmanH / viewportH).toBeCloseTo(END_THINMAN_HEIGHT_RATIO, 4);
    expect(fit.scale).toBeCloseTo((0.21 * 720) / heroHeightPx, 4);
    expect(fit.ty).toBeLessThanOrEqual(0);
    expect(fit.ty).toBeGreaterThanOrEqual(viewportH - fit.scale * worldH);
  });

  it("handles zero/unmeasured dimensions safely without NaN", () => {
    expect(computeEndCameraFit({ viewportW: 0, viewportH: 0, worldW: 0, worldH: 0 })).toEqual({
      scale: 1,
      tx: 0,
      ty: 0,
    });
    expect(screenPxToUnits(100, 0, 0)).toBe(0);
  });

  it("maps units <-> screen px and lerps tx smoothly", () => {
    const tx = computeEndCameraTx(TALK_SPOT_X, 0.42, { viewportW: 1280, worldW: 1280, scale: 2.1 });
    expect(tx).toBeLessThanOrEqual(0);
    expect(stepEndCameraTx(0, -100)).toBeCloseTo(-12, 6);
    expect(stepEndCameraTx(-99.8, -100)).toBe(-99.8); // within 0.4px eps

    const px = unitsToScreenPx(490, 1000, 2);
    expect(px).toBe(2000);
    expect(screenPxToUnits(1000, 0, px)).toBeCloseTo(245, 4);
    expect(worldPercentX(245)).toBeCloseTo(50, 4);
    expect(worldPercentY(END_GROUND_Y)).toBeGreaterThan(70);
    expect(END_GROUND_AT).toBe(0.72);
  });
});

describe("end-walker (1-unit ground LUT, kolam-only joystick, pond trigger, auto-walk)", () => {
  it("precomputes a 511-entry 1-unit LUT matching M-10 262Q120 236 245 250T500 246 (+4)", () => {
    expect(GROUND_LUT.length).toBe(GROUND_LUT_MAX_X - GROUND_LUT_MIN_X + 1);
    expect(sampleGroundY(-10)).toBeCloseTo(266, 2);
    expect(sampleGroundY(245)).toBeCloseTo(254, 2);
    expect(sampleGroundY(500)).toBeCloseTo(250, 2);
    // Mid-interpolation smoothly between LUT entries
    const mid = sampleGroundY(160.5);
    expect(mid).toBeGreaterThan(240);
    expect(mid).toBeLessThan(260);
    // Clamps outside [-10, 500]
    expect(sampleGroundY(-100)).toBeCloseTo(sampleGroundY(-10), 6);
    expect(sampleGroundY(900)).toBeCloseTo(sampleGroundY(500), 6);
  });

  it("allows joystick movement ONLY when joystickAllowed=true (kolam phase) and detects pond entry", () => {
    let w = createInitialWalkerState(PARACHUTE_START_X);

    // Outside kolam: joystick input is ignored completely
    const blocked = stepEndWalker(w, { joystickAllowed: false, padDir: 1, right: true }, 0.05);
    expect(blocked.state.x).toBe(PARACHUTE_START_X);
    expect(blocked.state.vx).toBe(0);

    // Inside kolam: padDir = 1 moves right at 62 units/s (capped at dt=0.05)
    w = blocked.state;
    const moved = stepEndWalker(w, { joystickAllowed: true, padDir: 1 }, 0.05);
    expect(moved.state.x).toBeCloseTo(PARACHUTE_START_X + 62 * 0.05, 4);
    expect(moved.state.face).toBe(1);
    expect(moved.enteredPond).toBe(false);

    // Walk until reaching pond trigger (x >= 410 - 46 = 364)
    w = moved.state;
    for (let i = 0; i < 80 && !hasEnteredPond(w.x); i++) {
      w = stepEndWalker(w, { joystickAllowed: true, padDir: 1 }, 0.05).state;
    }
    expect(w.x).toBeGreaterThanOrEqual(POND_X - 46);
    expect(hasEnteredPond(w.x)).toBe(true);
  });

  it("auto-walks cleanly to TALK_SPOT_X (300) at 150 units/s and ignores manual joystick", () => {
    let w: EndWalkerState = { ...createInitialWalkerState(320), autoTargetX: TALK_SPOT_X };
    let arrived = false;
    for (let i = 0; i < 20; i++) {
      // Even if joystick pushes right, autoTargetX walks left to 300
      const res = stepEndWalker(w, { joystickAllowed: false, padDir: 1 }, 0.05);
      w = res.state;
      if (res.arrivedAuto) {
        arrived = true;
        break;
      }
    }
    expect(arrived).toBe(true);
    expect(w.autoTargetX).toBeNull();
    expect(Math.abs(w.x - TALK_SPOT_X)).toBeLessThanOrEqual(2);
    expect(w.face).toBe(-1);
  });
});

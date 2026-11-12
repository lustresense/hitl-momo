import { describe, expect, it } from "vitest";
import {
  indexPointAngle,
  steerFromAngle,
  steerInput,
  STEER_HYSTERESIS_DEG,
  type SteerZone,
} from "@/src/input/gameplay-gesture";
import { pointingHand } from "./gameplay-fixtures";

describe("indexPointAngle: direction of the index finger, base to tip, mirrored", () => {
  it.each([0, 30, 60, 90, 120, -90])("reads %d degrees back from the synthetic hand", (deg) => {
    expect(indexPointAngle(pointingHand(deg))).toBeCloseTo(deg, 6);
  });

  it("the mirror is applied once: a finger the camera sees on its left (raw x < 0.5) is the student's right", () => {
    const lm = pointingHand(0);
    expect(lm[8]!.x).toBeLessThan(0.5);
    expect(indexPointAngle(lm)).toBeCloseTo(0, 6);
  });

  it("returns null when the finger has no direction (tip on the knuckle) or a landmark is NaN", () => {
    const flat = pointingHand(90);
    flat[8] = { ...flat[5]! };
    expect(indexPointAngle(flat)).toBeNull();
    const broken = pointingHand(90);
    broken[5] = { x: Number.NaN, y: 0.6 };
    expect(indexPointAngle(broken)).toBeNull();
  });
});

describe("steerFromAngle: angle to the zone the student is asking for", () => {
  const cases: Array<[number, SteerZone]> = [
    [0, "walk-right"],
    [20, "walk-right"],
    [29.9, "walk-right"],
    [-20, "walk-right"],
    [30, "stop"],
    [40, "stop"],
    [44, "stop"],
    [45, "jump-right"],
    [60, "jump-right"],
    [74.9, "jump-right"],
    [75, "jump"],
    [90, "jump"],
    [105, "jump"],
    [105.1, "jump-left"],
    [120, "jump-left"],
    [135, "jump-left"],
    [140, "stop"],
    [150, "stop"],
    [150.1, "walk-left"],
    [170, "walk-left"],
    [-170, "walk-left"],
    [-90, "stop"],
  ];
  it.each(cases)("%d degrees is %s", (theta, zone) => {
    expect(steerFromAngle(theta)).toBe(zone);
  });
});

describe("steerFromAngle: hysteresis keeps the last zone near a boundary", () => {
  it("the constant is a few degrees, not a dead band", () => {
    expect(STEER_HYSTERESIS_DEG).toBeGreaterThan(0);
    expect(STEER_HYSTERESIS_DEG).toBeLessThanOrEqual(8);
  });

  it("walking right stays walking right a little past 30 degrees, and stops after that", () => {
    expect(steerFromAngle(33, "walk-right")).toBe("walk-right");
    expect(steerFromAngle(36, "walk-right")).toBe("stop");
    // and entering the walk again needs the plain boundary
    expect(steerFromAngle(33, "stop")).toBe("stop");
  });

  it("a jump-right just past 75 degrees is not yet a straight jump", () => {
    expect(steerFromAngle(77, "jump-right")).toBe("jump-right");
    expect(steerFromAngle(77, "jump")).toBe("jump");
    expect(steerFromAngle(77, null)).toBe("jump");
  });

  it("a straight jump just under 75 degrees stays a straight jump", () => {
    expect(steerFromAngle(72, "jump")).toBe("jump");
    expect(steerFromAngle(72, null)).toBe("jump-right");
  });

  it("a straight jump just past 105 degrees stays straight until the left band is clear", () => {
    expect(steerFromAngle(102, "jump")).toBe("jump");
    expect(steerFromAngle(111, "jump")).toBe("jump-left");
  });

  it("walking left stays walking left a little inside 150 degrees", () => {
    expect(steerFromAngle(147, "walk-left")).toBe("walk-left");
    expect(steerFromAngle(147, "stop")).toBe("stop");
  });
});

describe("steerInput: zone to the left / right / jump input", () => {
  it.each<[SteerZone, { left: boolean; right: boolean; jump: boolean }]>([
    ["walk-right", { left: false, right: true, jump: false }],
    ["walk-left", { left: true, right: false, jump: false }],
    ["jump", { left: false, right: false, jump: true }],
    ["jump-right", { left: false, right: true, jump: true }],
    ["jump-left", { left: true, right: false, jump: true }],
    ["stop", { left: false, right: false, jump: false }],
  ])("%s", (zone, input) => {
    expect(steerInput(zone)).toEqual(input);
  });
});

/**
 * Pins the headless body model to KAPLAY's per-step order. The solid-building walks depend on it:
 * a jump or a fall-off that the model times one step early would move every contact by a few px.
 */
import { describe, expect, it } from "vitest";
import { StageBody, type Input } from "./kaplay-body-model";
import { JUMP_FORCE } from "../../src/game/runtime/constants";

const NONE: Input = { left: false, right: false, jump: false };
const RIGHT: Input = { left: false, right: true, jump: false };
const JUMP: Input = { left: false, right: false, jump: true };
/** A 100 px wide floor whose top is at y = 100. */
const floor = [{ x: 0, y: 100, w: 100, h: 50 }];

describe("KAPLAY fixed-step order in the headless body model", () => {
  it("a jump only sets the velocity; the body moves up on the next fixed step", () => {
    const body = new StageBody({ x: 20, y: 60 }, floor);
    for (let i = 0; i < 60; i++) body.step(NONE);
    expect(body.grounded).toBe(true);
    const restY = body.y;

    body.step(JUMP);
    expect(body.vy, "player.jump() replaces the velocity in the scene callback").toBe(-JUMP_FORCE);
    expect(body.y, "body.fixedUpdate ran before the scene callback, so no movement yet").toBeCloseTo(restY, 6);

    body.step(NONE);
    expect(body.y, "next step: gravity (+32) then move by (-520 + 32) / 50").toBeCloseTo(restY - 9.76, 6);
  });

  it("stays grounded for one fixed step after the last contact (KAPLAY willFall), then falls", () => {
    const body = new StageBody({ x: 99, y: 60 }, floor);
    for (let i = 0; i < 60; i++) body.step(NONE);
    expect(body.grounded).toBe(true);

    // Walking right takes the body past the floor's edge (x 100) within one step.
    const flags = [1, 2, 3].map(() => {
      body.step(RIGHT);
      return body.grounded;
    });
    expect(flags).toEqual([true, true, false]);
  });
});

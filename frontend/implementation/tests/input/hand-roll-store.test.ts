import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publishHandRoll, resetHandRollForTest, subscribeHandRoll } from "@/src/input/hand-roll-store";

beforeEach(() => resetHandRollForTest());
afterEach(() => resetHandRollForTest());

describe("hand roll store: a listener hears the roll now and each real change, not the jitter", () => {
  it("tells a new listener the current roll at once", () => {
    publishHandRoll(12);
    const heard: (number | null)[] = [];
    const off = subscribeHandRoll((r) => heard.push(r));
    expect(heard).toEqual([12]);
    off();
  });

  it("ignores a move smaller than the epsilon, and reports a real move", () => {
    const heard: (number | null)[] = [];
    const off = subscribeHandRoll((r) => heard.push(r));
    publishHandRoll(30);
    publishHandRoll(30.2);
    publishHandRoll(29.8);
    publishHandRoll(31);
    expect(heard).toEqual([null, 30, 31]);
    off();
  });

  it("reports the loss of the hand (null) and stops after unsubscribe", () => {
    const heard: (number | null)[] = [];
    const off = subscribeHandRoll((r) => heard.push(r));
    publishHandRoll(5);
    publishHandRoll(null);
    off();
    publishHandRoll(80);
    expect(heard).toEqual([null, 5, null]);
  });
});

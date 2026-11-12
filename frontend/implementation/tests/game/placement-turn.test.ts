import { describe, expect, it } from "vitest";
import { beginTurn, isPalmPose, readTurn, TURN_LOST_MS, type TurnReading } from "@/src/components/game/placement-gesture";

const palm = (roll: number | null): TurnReading => ({ palm: true, thumbUp: false, roll });
const lost = (roll: number | null = null): TurnReading => ({ palm: false, thumbUp: false, roll });

describe("turn mode: the palm starts it, the roll turns, the thumb or a lost palm ends it", () => {
  it("open and split palms both count as the palm", () => {
    expect(isPalmPose("open-palm")).toBe(true);
    expect(isPalmPose("split-palm")).toBe(true);
    expect(isPalmPose("pinch")).toBe(false);
    expect(isPalmPose("none")).toBe(false);
  });

  it("the roll at the start is the anchor: a still palm never turns", () => {
    let s = beginTurn(30);
    for (let t = 0; t < 2000; t += 16) {
      const r = readTurn(s, palm(30), t);
      expect(r.turn).toBe(0);
      expect(r.done).toBe(false);
      s = r.state;
    }
  });

  it("a clockwise roll of 50 degrees from the start asks for one clockwise quarter turn", () => {
    const r = readTurn(beginTurn(0), palm(50), 0);
    expect(r.turn).toBe(1);
    expect(r.done).toBe(false);
  });

  it("a counter-clockwise roll asks for a counter-clockwise quarter turn", () => {
    expect(readTurn(beginTurn(0), palm(-50), 0).turn).toBe(-1);
  });

  it("a palm that starts with no roll reading takes the first reading as its anchor", () => {
    const first = readTurn(beginTurn(null), palm(20), 0);
    expect(first.turn).toBe(0);
    expect(readTurn(first.state, palm(70), 16).turn).toBe(1);
  });

  it("the thumbs-up ends the turn at once", () => {
    const r = readTurn(beginTurn(0), { palm: false, thumbUp: true, roll: null }, 0);
    expect(r.done).toBe(true);
  });

  it("a palm that is gone for less than 400 ms keeps the turn; for 400 ms it ends", () => {
    let s = beginTurn(0);
    s = readTurn(s, lost(), 1000).state;
    expect(readTurn(s, lost(), 1000 + TURN_LOST_MS - 1).done).toBe(false);
    expect(readTurn(s, lost(), 1000 + TURN_LOST_MS).done).toBe(true);
  });

  it("a palm that comes back clears the gap, so the clock starts again on the next loss", () => {
    let s = beginTurn(0);
    s = readTurn(s, lost(), 1000).state;
    s = readTurn(s, palm(0), 1300).state;
    s = readTurn(s, lost(), 1350).state;
    expect(readTurn(s, lost(), 1350 + TURN_LOST_MS - 1).done).toBe(false);
  });

  it("the anchor moves with each step, so one turn per 45 degrees of roll and no double count", () => {
    let s = beginTurn(0);
    const turns: number[] = [];
    for (const roll of [20, 50, 50, 60, 95, 95]) {
      const r = readTurn(s, palm(roll), 0);
      turns.push(r.turn);
      s = r.state;
    }
    expect(turns).toEqual([0, 1, 0, 0, 1, 0]);
  });
});

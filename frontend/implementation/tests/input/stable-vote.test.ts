import { describe, expect, it } from "vitest";
import { StableVote } from "@/src/input/hand-gesture";

describe("StableVote (3 of the last 5 frames)", () => {
  it("starts at the initial value and keeps it until a value wins three votes", () => {
    const v = new StableVote<string>("none");
    expect(v.value).toBe("none");
    expect(v.push("pinch")).toBe("none");
    expect(v.push("pinch")).toBe("none");
    expect(v.push("pinch")).toBe("pinch");
  });

  it("one noisy frame does not flip a stable value", () => {
    const v = new StableVote<string>("none");
    for (let i = 0; i < 4; i++) v.push("fist");
    expect(v.push("pinch")).toBe("fist");
    expect(v.push("fist")).toBe("fist");
  });

  it("drops votes older than the window", () => {
    const v = new StableVote<string>("none");
    v.push("a");
    v.push("a");
    v.push("a");
    for (let i = 0; i < 5; i++) v.push("b");
    expect(v.value).toBe("b");
  });

  it("reset returns to the initial value and forgets the votes", () => {
    const v = new StableVote<number>(0);
    for (let i = 0; i < 5; i++) v.push(3);
    v.reset();
    expect(v.value).toBe(0);
    expect(v.push(3)).toBe(0);
  });
});

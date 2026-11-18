import { describe, expect, it } from "vitest";
import { LEVELS } from "@/src/domain/levels";
import { LOCKED_LEVEL_NOTICE, expectedLevelPath, resolveAppRoute } from "@/src/app/route-guard";

describe("resolveAppRoute", () => {
  it("opens Bab 1 for a direct /level1 load", () => {
    expect(resolveAppRoute("/level1")).toEqual({ kind: "level", level: LEVELS[0] });
  });

  it.each(["/level2", "/level3"])("rejects locked direct route %s", (path) => {
    expect(resolveAppRoute(path)).toEqual({ kind: "levels", notice: LOCKED_LEVEL_NOTICE });
  });

  it("allows level 2 only after level 1 completion", () => {
    expect(resolveAppRoute("/level2", (stage) => stage === 1 || stage === 2)).toEqual({
      kind: "level",
      level: LEVELS[1],
    });
  });

  it("resolves the direct student number route", () => {
    expect(resolveAppRoute("/onboarding/number")).toEqual({ kind: "number" });
  });

  it("maps the chapter menu route", () => {
    expect(resolveAppRoute("/levels")).toEqual({ kind: "levels", notice: null });
  });

  it("maps direct tutorial card route", () => {
    expect(resolveAppRoute("/onboarding/card")).toEqual({ kind: "tutorial" });
  });

  it("maps direct camera cover route", () => {
    expect(resolveAppRoute("/onboarding/cam")).toEqual({ kind: "camera" });
  });
});

describe("canvas routes (one per level, sky view)", () => {
  it("opens the canvas of an unlocked level", () => {
    expect(resolveAppRoute("/canvas1")).toEqual({ kind: "canvas", level: LEVELS[0] });
  });

  it("sends a locked canvas to the level list with the locked notice", () => {
    expect(resolveAppRoute("/canvas2")).toEqual({ kind: "levels", notice: LOCKED_LEVEL_NOTICE });
  });

  it("sends unknown canvases (only three levels exist) to the level list without a notice", () => {
    expect(resolveAppRoute("/canvas4")).toEqual({ kind: "levels", notice: null });
    expect(resolveAppRoute("/canvas")).toEqual({ kind: "camera" });
  });

  it("maps the sky while drawing and the ground otherwise", () => {
    expect(expectedLevelPath(1, "drawing", false)).toBe("/canvas1");
    expect(expectedLevelPath(1, "evaluating", false)).toBe("/canvas1");
    expect(expectedLevelPath(1, "drawing", true)).toBe("/level1");
    expect(expectedLevelPath(1, "falling", false)).toBe("/level1");
    expect(expectedLevelPath(2, "gameplay", false)).toBe("/level2");
  });
});

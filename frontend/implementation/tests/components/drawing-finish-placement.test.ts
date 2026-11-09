import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Paths are relative to the implementation folder, where vitest runs.
const finishCss = readFileSync(resolve(process.cwd(), "src/components/drawing/drawing-finish.css"), "utf8");
const cameraCss = readFileSync(resolve(process.cwd(), "app/styles/60-global-camera.css"), "utf8");

/** Left-anchored px offsets in a stylesheet: `left: 20px` etc. */
const leftPx = (src: string) => [...src.matchAll(/(?:^|[;{\s])left:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));

describe("finish thumb placement (2026-11-09 E2E: the global camera card covers it)", () => {
  it("the global camera card is fixed in the bottom-left corner on every post-cover route", () => {
    // Guard for the premise: if the camera card moves, this test must be revisited.
    expect(cameraCss).toMatch(/position:\s*fixed\s*!important;[\s\S]*?bottom:\s*24px\s*!important;\s*left:\s*24px\s*!important;/);
  });

  it("the finish thumb is not anchored to the left edge (it would sit under the camera card)", () => {
    expect(leftPx(finishCss)).toEqual([]);
  });
});

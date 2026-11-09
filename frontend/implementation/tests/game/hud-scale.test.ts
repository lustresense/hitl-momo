import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../app/styles/97-kit-screens.css", import.meta.url), "utf8");
const px = (selector: string, prop: string) => {
  const rule = css.split("\n").find((l) => l.trim().startsWith(`${selector} {`));
  const m = rule?.match(new RegExp(`${prop}:\\s*([\\d.]+)px`));
  return m ? Number(m[1]) : NaN;
};

describe("R8.3 secondary HUD is smaller in the world; Gambar lagi keeps its size", () => {
  it("world plate title, decision chip and status chip shrink below the base kit sizes", () => {
    expect(px("#screen-gameplay .hud-plate__title", "font-size")).toBeLessThan(px(".hud-plate__title", "font-size"));
    expect(px("#screen-gameplay .hud-plate .decision-chip", "font-size")).toBeLessThan(px(".hud-plate .decision-chip", "font-size"));
    expect(px("#screen-gameplay .stage-input-status-chip", "font-size")).toBeLessThan(12);
    expect(px("#screen-gameplay .hud-plate__mark", "width")).toBeLessThan(px(".hud-plate__mark", "width"));
  });
  it("never targets the draw-again button", () => {
    expect(css).not.toMatch(/btn-draw-again/);
  });
});

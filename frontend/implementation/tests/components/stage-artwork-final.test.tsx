import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StageArtworkFinal } from "@/src/components/stage-preview/StageArtworkFinal";
import { getFinalStageGeometry } from "@/src/game/stage-geometry-final";
import { sourceToPhysics } from "@/src/game/stage-transform";
import type { StageGeometry } from "@/src/game/stage-geometry";

afterEach(() => cleanup());

describe("Bab 4 artwork matches its colliders", () => {
  it("is a 490x325 image labelled as the Pembuktian scene", () => {
    const { container, getByRole } = render(<StageArtworkFinal gameplay />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 490 325");
    expect(getByRole("img").getAttribute("aria-label")).toBe("Pembuktian");
  });

  it("draws each platform and the spike pit at the physics position of its collider", () => {
    const { container } = render(<StageArtworkFinal />);
    const g = getFinalStageGeometry();
    const geometryCast = g as unknown as StageGeometry;
    const drawn = [...container.querySelectorAll("[data-collider]")];
    expect(drawn.map((n) => n.getAttribute("data-collider")).sort()).toEqual(g.platforms.map((p) => p.id).sort());
    for (const node of drawn) {
      const id = node.getAttribute("data-collider")!;
      const collider = g.platforms.find((p) => p.id === id)!;
      const topLeft = sourceToPhysics({ x: Number(node.getAttribute("x")), y: Number(node.getAttribute("y")) }, geometryCast);
      expect(topLeft.x).toBeCloseTo(collider.x, 0);
      expect(topLeft.y).toBeCloseTo(collider.y, 0);
      expect(Number(node.getAttribute("width")) * (800 / 490)).toBeCloseTo(collider.w, 0);
    }
    const pit = container.querySelector("[data-hazard]")!;
    expect(pit.getAttribute("data-hazard")).toBe(g.hazards[0]!.id);
    const topLeft = sourceToPhysics({ x: Number(pit.querySelector("rect")!.getAttribute("x")), y: Number(pit.querySelector("rect")!.getAttribute("y")) }, geometryCast);
    expect(topLeft.y).toBeCloseTo(g.hazards[0]!.y, 0);
  });

  it("shows the goal flag and the character only outside gameplay", () => {
    const preview = render(<StageArtworkFinal />);
    expect(preview.container.querySelector('[data-asset-role="character-preview"]')).not.toBeNull();
    expect(preview.container.querySelector('[data-asset-role="goal-preview"]')).not.toBeNull();
    cleanup();
    const play = render(<StageArtworkFinal gameplay />);
    expect(play.container.querySelector('[data-asset-role="character-preview"]')).toBeNull();
  });
});

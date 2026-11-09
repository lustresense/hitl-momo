import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Icon, ICON_NAMES, isGestureIcon } from "@/src/components/ui/Icon";

const DIR = "../../contexts/can/design/visual/drawing-gestures/"; // monorepo layout: Can design/ lives in contexts/can/design/
const MAP = { "hand-draw": "pinch", "hand-erase": "kepal", "hand-undo": "dua-jari", "hand-redo": "telapak-terbelah" } as const;

describe("R12 gesture icons from the Owner's Figma", () => {
  afterEach(cleanup);
  for (const [name, file] of Object.entries(MAP)) {
    it(`${name} renders ${file}.svg artwork`, () => {
      const { container } = render(<Icon name={name as keyof typeof MAP} title="x" />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("data-gesture")).toBe(file);
      const source = readFileSync(`${DIR}${file}.svg`, "utf8");
      expect(svg.getAttribute("viewBox")).toBe(/viewBox="([^"]+)"/.exec(source)![1]);
      const srcPaths = [...source.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
      const paths = [...svg.querySelectorAll("path")].map((p) => p.getAttribute("d"));
      expect(paths).toEqual(srcPaths);
      expect(svg.querySelector('path[fill="currentColor"]')).toBeTruthy();
    });
  }
  it("gesture names stay in the icon catalogue; others keep the line style", () => {
    for (const n of Object.keys(MAP)) expect(ICON_NAMES).toContain(n);
    expect(isGestureIcon("pencil")).toBe(false);
    const { container } = render(<Icon name="pencil" />);
    expect(container.querySelector("svg")!.getAttribute("viewBox")).toBe("0 0 24 24");
  });
});

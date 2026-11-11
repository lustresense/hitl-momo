import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Static checks on the bubble CSS (no browser in this sandbox, so these read the real files). They pin the brief's
 * size and contrast rules to the token values the app really uses.
 */
const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const chatCss = () => read("src/components/momo/MomoChat.css");
const kit = () => read("app/styles/96-kit-base.css");

function token(name: string): string {
  const match = kit().match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token ${name} not found`);
  return match[1]!;
}
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
/** Colour of a translucent layer (alpha) over a background, as the browser composites it. */
function over(hex: string, alpha: number, bg: string): string {
  const f = (i: number) => {
    const fg = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    const back = parseInt(bg.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(alpha * fg + (1 - alpha) * back).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(1)}${f(2)}`;
}

describe("Momo bubble text size (brief g)", () => {
  it("the bubble text is at least 16 px with a selector that beats the older 15 px and phone 13 px rules", () => {
    expect(chatCss()).toMatch(/\.momo-chat \.momo-chat__bubble\.momo-chat__bubble\s*\{[^}]*font-size:\s*16px/);
  });

  it("the world win bubble keeps its larger 17 px size", () => {
    expect(chatCss()).toMatch(/\.world-win \.momo-chat \.momo-chat__bubble\.momo-chat__bubble\s*\{[^}]*font-size:\s*17px/);
  });
});

describe("Momo bubble contrast (brief g)", () => {
  it("dark ink on the bubble colour is at least 4.5:1", () => {
    expect(contrast(token("--nb-ink"), token("--nb-leaf-soft"))).toBeGreaterThanOrEqual(4.5);
  });

  it("the thick-fog fade (opacity 0.84) still keeps 4.5:1 over a black or a white page", () => {
    const ink = token("--nb-ink");
    const bubble = token("--nb-leaf-soft");
    for (const page of ["#000000", "#ffffff"]) {
      expect(contrast(over(ink, 0.84, page), over(bubble, 0.84, page)), `page ${page}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("Momo bubble does not cover what lies under it (drawing area, confirm button)", () => {
  it("a bubble is click-through by default, so a finished line never blocks the page under it", () => {
    expect(chatCss()).toMatch(/\.momo-chat \.momo-chat__bubble\s*\{[^}]*pointer-events:\s*none/);
  });

  it("no bubble takes a tap: there is no skip, so no exception to click-through either", () => {
    expect(chatCss()).not.toMatch(/data-skippable/);
    expect(chatCss()).not.toMatch(/pointer-events:\s*auto/);
  });
});

describe("Momo bubble keyboard focus (UI component contrast 3:1)", () => {
  it("the focus ring is the ink colour, which is at least 3:1 on the paper page", () => {
    const ring = chatCss().match(/\.momo-chat__bubble:focus-visible\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(ring).toMatch(/outline:[^;]*var\(--nb-ink/);
    expect(contrast(token("--nb-ink"), token("--nb-paper"))).toBeGreaterThanOrEqual(3);
  });
});

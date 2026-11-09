import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Paths are relative to the implementation folder, where vitest runs.
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const levelNui = read("src/components/level/level-nui.css");
const endingNui = read("src/components/ending/ending-nui.css");
const kit = read("app/styles/96-kit-base.css");

/** The declarations of the rule whose selector is exactly `selector` (one rule per selector in these files). */
function rule(src: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = src.match(new RegExp(`^${esc}\\s*\\{([^}]*)\\}`, "m"));
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1]!;
}

/** A pixel length of `prop` in that rule. */
function px(src: string, selector: string, prop: string): number {
  const m = rule(src, selector).match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([\\d.]+)px`));
  if (!m) throw new Error(`${prop} in px is not set for ${selector}`);
  return Number(m[1]);
}

/** A `--name: #rrggbb` token from the kit. */
function token(name: string): string {
  const m = kit.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m) throw new Error(`token --${name} is not a hex colour`);
  return m[1]!;
}

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const [hi, lo] = [lum(hexA), lum(hexB)].sort((a, b) => b - a);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** The raw value of `prop` in that rule, with a var(--token) resolved to its kit colour. */
function colour(src: string, selector: string, prop: string): string {
  const m = rule(src, selector).match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+);`));
  if (!m) throw new Error(`${prop} is not set in ${selector}`);
  const v = m[1]!.trim().match(/^var\(--([\w-]+)/);
  return v ? token(v[1]!) : m[1]!.trim();
}

describe("level and ending NUI stylesheets exist", () => {
  it("both new stylesheets are on disk next to their components", () => {
    expect(existsSync(resolve(process.cwd(), "src/components/level/level-nui.css"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "src/components/ending/ending-nui.css"))).toBe(true);
  });
});

describe("level and ending NUI colours: text stays readable on its face (WCAG 4.5:1)", () => {
  it("the picked picture card keeps ink text on the kit's leaf tint, not the paper text of the pressed face", () => {
    const face = colour(levelNui, ".level-intro .intro-card.dwell-btn.is-picked", "background");
    const text = colour(levelNui, ".level-intro .intro-card.dwell-btn.is-picked", "color");
    expect(face).toBe(token("nb-leaf-soft"));
    expect(text).toBe(token("nb-ink"));
    expect(contrastRatio(text, face)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("level and ending NUI targets: at least 56 px, gaps at least 12 px", () => {
  it("each picture card of the level intro is at least 56 px high and 84 px wide", () => {
    expect(px(levelNui, ".level-intro .intro-cards .intro-card.dwell-btn", "min-height")).toBeGreaterThanOrEqual(56);
    expect(px(levelNui, ".level-intro .intro-cards .intro-card.dwell-btn", "min-width")).toBeGreaterThanOrEqual(84);
  });

  it("the intro skip is a 60 px square, moved clear of the corner", () => {
    expect(px(levelNui, ".level-intro .intro-skip.dwell-btn", "width")).toBeGreaterThanOrEqual(56);
    expect(px(levelNui, ".level-intro .intro-skip.dwell-btn", "height")).toBeGreaterThanOrEqual(56);
  });

  it("the ending options are at least 56 px tall and keep 12 px between them", () => {
    expect(px(endingNui, ".center-page__options .ending-option.dwell-btn", "min-height")).toBeGreaterThanOrEqual(56);
    expect(px(endingNui, ".center-page__options", "gap")).toBeGreaterThanOrEqual(12);
  });

  it("the dwell ring on a level ribbon is drawn on its pull ring, at least 48 px across", () => {
    expect(px(levelNui, ".bm-ring .bm-dwell", "width")).toBeGreaterThanOrEqual(48);
    expect(px(levelNui, ".bm-ring .bm-dwell", "height")).toBeGreaterThanOrEqual(48);
  });
});

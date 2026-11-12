import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

// Paths are relative to the implementation folder, where vitest runs.
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const kit = read("app/styles/96-kit-base.css");
const gesture = read("app/styles/102-gesture.css");
const dwell = read("src/components/ui/DwellButton.css");
const cursor = read("src/components/ui/HandCursor.css");
const decision = read("src/components/decision/DecisionPanel.css");

/** A `--name: #rrggbb` token from the kit or the gesture stylesheet. */
function token(name: string): string {
  for (const src of [gesture, kit]) {
    const m = src.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
    if (m) return m[1]!;
  }
  throw new Error(`token --${name} is not declared as a hex colour`);
}

/** The body of the rule that starts a line with exactly `selector`. */
function rule(src: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = src.match(new RegExp(`^${esc}\\s*\\{([^}]*)\\}`, "m"));
  if (!m) throw new Error(`no rule starts with ${selector}`);
  return m[1]!;
}

/** A colour or length from `prop` in that rule. var(--token, fallback) resolves to the token's colour. */
function value(src: string, selector: string, prop: string): string {
  const m = rule(src, selector).match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+);`));
  if (!m) throw new Error(`${prop} is not set in ${selector}`);
  const v = m[1]!.trim();
  const tok = v.match(/^var\(--([\w-]+)/);
  return tok ? token(tok[1]!) : v;
}

const PAPER = token("nb-paper");
const INK = token("nb-ink");

describe("Dwell buttons, the candidate stack and the hand cursor: WCAG contrast", () => {
  it("button text is ink on the paper face (4.5:1)", () => {
    expect(value(dwell, ".dwell-btn", "background")).toBe(PAPER);
    expect(value(dwell, ".dwell-btn", "color")).toBe(INK);
    expect(contrastRatio(INK, PAPER)).toBeGreaterThanOrEqual(4.5);
  });

  it("the leaf-tinted primary button keeps ink text at 4.5:1", () => {
    expect(contrastRatio(INK, token("nb-leaf-soft"))).toBeGreaterThanOrEqual(4.5);
  });

  it("a pressed or expanded button inverts to paper on ink (4.5:1)", () => {
    expect(value(dwell, '.dwell-btn[aria-pressed="true"]', "background")).toBe(INK);
    expect(value(dwell, '.dwell-btn[aria-pressed="true"]', "color")).toBe(PAPER);
    expect(contrastRatio(PAPER, INK)).toBeGreaterThanOrEqual(4.5);
  });

  it("the ring track and the green fill are each 3:1 against the paper face", () => {
    expect(contrastRatio(token("nb-ring-track"), PAPER)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(token("nb-ring-fill"), PAPER)).toBeGreaterThanOrEqual(3);
    expect(value(dwell, ".dwell-btn__fill", "stroke")).toBe(token("nb-ring-fill"));
    expect(value(dwell, ".dwell-btn__track", "stroke")).toBe(token("nb-ring-track"));
  });

  it("the rings are at least 5 px thick", () => {
    expect(Number(value(dwell, ".dwell-btn__fill", "stroke-width"))).toBeGreaterThanOrEqual(5);
    expect(Number(value(dwell, ".dwell-btn__track", "stroke-width"))).toBeGreaterThanOrEqual(5);
  });

  it("the confidence bar fill is 3:1 against its white track", () => {
    expect(contrastRatio(token("nb-ring-fill"), "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it("the rank-1 star sticker is ink on orange at 4.5:1", () => {
    expect(contrastRatio(INK, token("nb-orange"))).toBeGreaterThanOrEqual(4.5);
  });

  it("the hand cursor is an ink ring that stands out on a paper page (3:1)", () => {
    expect(value(cursor, ".hand-cursor", "border")).toMatch(/var\(--nb-ink/);
    expect(contrastRatio(INK, "#ffd23f")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(INK, PAPER)).toBeGreaterThanOrEqual(3);
  });

  it("the focus ring is ink on paper (3:1)", () => {
    expect(contrastRatio(token("nb-ring-focus"), PAPER)).toBeGreaterThanOrEqual(3);
    expect(dwell).toMatch(/\.dwell-btn:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--nb-ring-focus/);
  });
});

describe("Dwell targets: size and spacing", () => {
  it("every dwell button is at least 56 px tall", () => {
    expect(Number(value(dwell, ".dwell-btn", "min-height").replace("px", ""))).toBeGreaterThanOrEqual(56);
  });

  it("the decision stack and the override grid keep at least 12 px between targets", () => {
    expect(Number(value(decision, ".nui-decision", "gap").replace("px", ""))).toBeGreaterThanOrEqual(12);
    expect(Number(value(decision, ".nui-decision .top3", "gap").replace("px", ""))).toBeGreaterThanOrEqual(12);
    expect(Number(value(decision, ".nui-choices__grid", "gap").replace("px", ""))).toBeGreaterThanOrEqual(12);
  });
});

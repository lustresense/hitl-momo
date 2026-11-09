import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const [hi, lo] = [lum(hexA), lum(hexB)].sort((a, b) => b - a);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Ink of opacity `a` laid over a solid background: what a dimmed label really looks like. */
function over(fg: string, bg: string, a: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mixed = [0, 1, 2].map((i) => Math.round(a * ch(fg, i) + (1 - a) * ch(bg, i)));
  return "#" + mixed.map((v) => v.toString(16).padStart(2, "0")).join("");
}

// Paths are relative to the implementation folder, where vitest runs (npx vitest run from there).
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const kit = read("app/styles/96-kit-base.css");
const gesture = read("app/styles/102-gesture.css");
const tutorial99 = read("app/styles/99-tutorial.css");
const pinch = read("src/components/ui/PinchRing.css");
const tutorial = read("src/components/onboarding/TutorialBrochure.css");

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

/** Value of `prop` in that rule; a var(--token) is resolved to its hex colour. */
function value(src: string, selector: string, prop: string): string {
  const m = rule(src, selector).match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+);`));
  if (!m) throw new Error(`${prop} is not set in ${selector}`);
  const v = m[1]!.trim();
  const v2 = v.match(/^var\(--([\w-]+)\)$/);
  return v2 ? token(v2[1]!) : v;
}

describe("NUI gesture rings and advance controls: WCAG contrast", () => {
  it("the ring track is visible on the paper face (non-text, 3:1)", () => {
    expect(contrastRatio(token("nb-ring-track"), token("nb-paper"))).toBeGreaterThanOrEqual(3);
  });

  it("the green progress fill is visible on the paper face (3:1)", () => {
    expect(contrastRatio(token("nb-ring-fill"), token("nb-paper"))).toBeGreaterThanOrEqual(3);
  });

  it("the filled arc stands out from the empty track (3:1)", () => {
    expect(contrastRatio(token("nb-ring-fill"), token("nb-ring-track"))).toBeGreaterThanOrEqual(3);
  });

  it("both rings are at least 6 px thick", () => {
    expect(Number(value(gesture, ".thumb-confirm__track", "stroke-width"))).toBeGreaterThanOrEqual(6);
    expect(Number(value(gesture, ".thumb-confirm__fill", "stroke-width"))).toBeGreaterThanOrEqual(6);
    expect(Number(value(pinch, ".pinch-ring__track", "stroke-width"))).toBeGreaterThanOrEqual(6);
    expect(Number(value(pinch, ".pinch-ring__fill", "stroke-width"))).toBeGreaterThanOrEqual(6);
  });

  it("the thumb and pinch glyphs are ink on paper (4.5:1)", () => {
    expect(contrastRatio(token("nb-ink"), token("nb-paper"))).toBeGreaterThanOrEqual(4.5);
    expect(value(gesture, ".thumb-confirm", "color")).toBe(token("nb-ink"));
    expect(value(pinch, ".pinch-ring", "color")).toBe(token("nb-ink"));
  });

  it("the labels sit in their own solid paper pill, ink text (4.5:1)", () => {
    expect(value(gesture, ".thumb-confirm__label", "background")).toBe(token("nb-paper"));
    expect(value(gesture, ".thumb-confirm__label", "color")).toBe(token("nb-ink"));
    expect(value(pinch, ".pinch-ring__label", "background")).toBe(token("nb-paper"));
    expect(value(pinch, ".pinch-ring__label", "color")).toBe(token("nb-ink"));
  });

  it("the holding state inverts the label (paper on ink, 4.5:1) and adds a halo", () => {
    expect(contrastRatio(token("nb-paper"), token("nb-ink"))).toBeGreaterThanOrEqual(4.5);
    expect(gesture).toMatch(/^\.thumb-confirm\.is-holding \.thumb-confirm__label\s*\{[^}]*background:\s*var\(--nb-ink\)/m);
    expect(gesture).toMatch(/^\.thumb-confirm\.is-holding \.thumb-confirm__face\s*\{[^}]*--nb-ring-halo/m);
    expect(pinch).toMatch(/^\.pinch-ring\.is-holding \.pinch-ring__label\s*\{[^}]*background:\s*var\(--nb-ink\)/m);
    expect(pinch).toMatch(/^\.pinch-ring\.is-holding \.pinch-ring__face\s*\{[^}]*--nb-ring-halo/m);
  });

  it("keyboard focus is ink on the paper face (3:1), not the pale sky tone", () => {
    expect(contrastRatio(token("nb-ring-focus"), token("nb-paper"))).toBeGreaterThanOrEqual(3);
    expect(gesture).toMatch(/button\.thumb-confirm:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--nb-ring-focus\)/);
    expect(pinch).toMatch(/button\.pinch-ring:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--nb-ring-focus\)/);
  });

  it("the tutorial's keyboard focus rings are ink, not the pale sky tone (3:1), for skip and practice tools", () => {
    // 99-tutorial.css and the kit set the sky outline (about 1.7:1 on paper); the onboarding stylesheet overrides it.
    for (const sel of [".tut-skip", ".nb-tool"]) {
      expect(tutorial, sel).toMatch(new RegExp(`\\.tutorial-prototype-root ${sel.replace(".", "\\.")}:focus-visible[^{]*\\{[^}]*outline:\\s*3px solid var\\(--nb-ring-focus\\)`));
    }
    expect(contrastRatio(token("nb-ring-focus"), token("nb-paper"))).toBeGreaterThanOrEqual(3);
  });

  it("the gesture line is ink on a paper strip (4.5:1)", () => {
    expect(value(tutorial, ".tut-back .tut-gesture", "background")).toBe(token("nb-paper"));
    expect(value(tutorial, ".tut-back .tut-gesture", "color")).toBe(token("nb-ink"));
  });

  it("the card copy is ink on the leaf card back (4.5:1)", () => {
    expect(value(tutorial99, ".tut-back", "background")).toBe(token("nb-leaf"));
    expect(value(tutorial99, ".tut-back .guide-copy", "color")).toBe(token("nb-ink"));
    expect(contrastRatio(token("nb-ink"), token("nb-leaf"))).toBeGreaterThanOrEqual(4.5);
  });

  it("the locked advance still reads at 4.5:1 on the leaf card back", () => {
    // A locked NUI button is a paper face with an ink label, dimmed as one group over the leaf card back.
    const opacity = Number(value(tutorial, ".tut-back .brochure-cta.brochure-cta--locked", "opacity"));
    const label = over(token("nb-ink"), token("nb-leaf"), opacity);
    const face = over(token("nb-paper"), token("nb-leaf"), opacity);
    expect(contrastRatio(label, face)).toBeGreaterThanOrEqual(4.5);
  });
});

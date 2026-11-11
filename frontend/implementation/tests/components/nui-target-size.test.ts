import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Paths are relative to the implementation folder, where vitest runs.
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const kit = read("app/styles/96-kit-base.css");
const dwell = read("src/components/ui/DwellButton.css");
const nui = read("src/components/ui/nui-actions.css");
const missionModule = read("src/components/mission/MissionBriefing.module.css");

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

describe("NUI placements: targets of at least 56 px and gaps of at least 12 px", () => {
  it("the dwell buttons (fail overlay) are at least 56 px high and wide (base rule)", () => {
    expect(px(dwell, ".dwell-btn", "min-height")).toBeGreaterThanOrEqual(56);
    expect(px(dwell, ".dwell-btn", "min-width")).toBeGreaterThanOrEqual(56);
  });

  it("the icon-only corner buttons (Petunjuk Misi, Keluar Level) are 60 px square", () => {
    expect(px(nui, ".drawing-corner .nb-iconbtn.nui-corner-btn", "width")).toBeGreaterThanOrEqual(56);
    expect(px(nui, ".drawing-corner .nb-iconbtn.nui-corner-btn", "height")).toBeGreaterThanOrEqual(56);
  });

  it("the stage header action and Tebak Gambarku are at least 56 px tall", () => {
    expect(px(nui, ".nb-btn.nui-header-action", "min-height")).toBeGreaterThanOrEqual(56);
    expect(px(nui, ".drawing-submit-controls .nb-btn.nui-submit", "min-height")).toBeGreaterThanOrEqual(56);
  });

  it("the mission close button is 60 px square", () => {
    expect(px(missionModule, ".closeButton", "width")).toBeGreaterThanOrEqual(56);
    expect(px(missionModule, ".closeButton", "height")).toBeGreaterThanOrEqual(56);
  });

  it("the drawing corner and the fail actions keep 12 px between their buttons", () => {
    expect(px(nui, ".drawing-corner.nui-corner", "gap")).toBeGreaterThanOrEqual(12);
    expect(px(nui, ".world-fail__actions.nui-fail-actions", "gap")).toBeGreaterThanOrEqual(12);
  });
});

describe("NUI placements: colour contrast", () => {
  it("ink text on the orange primary fill is 4.5:1 or better", () => {
    // The orange fill rule (.dwell-btn.nui-primary) was dead and is removed; the contrast of the token pair stays checked.
    expect(contrastRatio(token("nb-ink"), token("nb-orange"))).toBeGreaterThanOrEqual(4.5);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LEGACY_GLYPHS,
  LEGACY_GLYPH_NAMES,
  LegacyGlyph,
  OWNER_ICONS,
  OWNER_ICON_NAMES,
  OwnerIcon,
  legacyGlyphSvg,
  ownerIconSvg,
  type OwnerIconName,
} from "@/src/components/ui/owner-icons";

interface SandboxIcons {
  IC: Record<string, string>;
  icon: (name: string, size?: number, label?: string) => string;
}

interface SandboxGlyphs {
  GL: Record<string, string>;
}

function loadSandboxScript<T>(relPath: string): T {
  const src = readFileSync(join(process.cwd(), relPath), "utf8");
  const ctx: Record<string, unknown> = {};
  ctx.window = ctx;
  runInNewContext(src, ctx);
  return ctx.SU as T;
}

const EXPECTED_ORANGE_ICONS: readonly OwnerIconName[] = [
  "gesture-pinch",
  "gesture-pinch-hold",
  "gesture-pinch-drag",
  "gesture-pinch-drag-down",
  "gesture-pinch-tap",
  "gesture-pinch-rotate",
];

describe("owner-icons byte-exact vs proto-html/r83", () => {
  const sandboxIcons = loadSandboxScript<SandboxIcons>("proto-html/r83/shared/icons.js");
  const sandboxGlyphs = loadSandboxScript<SandboxGlyphs>("proto-html/r83/shared/glyphs.js");

  it("39 ikon Owner: jumlah, nama, dan urutan identik dengan shared/icons.js", () => {
    expect(OWNER_ICON_NAMES).toHaveLength(39);
    expect(Object.keys(OWNER_ICONS)).toEqual(Object.keys(sandboxIcons.IC));
    expect(OWNER_ICON_NAMES).toEqual(Object.keys(sandboxIcons.IC));
  });

  it("setiap string SVG 39 ikon identik byte-per-byte dengan shared/icons.js", () => {
    for (const name of OWNER_ICON_NAMES) {
      const actual = OWNER_ICONS[name];
      const expected = sandboxIcons.IC[name] ?? "";
      expect(Buffer.from(actual, "utf8").equals(Buffer.from(expected, "utf8"))).toBe(true);
    }
  });

  it("invarian ikon Owner: viewBox 48, stroke-width 2.6, currentColor, dan aksen #E86435 di 6 ikon sesuai sandbox", () => {
    let exactCount = 0;
    let caseInsensitiveCount = 0;
    const foundOrange: OwnerIconName[] = [];

    for (const name of OWNER_ICON_NAMES) {
      const svg: string = OWNER_ICONS[name];
      expect(svg).toContain('viewBox="0 0 48 48"');
      expect(svg).toContain('stroke-width="2.6"');
      expect(svg).toContain('stroke="currentColor"');

      const exactMatches = svg.match(/#E86435/g)?.length ?? 0;
      const ciMatches = svg.match(/#E86435/gi)?.length ?? 0;
      exactCount += exactMatches;
      caseInsensitiveCount += ciMatches;
      if (ciMatches > 0) foundOrange.push(name);
    }

    expect(exactCount).toBe(6);
    expect(caseInsensitiveCount).toBe(6);
    expect(foundOrange).toEqual(EXPECTED_ORANGE_ICONS);
  });

  it("ownerIconSvg identik dengan SU.icon untuk default, ukuran khusus, dan label", () => {
    for (const name of OWNER_ICON_NAMES) {
      expect(ownerIconSvg(name)).toBe(sandboxIcons.icon(name));
      expect(ownerIconSvg(name, 24)).toBe(sandboxIcons.icon(name, 24));
      expect(ownerIconSvg(name, 40, "x")).toBe(sandboxIcons.icon(name, 40, "x"));
    }
  });

  it("3 legacy glyphs (left, right, close) saja dan identik byte-per-byte dengan shared/glyphs.js", () => {
    expect(LEGACY_GLYPH_NAMES).toEqual(["left", "right", "close"]);
    expect(Object.keys(LEGACY_GLYPHS)).toEqual(["left", "right", "close"]);

    for (const name of LEGACY_GLYPH_NAMES) {
      const actual = LEGACY_GLYPHS[name];
      const expected = sandboxGlyphs.GL[name] ?? "";
      expect(Buffer.from(actual, "utf8").equals(Buffer.from(expected, "utf8"))).toBe(true);
      expect(actual).toContain('viewBox="0 0 24 24"');
      expect(actual).toContain('stroke="currentColor"');
      expect(actual).toContain('aria-hidden="true"');
    }
    expect(LEGACY_GLYPHS.left).toContain('stroke-width="3"');
    expect(LEGACY_GLYPHS.right).toContain('stroke-width="3"');
    expect(LEGACY_GLYPHS.close).toContain('stroke-width="3.4"');
  });

  it("legacyGlyphSvg mengembalikan string byte-exact saat default dan mendukung size serta label", () => {
    for (const name of LEGACY_GLYPH_NAMES) {
      const expected = sandboxGlyphs.GL[name] ?? "";
      expect(legacyGlyphSvg(name)).toBe(expected);

      const sized = legacyGlyphSvg(name, 20);
      expect(sized).toContain('width="20" height="20"');
      expect(sized).toContain('aria-hidden="true"');

      const labeled = legacyGlyphSvg(name, 20, "Tutup");
      expect(labeled).toContain('width="20" height="20"');
      expect(labeled).toContain('role="img" aria-label="Tutup"');
      expect(labeled).not.toContain('aria-hidden="true"');
    }
  });

  it("OwnerIcon dan LegacyGlyph merender markup SVG yang sesuai", () => {
    const ownerHtml = renderToStaticMarkup(createElement(OwnerIcon, { name: "danger", size: 32 }));
    expect(ownerHtml).toContain('viewBox="0 0 48 48"');
    expect(ownerHtml).toContain('width="32"');
    expect(ownerHtml).toContain('height="32"');
    expect(ownerHtml).toContain('aria-hidden="true"');

    const labeledOwnerHtml = renderToStaticMarkup(
      createElement(OwnerIcon, { name: "gesture-pinch", size: 24, label: "Cubit" }),
    );
    expect(labeledOwnerHtml).toContain('role="img"');
    expect(labeledOwnerHtml).toContain('aria-label="Cubit"');
    expect(labeledOwnerHtml).toContain("#E86435");

    const legacyHtml = renderToStaticMarkup(createElement(LegacyGlyph, { name: "left" }));
    expect(legacyHtml).toContain(LEGACY_GLYPHS.left);

    const labeledLegacyHtml = renderToStaticMarkup(
      createElement(LegacyGlyph, { name: "close", size: 18, label: "Bahaya" }),
    );
    expect(labeledLegacyHtml).toContain('width="18"');
    expect(labeledLegacyHtml).toContain('role="img"');
    expect(labeledLegacyHtml).toContain('aria-label="Bahaya"');
  });
});

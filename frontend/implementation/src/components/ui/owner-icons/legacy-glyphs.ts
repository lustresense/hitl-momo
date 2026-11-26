/* Sketchbook Universe: 3 glyph lama 24px dari proto-html/r83/shared/glyphs.js yang masih dipakai r8.3
   (left & right di petunjuk joystick kartu 1, close di badge bahaya kartu 2). Salinan byte-exact; jangan diedit tangan. */
export const LEGACY_GLYPHS = {
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
} as const;

export type LegacyGlyphName = keyof typeof LEGACY_GLYPHS;

export const LEGACY_GLYPH_NAMES: readonly LegacyGlyphName[] = ["left", "right", "close"] as const;

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function legacyGlyphSvg(name: LegacyGlyphName, size?: number, label?: string): string {
  const raw: string | undefined = LEGACY_GLYPHS[name];
  if (!raw) return "";
  let svg = raw;
  if (size !== undefined) {
    svg = svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
  }
  if (label) {
    svg = svg.replace('aria-hidden="true"', `role="img" aria-label="${escapeAttr(label)}"`);
  }
  return svg;
}

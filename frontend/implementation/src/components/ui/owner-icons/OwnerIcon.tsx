"use client";

/**
 * Ikon Owner r8.3 (port 1:1 dari SU.icon di shared/icons.js) dan helper LegacyGlyph (3 glyph 24px r8.3).
 * Ukuran default OwnerIcon 24; tanpa label ikon dekoratif (aria-hidden).
 */
import type { ReactElement } from "react";
import { OWNER_ICONS, type OwnerIconName } from "./owner-icons.data";
import { legacyGlyphSvg, type LegacyGlyphName } from "./legacy-glyphs";

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function ownerIconSvg(name: OwnerIconName, size = 24, label?: string): string {
  const raw: string | undefined = OWNER_ICONS[name];
  if (!raw) return "";
  const aria = label ? `role="img" aria-label="${escapeAttr(label)}"` : 'aria-hidden="true"';
  return raw.replace("<svg ", `<svg width="${size}" height="${size}" ${aria} `);
}

export interface OwnerIconProps {
  name: OwnerIconName;
  size?: number;
  label?: string;
  className?: string;
}

export function OwnerIcon({ name, size = 24, label, className }: OwnerIconProps): ReactElement {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: ownerIconSvg(name, size, label) }}
    />
  );
}

export interface LegacyGlyphProps {
  name: LegacyGlyphName;
  size?: number;
  label?: string;
  className?: string;
}

export function LegacyGlyph({ name, size, label, className }: LegacyGlyphProps): ReactElement {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: legacyGlyphSvg(name, size, label) }}
    />
  );
}

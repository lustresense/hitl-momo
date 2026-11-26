"use client";

import type { ReactNode } from "react";
import type { MissionExampleItem } from "@/src/domain/mission-config";

const P = (d: string, key?: string) => <path key={key ?? d} d={d} />;

/** Ikon goresan sederhana 24x24 untuk objek rekomendasi tiap level (tanpa emoji). */
function ObjectGlyph({ labelId }: { readonly labelId: string }) {
  const key = labelId.trim().toLowerCase();
  let art: ReactNode;
  switch (key) {
    case "tangga":
      art = <>{P("M8 3v18")}{P("M16 3v18")}{P("M8 7h8")}{P("M8 12h8")}{P("M8 17h8")}</>;
      break;
    case "anak tangga":
      art = <>{P("M4 19h5v-5h5v-5h6")}{P("M4 19h16")}</>;
      break;
    case "jembatan":
      art = <>{P("M2 15h20")}{P("M4 15a8 6 0 0 1 16 0")}{P("M6 15v4")}{P("M18 15v4")}{P("M12 9v6")}</>;
      break;
    case "bangku":
      art = <>{P("M4 11h16")}{P("M6 11v8")}{P("M18 11v8")}{P("M6 15h12")}</>;
      break;
    case "meja":
      art = <>{P("M3 8h18v3H3z")}{P("M5 11v9")}{P("M19 11v9")}</>;
      break;
    case "papan luncur":
      art = (
        <>
          {P("M4 13c2 2 14 2 16 0")}
          <circle cx="8" cy="17" r="2" />
          <circle cx="16" cy="17" r="2" />
        </>
      );
      break;
    case "kaktus":
      art = <>{P("M12 4v16")}{P("M12 12H8a2 2 0 0 1-2-2V8")}{P("M12 10h4a2 2 0 0 0 2-2V7")}</>;
      break;
    case "awan":
      art = <>{P("M6 18h11a4 4 0 0 0 .5-7.95A5.5 5.5 0 0 0 7 9a3.5 3.5 0 0 0-1 9Z")}</>;
      break;
    default:
      art = <>{P("M4 18h16")}{P("M6 14l4-6 4 4 4-6")}</>;
      break;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {art}
    </svg>
  );
}

export interface ObjectRecommendationChipsProps {
  readonly items: readonly MissionExampleItem[];
  readonly ariaLabel?: string;
  readonly testId?: string;
}

/** Daftar chip visual rekomendasi benda yang bisa digambar (dipakai di bubble awal Momo & popover bohlam). */
export function ObjectRecommendationChips({
  items,
  ariaLabel = "Rekomendasi benda yang bisa digambar",
  testId = "r83-rec-chips",
}: ObjectRecommendationChipsProps) {
  if (items.length === 0) return null;
  return (
    <ul className="r83-rec-chips" aria-label={ariaLabel} data-testid={testId}>
      {items.map((item) => (
        <li key={item.labelId} className="r83-rec-chip">
          <span className="r83-rec-chip__ico" aria-hidden="true">
            <ObjectGlyph labelId={item.labelId} />
          </span>
          <span className="r83-rec-chip__name">{item.displayName}</span>
        </li>
      ))}
    </ul>
  );
}

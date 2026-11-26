import { NAME_MAX_CHARS, NAME_MAX_WORDS } from "@/src/nui/core/constants";

/**
 * Normalisasi transkrip/ketikan nama siswa.
 * Port persis fungsi `clean()` dari `proto-html/r83/index.html:1125-1130` (`onboarding/cam/index.html`).
 *
 * Contoh: `"halo nama saya rani putri"` -> `"Rani Putri"`.
 */
export function normalizeName(raw?: string | null): string {
  let s = String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z\u00C0-\u024F' -]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  s = s
    .replace(/^(halo|hai|hi|oke|ok)\s+/, "")
    .replace(/^(nama\s*(saya|aku|ku)|namaku|panggil\s*(saja|aja)?\s*(aku|saya)?|aku|saya|gue|gw)\s+/, "")
    .replace(/^(adalah|itu)\s+/, "");

  if (!s) return "";

  return s
    .split(" ")
    .filter(Boolean)
    .slice(0, NAME_MAX_WORDS)
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : ""))
    .join(" ")
    .slice(0, NAME_MAX_CHARS)
    .trimEnd();
}

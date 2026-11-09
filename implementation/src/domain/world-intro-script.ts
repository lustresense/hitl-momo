/**
 * What Momo tells when a student enters a level: where Thinman has to get to, why, and that the drawing
 * page is up in the sky. Plain sentences, no parenthesised asides. Momo only tells; she never decides
 * or draws (lore invariant). Copy is placeholder story text, not locked narrative.
 */
import { formatCharacterText } from "../config/character-tokens";

const TO_SKY = "Yuk kita ke langit, tempat kamu menggambar!";

const SCRIPT: Record<1 | 2 | 3, string[]> = {
  1: [
    "Ini dunia {character}. Dia harus sampai ke papan petunjuk di seberang.",
    "Kalau berhasil, dia bisa jalan sendiri tanpa bantuanmu.",
    "Tapi ada celah di depan.",
  ],
  2: [
    "Halaman ini terlipat ke atas. {character} harus naik sampai dataran paling tinggi.",
    "Setelah sampai, dia bisa jalan sendiri tanpa bantuanmu.",
    "Dia butuh pijakan buat naik.",
  ],
  3: [
    "Lorong ini berkabut dan lantainya penuh duri. {character} harus keluar sampai ke papan petunjuk.",
    "Kalau selamat, dia bisa jalan sendiri tanpa bantuanmu.",
    "Pilih benda yang aman buat dia.",
  ],
};

export function introLines(stage: number, characterDisplayName?: string | null): string[] {
  const key = (stage >= 1 && stage <= 3 ? stage : 1) as 1 | 2 | 3;
  return SCRIPT[key].map((line) => formatCharacterText(line, characterDisplayName));
}

/**
 * PRD 0.0.16 R10: Momo points at what can be drawn without ordering it. Framed as a rule of the world,
 * a few visible choices (the level catalog, no invented labels), the student chooses, tied to the mission.
 */
const NUDGE: Record<1 | 2 | 3, string> = {
  1: "{character} butuh pijakan buat nyebrang. Kamu mau bikin yang mana?",
  2: "{character} butuh pijakan buat naik. Kamu mau bikin yang mana?",
  3: "Lantainya penuh duri. Benda mana yang aman buat {character}?",
};

export function nudgeLines(stage: number, characterDisplayName?: string | null): string[] {
  const key = (stage >= 1 && stage <= 3 ? stage : 1) as 1 | 2 | 3;
  return [
    "Di dunia ini, cuma beberapa benda yang bisa hidup dari gambarmu.",
    formatCharacterText(NUDGE[key], characterDisplayName),
  ];
}

export const NUDGE_TO_SKY = TO_SKY;

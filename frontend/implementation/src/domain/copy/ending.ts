import { DEFAULT_CHARACTER_NAME } from "@/src/config/character-tokens";
import type { RecapTotals } from "@/src/components/ending/recap-summary";
import type { MomoExpression } from "@/src/components/momo/momo-engine";

/**
 * Copy layar Penutup (Pusat Halaman, 5 fase) untuk UI r8.3.
 * Disalin 1:1 dari proto-html/r83/shared/end/{end,recap,center-art}.js.
 * Aturan Owner:
 * - O-8: gunakan "Level", bukan "Bab".
 * - Tanpa data contoh rekap (`SAMPLE` balok/papan/tali tidak di-port).
 */

export const ENDING_CHARACTER_NAME = DEFAULT_CHARACTER_NAME;
export const ENDING_NOT_RECORDED = "tidak tercatat";
export const ENDING_PORTAL_REACTION = "Eh! Kamu... hidup?";

/** proto-html/r83/shared/end/end.js:13 (tercatat di COPY_RECONCILIATION.md §3). */
export const ENDING_AI_TALK_LINES = [
  "Aku ini gambaran dari AI, bukan AI yang sebenarnya.",
  "Aku menebak dari pola goresan yang pernah kulihat, jadi tebakanku bisa salah.",
  "Kamu yang memutuskan benda apa yang masuk ke dunia ini.",
] as const;

export const ENDING_AI_TALK_MOODS: readonly MomoExpression[] = [
  "Berpikir",
  "Penasaran",
  "Senang",
] as const;

export const ENDING_RECAP_LINES = [
  "Ini semua yang kamu gambar dan pilih tadi.",
] as const;

export const ENDING_FINISH_LINES = [
  `${ENDING_CHARACTER_NAME} sekarang sudah bisa jalan sendiri.`,
  "Terima kasih sudah ikut bermain.",
] as const;

export const ENDING_COPY = {
  screenTitle: "Pusat Halaman",
  thinmanAriaLabel: ENDING_CHARACTER_NAME,
  notRecorded: ENDING_NOT_RECORDED,
  centerArt: {
    ariaLabel: "Pusat Halaman",
    signpostSmall: "Selamat datang di",
    signpostBig: "Pusat Halaman",
  },
  payung: {
    label: "Terjun payung",
    hint: `Cukup tonton. ${ENDING_CHARACTER_NAME} mendarat di Pusat Halaman`,
    launchLine: `Selamat! ${ENDING_CHARACTER_NAME} sudah keluar dari lorong.`,
    landedLines: [
      `${ENDING_CHARACTER_NAME} mendarat dengan selamat.`,
      "Ini Pusat Halaman.",
    ] as const,
  },
  kolam: {
    label: "Kolam tinta",
    hint: "Cubit lalu geser ke kanan = jalan · lepas = berhenti",
    hintDev: "Cubit lalu geser ke kanan = jalan · lepas = berhenti · atau Lewati",
    promptLine: `Itu kolam tinta ajaib! Antar ${ENDING_CHARACTER_NAME} ke sana: cubit, lalu geser tanganmu ke **kanan**.`,
    reactionLine: ENDING_PORTAL_REACTION,
  },
  bicara: {
    label: "Penjelasan Momo",
    hint: "Dengarkan Momo dulu · lalu cubit dan tahan di mana aja",
    lines: ENDING_AI_TALK_LINES,
    moods: ENDING_AI_TALK_MOODS,
    understandLabel: "Aku mengerti",
    understandHoldMs: 1000,
  },
  rekap: {
    label: "Rekap",
    hint: "Ini catatan dari permainanmu, bukan nilai",
    cardLabel: "Rekap tebakan",
    introLines: ENDING_RECAP_LINES,
    emptyMessage: "Belum ada catatan gambar di sesi ini.",
    nextLabel: "Lanjut",
    nextHoldMs: 1000,
  },
  akhir: {
    label: "Akhir",
    hint: "Tidak ada loop otomatis · Kembali ke sampul: cubit dan tahan 2 detik di mana aja",
    lines: ENDING_FINISH_LINES,
    backToCoverLabel: "Kembali ke sampul",
    backToCoverHoldMs: 2000,
  },
} as const;

/** Normalisasi judul level ke istilah "Level" sesuai keputusan Owner O-8. */
export function formatEndingRecapTitle(title: string, levelId?: string, fallbackIndex = 0): string {
  const trimmed = title.trim();
  if (trimmed.length > 0) {
    return trimmed.replace(/^bab\b/i, "Level");
  }
  const stageMatch = levelId ? /(\d+)/.exec(levelId) : null;
  if (stageMatch) {
    return `Level ${stageMatch[1]}`;
  }
  return `Level ${fallbackIndex + 1}`;
}

/** Kapitalisasi awal label benda hasil gambar siswa (seperti `SU.nameOf` di data.js:75). */
export function formatEndingRecapLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length === 0) return ENDING_NOT_RECORDED;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Kalimat rekap jumlah keputusan dari data sesi asli (tanpa data contoh palsu). */
export function formatEndingRecapCounts(totals: RecapTotals | null): string {
  if (totals === null) {
    return ENDING_COPY.rekap.emptyMessage;
  }
  const redrawPart =
    totals.redraws === null
      ? `gambar ulang ${ENDING_NOT_RECORDED}`
      : `gambar ulang ${totals.redraws} kali`;
  return `Kamu setuju sama tebakanku ${totals.accept} kali, pilih tebakan lain ${totals.correct} kali, tolak semua ${totals.override} kali, ${redrawPart}.`;
}

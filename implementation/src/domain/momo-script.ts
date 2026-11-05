/**
 * FR-14: Momo is a contextual companion / pattern reader.
 * It may show short state-driven text bubbles. It must NEVER create the
 * student's object, decide for the student, or imply it can (lore invariant).
 * Lines stay under ~8 words: students should not have to read.
 * All lines are placeholder copy; final Momo visual/voice remains unlocked.
 */

export type MomoMoment =
  | "level-entry"
  | "drawing-cue"
  | "drawing-empty"
  | "predicting"
  | "provider-error"
  | "top3-compare"
  | "decision-accepted"
  | "decision-corrected"
  | "decision-overridden"
  | "solid-consequence"
  | "danger-consequence"
  | "fallback-consequence"
  | "cycle-success"
  | "cycle-fail"
  | "level-complete";

/** Placeholder guidance lines keyed by app state. */
const LINES: Record<MomoMoment, string> = {
  "level-entry": "Halo! Aku Momo. Aku membaca, kamu menggambar.",
  "drawing-cue": "Gambar dulu, ya.",
  "drawing-empty": "Kanvasnya masih kosong.",
  predicting: "Aku baca dulu…",
  "provider-error": "Aku gagal membaca. Coba lagi?",
  "top3-compare": "Ini tebakanku. Kamu yang memutuskan.",
  "decision-accepted": "Kamu setuju dengan tebakan pertama.",
  "decision-corrected": "Kamu memilih tebakan lain.",
  "decision-overridden": "Kamu memilih sendiri.",
  "solid-consequence": "Kokoh! Silakan lewat.",
  "danger-consequence": "Awas, objek ini berbahaya.",
  "fallback-consequence": "Aku belum tahu objek ini. Kupakai versi netral.",
  "cycle-success": "Berhasil!",
  "cycle-fail": "Tidak apa-apa. Coba lagi.",
  "level-complete": "Bab selesai! Keputusanmu yang menentukan.",
};

export function momoLine(moment: MomoMoment): string {
  return LINES[moment];
}

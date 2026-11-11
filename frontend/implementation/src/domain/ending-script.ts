/**
 * Momo's lines for the closing (Pusat Halaman). Display copy only: Momo guesses from patterns and can miss; the
 * student decides. No line grades the student or the AI. The character name comes from the token file.
 */
import { DEFAULT_CHARACTER_NAME } from "@/src/config/character-tokens";

/** Momo sees Thinman come out of the portal alive. */
export const PORTAL_REACTION = "Eh! Kamu... hidup?";

/** Momo's short overview of AI after the portal. */
export const AI_TALK_LINES = [
  "Aku ini AI. Aku menebak benda dari pola goresan yang pernah kulihat.",
  "Tebakanku bisa meleset.",
  "Kamu yang memutuskan benda apa yang masuk ke dunia ini.",
] as const;

/** Before the recap cards. */
export const RECAP_LINES = ["Ini semua yang kamu gambar dan pilih tadi."] as const;

/** Leads into the quiz placeholder when the quiz flag is ON. */
export const QUIZ_LEAD_LINES = ["Sebelum pulang, ada beberapa pertanyaan singkat, ya."] as const;

/** Last words before the student may go back to the cover. */
export const FINISH_LINES = [
  `${DEFAULT_CHARACTER_NAME} sekarang sudah bisa jalan sendiri.`,
  "Terima kasih sudah ikut bermain.",
] as const;

export const QUIZ_PLACEHOLDER = "Kuis belum tersedia";

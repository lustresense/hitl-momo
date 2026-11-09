/**
 * What Momo says on every page before the drawing starts. Momo guides each page like a chat contact:
 * short lines, one at a time, always pointing at the next thing to do. No parentheses (M-012). Display only:
 * Momo never decides or creates anything (lore invariant).
 */
import type { MomoMood } from "./momo-script";

export interface GuideStep {
  lines: string[];
  mood: MomoMood;
}

/**
 * The cover (PRD 0.0.16 R1, R17): Momo sleeps until the student waves. Woken, she greets, tells her origin and invites
 * the student in; after the last line the book opens onto the ruler page.
 */
export const COVER_WAKE: GuideStep = {
  mood: "Senang",
  lines: [
    "Halo! Aku Momo, gambar pertama di buku ini yang bisa hidup.",
    "Aku bisa nebak gambar, tapi aku nggak bisa menggambar.",
    "Temanku Thinman cuma garis tipis yang belum selesai. Bantu dia hidup, ya!",
    "Ayo ikut aku masuk ke dunia Sketchbook!",
  ],
};

/** Cover in fallback mode (R13): the camera cannot be used, Momo says so before the wake button appears. */
export const COVER_NO_CAMERA_HINT = "Kamera tidak bisa dipakai. Tekan Bangunkan Momo.";

export const NUMBER_STEP: GuideStep = {
  mood: "Penasaran",
  lines: ["Sebelum masuk, pilih dulu nomor absenmu.", "Geser penggarisnya sampai pas."],
};

/** R3: the ruler stopped on a free number; Momo asks and waits for a 2 s thumbs-up. */
export function numberConfirm(value: number): GuideStep {
  return { mood: "Penasaran", lines: [`Bener nomor absenmu ${value}?`] };
}

export const NUMBER_TAKEN_STEP: GuideStep = {
  mood: "Bingung",
  lines: ["Nomor itu sudah ada yang pakai. Geser ke nomor lain ya."],
};

export type TutorialMoment = "deal" | "walk" | "walk-done" | "safety" | "gesture" | "gesture-done";

export function tutorialStep(moment: TutorialMoment, characterName: string): GuideStep {
  switch (moment) {
    case "deal":
      return { mood: "Senang", lines: ["Ada tiga kartu panduan. Kita buka satu-satu ya."] };
    case "walk":
      return { mood: "Semangat", lines: [`Coba geser tanganmu ke kanan dan kiri. Ajak ${characterName} jalan ke bendera.`] };
    case "walk-done":
      return { mood: "Senang", lines: [`Mantap, ${characterName} sampai! Angkat jempolmu buat lanjut.`] };
    case "safety":
      return { mood: "Berpikir", lines: ["Benda padat jadi pijakan. Duri itu berbahaya.", "Sudah paham? Angkat jempolmu."] };
    case "gesture":
      return { mood: "Semangat", lines: ["Sekarang coret kanvasnya, lalu coba mundur.", "Dua gestur itu yang membuka Level 1."] };
    case "gesture-done":
      return { mood: "Senang", lines: ["Kamu sudah siap! Tahan jempolmu buat mulai Level 1."] };
  }
}

/** The level list: Momo points at the newest unlocked chapter. */
export function levelListStep(unlocked: number): GuideStep {
  if (unlocked <= 1) return { mood: "Semangat", lines: ["Ini bab-bab bukunya.", "Pilih Bab 1, lalu tarik pitanya ke bawah."] };
  if (unlocked === 2) return { mood: "Senang", lines: ["Bab 2 sudah kebuka!", "Pilih Bab 2 dan tarik pitanya ke bawah."] };
  return { mood: "Senang", lines: ["Semua bab sudah kebuka!", "Pilih bab yang mau kamu mainkan, lalu tarik pitanya."] };
}

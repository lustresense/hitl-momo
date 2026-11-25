/**
 * Copy of the three tutorial cards (R4). Everything here is student-facing Indonesian, short, with no emoji and no
 * parentheses. The character name always comes from the caller (character-tokens), never a literal.
 */
import type { GuideStep } from "./guide-script";

export type TutorialMoment = "deal" | "walk" | "walk-done" | "safety" | "gesture" | "gesture-done";

export type TutorialHintIcon = "gesture-pinch" | "gesture-point-right" | "arrow-right" | "bulb" | "thumb-up";

/** The four practice tools of card 3, in the order the card shows them. */
export const TUTORIAL_PRACTICE_TOOLS = ["draw", "erase", "undo", "redo", "clear"] as const;
export type TutorialPracticeTool = (typeof TUTORIAL_PRACTICE_TOOLS)[number];

export function tutorialCardCopy(index: 0 | 1 | 2, name: string): { title: string; copy: string; cta: string; holdMs: 1000 | 2000 } {
  if (index === 0) {
    return { title: `Kenalin ${name}`, copy: "Dia mau menyeberangi buku gambar ini. Bantu dia jalan sampai ke bendera.", cta: "Lanjut", holdMs: 1000 };
  }
  if (index === 1) {
    return {
      title: "Pijakan aman, atau bahaya",
      copy: `Gambar benda padat kayak balok atau tangga biar ${name} bisa lewat. Hindari benda bahaya kayak duri biar bukunya nggak sobek.`,
      cta: "Lanjut",
      holdMs: 1000,
    };
  }
  return {
    title: "Latihan kursor dan alat",
    copy: "Di kertas, kursormu jadi pensil. Cubit, tahan, lalu geser buat menggambar. Coba juga Hapus, Mundur, Maju, dan Bersihkan: tunjuk tombolnya, lalu cubit. Tiap alat yang kamu coba akan tercentang.",
    cta: "Pilih level",
    holdMs: 1000,
  };
}

/** The gesture line on each card, for the input mode the student is in. Fallback lines never name a keyboard key. */
export function tutorialHint(index: 0 | 1 | 2, camera: boolean, practiceDone: boolean): { icon: TutorialHintIcon; text: string } {
  if (index === 0) {
    if (!camera) return { icon: "arrow-right", text: "Tarik Thinman ke kanan sampai menyentuh bendera." };
    return practiceDone
      ? { icon: "gesture-pinch", text: "Cubit dan tahan di mana aja untuk lanjut." }
      : { icon: "gesture-pinch", text: "Cubit, lalu geser ke kanan untuk jalan. Cubit sebentar untuk lompat." };
  }
  if (index === 1) {
    return practiceDone
      ? { icon: "gesture-pinch", text: camera ? "Cubit dan tahan di mana aja untuk lanjut." : "Tahan tombol untuk lanjut." }
      : { icon: "bulb", text: "Baca dulu penjelasannya." };
  }
  return camera
    ? { icon: "gesture-pinch", text: "Kursornya jadi pensil. Cubit, tahan, geser untuk menggambar. Alat: tunjuk, lalu cubit." }
    : { icon: "gesture-pinch", text: "Coret pakai mouse, lalu coba tiap alat di kanan." };
}

/** Momo's lines per moment. `camera` picks the gesture words; fallback lines name buttons, not gestures. */
export function tutorialStep(moment: TutorialMoment, characterName: string, camera = true): GuideStep {
  switch (moment) {
    case "deal":
      return { mood: "Senang", lines: ["Ada tiga kartu panduan. Kita buka satu-satu ya."] };
    case "walk":
      return {
        mood: "Semangat",
        lines: [camera ? `Cubit, lalu geser ke kanan untuk jalan. Cubit sebentar untuk lompat.` : `Tarik ${characterName} ke kanan sampai menyentuh bendera.`],
      };
    case "walk-done":
      return { mood: "Senang", lines: [`Mantap, ${characterName} sampai!`, "Baca dulu sebentar, ya."] };
    case "safety":
      return { mood: "Berpikir", lines: ["Benda padat jadi pijakan yang aman.", "Duri itu berbahaya, jadi hindari ya."] };
    case "gesture":
      return {
        mood: "Semangat",
        lines: camera
          ? ["Coret kanvasnya pakai cubit.", "Coba semuanya: Hapus cuma menghapus bagian yang kamu gosok, Bersihkan mengosongkan kertas."]
          : ["Coret kanvasnya pakai mouse.", "Coba hapus, mundur, maju, dan bersihkan lewat tombol di kanan."],
      };
    case "gesture-done":
      return { mood: "Senang", lines: ["Kamu sudah siap!", camera ? "Cubit dan tahan di mana aja buat memilih level." : "Tahan tombolnya buat mulai Bab 1."] };
  }
}

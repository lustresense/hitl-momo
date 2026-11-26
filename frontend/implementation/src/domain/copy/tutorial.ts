/**
 * Copy layar tutorial tiga kartu r8.3.
 * Disalin dari proto-html/r83/shared/kartu/kartu.js COPY[], HINT[], dan dialog Momo (§9.2).
 * Memakai istilah "Level" (O-8, bukan "Bab"). Nama karakter selalu dari parameter/konfig.
 */
import type { CardIndex } from "@/src/components/onboarding/tutorial-card-gate";

export type { CardIndex };

export interface TutorialCardCopy {
  readonly id: "walk" | "safety" | "draw";
  readonly index: CardIndex;
  readonly title: string;
  readonly copy: string;
  readonly cta: string;
  readonly label: string;
  readonly hint: string;
  readonly gestureIcon: "pinch" | "bulb";
  readonly gestureLabel: string;
  readonly unlockedHint: string;
}

export function getTutorialCards(characterName: string): readonly TutorialCardCopy[] {
  return [
    {
      id: "walk",
      index: 0,
      title: `Kenalin ${characterName}`,
      copy: "Dia mau menyeberangi buku gambar ini. Bantu dia jalan sampai ke bendera.",
      cta: "Lanjut",
      label: `Kartu 1 · Kenalin ${characterName}`,
      hint: "Cubit lalu geser ke kanan = jalan · cubit sebentar atau sentil ke atas = lompat · atau ← → ↑",
      gestureIcon: "pinch",
      gestureLabel: "Cubit, lalu geser ke kanan untuk jalan. Cubit sebentar untuk lompat.",
      unlockedHint: "Cubit dan tahan di mana aja untuk lanjut.",
    },
    {
      id: "safety",
      index: 1,
      title: "Pijakan aman, atau bahaya",
      // COPY-PENDING-OWNER (PLAN Lampiran B): menjaga teks sandbox r8.3 apa adanya hingga disetujui Owner.
      copy: `Gambar benda padat kayak balok atau tangga biar ${characterName} bisa lewat. Hindari benda bahaya kayak duri biar bukunya nggak sobek.`,
      cta: "Lanjut",
      label: "Kartu 2 · Aman atau bahaya",
      hint: "Cukup baca dan lihat contohnya",
      gestureIcon: "bulb",
      gestureLabel: "Baca dulu penjelasannya.",
      unlockedHint: "Cubit dan tahan di mana aja untuk lanjut.",
    },
    {
      id: "draw",
      index: 2,
      title: "Latihan kursor dan alat",
      copy: "Di kertas, kursormu jadi pensil. Cubit, tahan, lalu geser buat menggambar. Coba juga Hapus, Mundur, Maju, dan Bersihkan: tunjuk tombolnya, lalu cubit. Tiap alat yang kamu coba akan tercentang.",
      cta: "Pilih level",
      label: "Kartu 3 · Latihan kursor",
      hint: "Cubit, tahan, geser di kertas = gambar · alat: tunjuk lalu cubit",
      gestureIcon: "pinch",
      gestureLabel: "Kursornya jadi pensil. Cubit, tahan, geser untuk menggambar. Alat: tunjuk, lalu cubit.",
      unlockedHint: "Cubit dan tahan di mana aja untuk memilih level.",
    },
  ] as const;
}

export const TUTORIAL_COPY = {
  screenAriaLabel: "Tutorial tiga kartu",
  cardAriaLabel: (num: number) => `Kartu tutorial ${num}`,
  walkSceneAriaLabel: (pct: number) => `Latihan jalan ${pct}% menuju bendera`,
  safeBadge: "Aman dipijak",
  dangerBadge: "Kertas sobek",
  practiceCanvasAriaLabel: "Kanvas latihan",
  lockedRingAriaLabel: "Coba dulu, ya",
  lockedRingLabel: "Coba dulu, ya",
  unlockedRingAriaLabel: "Cubit",
  introNamed: (studentName: string, charName: string) =>
    `Halo, **${studentName}**! Selanjutnya kamu bisa baca **3 kartu panduan** ini untuk tahu cara main dan bantu ${charName}, ya.`,
  introAnon: (charName: string) =>
    `Selanjutnya kamu bisa baca **3 kartu panduan** ini untuk tahu cara main dan bantu ${charName}, ya.`,
  dealStartLine: "Kita mulai dari kartu pertama, ya.",
  cardMomoLines: (index: CardIndex, charName: string): { mood: "Semangat" | "Berpikir" | "Senang"; lines: readonly string[] } => {
    if (index === 0) {
      return {
        mood: "Semangat",
        lines: [
          `Kenalin, ini ${charName}. Yuk, antar dia ke bendera!`,
          "Cubit di mana aja, lalu geser tanganmu ke **kanan**. Makin jauh, makin cepat jalannya.",
          "Mau lompat? Cubit sebentar, atau sentil tanganmu ke atas.",
        ],
      };
    }
    if (index === 1) {
      return {
        mood: "Berpikir",
        lines: [
          `Benda padat bisa jadi pijakan yang aman buat ${charName}.`,
          "Duri itu berbahaya. Nanti kamu yang memilih benda apa yang masuk ke dunianya.",
        ],
      };
    }
    return {
      mood: "Semangat",
      lines: [
        "Di kertas, kursormu muncul jadi pensil. Cuma di sini ada kursor, ya.",
        "Cubit, tahan, lalu geser buat menggambar. Buat ganti alat, tunjuk tombolnya lalu cubit.",
        "Coba semuanya: Hapus cuma menghapus bagian yang kamu gosok, Bersihkan mengosongkan kertas.",
      ],
    };
  },
  cardDoneMomoLines: (index: CardIndex, charName: string): readonly string[] => {
    if (index === 0) {
      return [`Mantap, ${charName} sampai di bendera!`, "Baca kartunya sebentar. Kalau sudah, cubit dan tahan di mana aja."];
    }
    if (index === 2) {
      return ["Kamu sudah siap!", "Cubit dan tahan di mana aja buat memilih level."];
    }
    return [];
  },
} as const;

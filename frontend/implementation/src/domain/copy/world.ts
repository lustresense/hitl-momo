import { formatCharacterText } from "@/src/config/character-tokens";

export type WorldStageNumber = 1 | 2 | 3;
export type WorldIntroFocus = "thinman" | "ahead";
export type WorldFailKind = "fall" | "spike" | "danger";

export interface WorldLevelCopyEntry {
  readonly title: string;
  readonly name: string;
  readonly signpostNextLabel?: string;
  readonly story: readonly string[];
  readonly focus: readonly WorldIntroFocus[];
  readonly nudge: readonly string[];
  readonly win: readonly string[];
}

export function normalizeWorldStage(stage: number): WorldStageNumber {
  return stage === 2 || stage === 3 ? stage : 1;
}

const TO_SKY_LINE = "Yuk kita ke langit, tempat kamu menggambar!";

export const WORLD_LEVEL_COPY: Record<WorldStageNumber, WorldLevelCopyEntry> = {
  1: {
    title: "Level 1 · Jembatan Pertama",
    name: "Halaman yang Sobek",
    signpostNextLabel: "Level 2",
    story: [
      "Ini dunia {character}. Dia harus sampai ke papan petunjuk di seberang.",
      "Kalau berhasil, dia bisa jalan sendiri tanpa bantuanmu.",
      "Tapi ada celah di depan.",
    ],
    focus: ["thinman", "thinman", "ahead"],
    nudge: [
      "Di dunia ini, cuma beberapa benda yang bisa hidup dari gambarmu.",
      "{character} butuh pijakan buat nyebrang. Kamu mau gambar pijakannya di langit?",
      TO_SKY_LINE,
    ],
    win: [
      "Kamu berhasil membuat jalur untuk {character} menyeberangi celah!",
      "AI hanya menebak. Kamu yang memutuskan.",
    ],
  },
  2: {
    title: "Level 2 · Menara Lipatan",
    name: "Menara Lipatan",
    signpostNextLabel: "Level 3",
    story: [
      "Halaman ini terlipat ke atas. {character} harus naik sampai dataran paling tinggi.",
      "Setelah sampai, dia bisa jalan sendiri tanpa bantuanmu.",
      "Dia butuh pijakan buat naik.",
    ],
    focus: ["thinman", "thinman", "ahead"],
    nudge: [
      "Di dunia ini, cuma beberapa benda yang bisa hidup dari gambarmu.",
      "{character} butuh pijakan buat naik. Kamu mau gambar pijakannya di langit?",
      TO_SKY_LINE,
    ],
    win: [
      "Kamu berhasil menemukan jalan ke halaman atas!",
      "Bandingkan ketiga tebakan. Persen tinggi belum tentu benar.",
    ],
  },
  3: {
    title: "Level 3 · Lorong Kabut Penghapus",
    name: "Lorong Kabut Penghapus",
    story: [
      "Lorong ini berkabut dan lantainya penuh duri.",
      "{character} harus keluar sampai ke papan petunjuk.",
      "Kalau selamat, dia bisa jalan sendiri tanpa bantuanmu.",
      "Pilih benda yang aman buat dia.",
    ],
    focus: ["ahead", "thinman", "thinman", "ahead"],
    nudge: [
      "Di dunia ini, cuma beberapa benda yang bisa hidup dari gambarmu.",
      "Lantainya penuh duri. Kamu mau gambar benda yang aman buat {character} di langit?",
      TO_SKY_LINE,
    ],
    win: [
      "Kamu berhasil keluar dari Lorong Kabut!",
      "Persen tinggi tidak menjamin benar. Periksa gambar dan akibatnya.",
    ],
  },
};

const FAIL_REASONS: Record<WorldFailKind, string> = {
  fall: "{character} jatuh ke celah. Coba tambahkan pijakan, atau geser bendanya.",
  spike: "{character} kena duri. Cari jalan yang lebih aman.",
  danger: "Benda itu berbahaya buat {character}. Mungkin tebakanku keliru, atau kamu bisa menggambar ulang.",
};

export function classifyWorldFailReason(rawReason?: string | null): WorldFailKind {
  const normalized = (rawReason ?? "").toLowerCase();
  if (normalized.includes("duri") || normalized.includes("spike")) return "spike";
  if (normalized.includes("berbahaya") || normalized.includes("bahaya") || normalized.includes("danger")) {
    return "danger";
  }
  return "fall";
}

export function formatWorldFailReason(
  rawReason?: string | null,
  characterDisplayName?: string | null,
): string {
  const kind = classifyWorldFailReason(rawReason);
  return formatCharacterText(FAIL_REASONS[kind], characterDisplayName);
}

export const WORLD_COPY = {
  toSky: TO_SKY_LINE,
  intro: {
    sceneLabel: (stage: number): string => `Level ${normalizeWorldStage(stage)} · Cerita`,
    hint: "Baca dulu · setelah Momo selesai, cubit dan tahan di mana aja",
    understandRingLabel: "Aku mengerti",
    skipLabel: "Lewati cerita",
  },
  drop: {
    sceneLabel: (stage: number): string => `Level ${normalizeWorldStage(stage)} · Lempar`,
  },
  rise: {
    sceneLabel: (stage: number): string => `Level ${normalizeWorldStage(stage)} · Ke langit`,
    bubble: "Satu benda lagi. Yuk ke langit!",
  },
  placement: {
    sceneLabel: (stage: number): string => `Level ${normalizeWorldStage(stage)} · Taruh`,
    hint: "Cubit lalu geser = benda ikut tanganmu · lepas = tetap di situ · cubit dan tahan diam = Taruh di sini · putar: roda mouse atau R",
    fallingBubble: "Wah, bendanya jatuh dari langit!",
    landedBubble:
      "Benda itu sudah mendarat. Cubit lalu geser tanganmu, bendanya ikut pindah. Kalau sudah pas, cubit dan tahan tanpa bergerak sampai **Taruh di sini** penuh.",
    placeRingLabel: "Taruh di sini",
    illegalPlacement: "Posisi ini menyentuh batas panggung atau benda lain. Geser sedikit ya.",
    needMoreObjectsBubble: (remaining: number, stage: number, characterDisplayName?: string | null): string =>
      formatCharacterText(
        `{character} masih butuh ${remaining} benda lagi buat ${normalizeWorldStage(stage) === 2 ? "naik" : "lewat"}. Cubit dan tahan di mana aja buat menggambar lagi.`,
        characterDisplayName,
      ),
    needMoreRingLabel: "Gambar lagi",
    readyPlayBubble: "Bendanya sudah cukup! Cubit dan tahan di mana aja, terus kita coba jalan.",
    readyPlayRingLabel: "Mulai",
    repositionReadyBubble: "Sudah pas? Cubit dan tahan buat mencoba lagi.",
  },
  gameplay: {
    sceneLabel: (stage: number): string => `Level ${normalizeWorldStage(stage)} · Bermain`,
    hint: "Cubit lalu geser kanan/kiri = jalan · lepas = berhenti · cubit cepat atau sentil ke atas = lompat · keyboard: ← → dan Spasi",
    goalChip: "Jalan ke papan petunjuk",
    goalReachedChip: "Sampai!",
    playBubble: (characterDisplayName?: string | null): string =>
      formatCharacterText(
        "Antar {character} ke papan petunjuk. Cubit, lalu geser tanganmu ke arah tujuannya.",
        characterDisplayName,
      ),
    exitLabel: "Keluar",
    exitAriaLabel: "Kembali ke pilih level",
    repositionLabel: "Geser benda",
    redrawLabel: "Gambar lagi",
    rotateLabel: "Putar",
  },
  fail: {
    kicker: "Belum berhasil",
    title: "Mau coba apa?",
    prompt: "Dekatkan tangan ke pilihanmu, lalu cubit dan tahan.",
    reasons: FAIL_REASONS,
    actions: {
      retry: "Coba lagi",
      place: "Geser benda",
      draw: "Gambar lagi",
    },
  },
  win: {
    sceneLabel: (stage: number): string => `Level ${normalizeWorldStage(stage)} · Selesai`,
    hint: "Cubit dan tahan di mana aja (atau tahan Enter)",
    unlockedChip: (stage: number): string => {
      const s = normalizeWorldStage(stage);
      return s < 3 ? `Level ${s + 1} terbuka` : "Pusat Halaman terbuka";
    },
    unlockedLine: (stage: number): string => {
      const s = normalizeWorldStage(stage);
      return s < 3 ? `Level ${s + 1} sudah kebuka!` : "Semua level selesai!";
    },
    continueRingLabel: "Lanjut",
    lines: (stage: number, characterDisplayName?: string | null): string[] => {
      const s = normalizeWorldStage(stage);
      return [
        ...WORLD_LEVEL_COPY[s].win.map((line) => formatCharacterText(line, characterDisplayName)),
        WORLD_COPY.win.unlockedLine(s),
      ];
    },
  },
} as const;

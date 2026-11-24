import type { LevelContext } from "./types";

/**
 * DEV / PLACEHOLDER LEVEL DATA — temporary fixtures only.
 * Per PRD FR-13 §17: no final object lists, confidence bands, traps,
 * deception scripts, or story text are being invented or finalized here.
 * Stage emphasis follows PRD progression framework.
 */

function makeLevel(
  partial: Omit<LevelDefinition, "scene"> & { scene?: Partial<LevelContext["scene"]> },
): LevelDefinition {
  return {
    ...partial,
    scene: {
      groundEndX: 340,
      gapStartX: 340,
      gapWidth: 150,
      goalX: 700,
      ...partial.scene,
    },
  };
}

export interface LevelDefinition extends LevelContext {
  title: string;
  /** Student-facing task line. Placeholder copy, not final story text. */
  task: string;
  stageEmphasis: string;
  /** Objects the student is allowed to draw for this level (catalog UI). */
  catalog: Array<{ labelId: string; displayName: string; icon?: string }>;
  /**
   * PRD 0.0.16 K2 (dummy for the partner): the fewest placed solid objects that make the stage geometry
   * crossable. Proven by tests/game/level-solvability.test.ts (n-1 objects fail, n objects succeed).
   */
  minDrawings: number;
  /** Two-block summary copy for level completion. */
  summary: {
    /** Gameplay outcome narrative — what the student achieved. */
    gameplay: string;
    /** AI literacy reflection — what the student experienced with predictions/decisions. */
    literacy: string;
  };
}

const DIAS_CATALOG = [
  {
    "labelId": "tangga",
    "displayName": "Tangga"
  },
  {
    "labelId": "anak tangga",
    "displayName": "Anak tangga"
  },
  {
    "labelId": "jembatan",
    "displayName": "Jembatan"
  },
  {
    "labelId": "bangku",
    "displayName": "Bangku"
  },
  {
    "labelId": "meja",
    "displayName": "Meja"
  },
  {
    "labelId": "papan luncur",
    "displayName": "Papan luncur"
  },
  {
    "labelId": "kaktus",
    "displayName": "Kaktus"
  },
  {
    "labelId": "api unggun",
    "displayName": "Api unggun"
  },
  {
    "labelId": "petir",
    "displayName": "Petir"
  },
  {
    "labelId": "gergaji",
    "displayName": "Gergaji"
  },
  {
    "labelId": "pisau",
    "displayName": "Pisau"
  },
  {
    "labelId": "pedang",
    "displayName": "Pedang"
  },
  {
    "labelId": "ular",
    "displayName": "Ular"
  },
  {
    "labelId": "laba-laba",
    "displayName": "Laba-laba"
  },
  {
    "labelId": "pagar",
    "displayName": "Pagar"
  },
  {
    "labelId": "zigzag",
    "displayName": "Zigzag"
  },
  {
    "labelId": "garis",
    "displayName": "Garis"
  },
  {
    "labelId": "awan",
    "displayName": "Awan"
  },
  {
    "labelId": "ember",
    "displayName": "Ember"
  },
  {
    "labelId": "payung",
    "displayName": "Payung"
  }
];
const DIAS_BEHAVIOR = {
  "tangga": "solid",
  "anak tangga": "solid",
  "jembatan": "solid",
  "bangku": "solid",
  "meja": "solid",
  "papan luncur": "solid",
  "kaktus": "danger",
  "api unggun": "danger",
  "petir": "danger",
  "gergaji": "danger",
  "pisau": "danger",
  "pedang": "danger",
  "ular": "danger",
  "laba-laba": "danger",
  "pagar": "neutral",
  "zigzag": "neutral",
  "garis": "neutral",
  "awan": "neutral",
  "ember": "neutral",
  "payung": "neutral"
} as const;

/** Stage 1 — Foundation: draw → prediction → decision → consequence. */
const STAGE_1: LevelDefinition = makeLevel({
  levelId: "stage-1-foundation",
  stage: 1,
  cyclesRequired: 1,
  minDrawings: 2,
  title: "Bab 1 · Jembatan Pertama",
  task: "Gambar dua objek untuk menyeberangi celah di buku.",
  stageEmphasis: "Pahami alur dasar: gambar → tebakan AI → keputusanmu → konsekuensi.",
  behaviorMap: DIAS_BEHAVIOR,
  vocabulary: DIAS_CATALOG.map((item) => item.labelId),
  catalog: DIAS_CATALOG.filter(({ labelId }) => ["tangga", "jembatan", "bangku", "papan luncur"].includes(labelId)),
  summary: {
    gameplay: "Kamu berhasil membuat jalur untuk {character} menyeberangi celah!",
    literacy: "AI hanya menebak. Kamu yang memutuskan.",
  },
});

/** Stage 2 — Ambiguity/comparison: compare Top-3 + confidence before deciding. */
const STAGE_2: LevelDefinition = makeLevel({
  levelId: "stage-2-ambiguity",
  stage: 2,
  cyclesRequired: 2,
  minDrawings: 2,
  title: "Bab 2 · Menara Lipatan",
  task: "Halaman terlipat ke atas. Susun pijakan agar {character} mencapai dataran yang lebih tinggi.",
  stageEmphasis: "Bandingkan Top-3 dan confidence — jangan berasumsi ranking pertama selalu yang paling tepat.",
  scene: {
    groundEndX: 300,
    gapStartX: 300,
    gapWidth: 180,
    goalX: 680,
  },
  behaviorMap: DIAS_BEHAVIOR,
  vocabulary: DIAS_CATALOG.map((item) => item.labelId),
  catalog: DIAS_CATALOG.filter(({ labelId }) => ["anak tangga", "tangga", "meja", "bangku"].includes(labelId)),
  summary: {
    gameplay: "Kamu berhasil menemukan jalan ke halaman atas!",
    literacy: "Bandingkan ketiga tebakan. Persen tinggi belum tentu benar.",
  },
});

/**
 * Stage 3 — Critical validation: in this dev context the rank-1-looking label
 * maps to danger while another label is solid. Context-aware mapping.
 */
const STAGE_3: LevelDefinition = makeLevel({
  levelId: "stage-3-validation",
  stage: 3,
  cyclesRequired: 1,
  minDrawings: 2,
  title: "Bab 3 · Lorong Kabut Penghapus",
  task: "Lorong berkabut tebal. Pilih objek yang tepat agar aman melewati rute penuh bahaya.",
  stageEmphasis: "Validasi konsekuensi sebelum memutuskan — label benar belum tentu penempatannya aman di konteks ini.",
  scene: {
    groundEndX: 280,
    gapStartX: 280,
    gapWidth: 220,
    goalX: 720,
  },
  behaviorMap: DIAS_BEHAVIOR,
  vocabulary: DIAS_CATALOG.map((item) => item.labelId),
  catalog: DIAS_CATALOG.filter(({ labelId }) => ["jembatan", "tangga", "kaktus", "awan"].includes(labelId)),
  summary: {
    gameplay: "Kamu berhasil keluar dari Lorong Kabut!",
    literacy: "Persen tinggi tidak menjamin benar. Periksa gambar dan akibatnya.",
  },
});

export const LEVELS: LevelDefinition[] = [STAGE_1, STAGE_2, STAGE_3];

/** The last level: winning it opens the closing (Pusat Halaman) instead of the level list. */
export const FINAL_LEVEL_STAGE = Math.max(...LEVELS.map((level) => level.stage));

export function getLevel(levelId: string): LevelDefinition | undefined {
  return LEVELS.find((l) => l.levelId === levelId);
}

/** Labels the mock provider may emit for a level (Top-3 candidates ⊆ this set). */
export function providerVocabulary(level: LevelDefinition): string[] {
  return [...new Set([...Object.keys(level.behaviorMap), ...level.vocabulary])];
}

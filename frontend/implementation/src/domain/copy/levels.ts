/**
 * Copy layar Pilih Level (r8.3).
 * Disalin 1:1 dari proto-html/r83/p3-pilih-bab/index.html & proto-html/r83/shared/bab/bab.js,
 * dengan penerapan O-8 ("Level" menggantikan "Bab" di seluruh teks siswa).
 * `src/domain/levels.ts` tidak diubah agar layar lama dan E2E lama tetap aman.
 */

export type RibbonVisualState = "open" | "done" | "locked";

export interface LevelStageCopy {
  readonly stage: number;
  /** Label siswa ringkas: "Level 1", "Level 2", "Level 3" (O-8). */
  readonly label: string;
  /** Judul lengkap sesuai rekonsiliasi COPY_RECONCILIATION.md #5. */
  readonly title: string;
  /** Nama pita bookmark sesuai sandbox bab.js:13 & data.js:26,35,44. */
  readonly ribbonName: string;
}

export const LEVEL_STAGE_COPY: readonly LevelStageCopy[] = [
  {
    stage: 1,
    label: "Level 1",
    title: "Level 1 · Jembatan Pertama",
    ribbonName: "Halaman yang Sobek",
  },
  {
    stage: 2,
    label: "Level 2",
    title: "Level 2 · Menara Lipatan",
    ribbonName: "Menara Lipatan",
  },
  {
    stage: 3,
    label: "Level 3",
    title: "Level 3 · Lorong Kabut Penghapus",
    ribbonName: "Lorong Kabut Penghapus",
  },
] as const;

export const LEVEL_SELECT_COPY = {
  pageTitle: "Pilih level · Sketchbook Universe",
  screenLabel: "Pilih level",
  screenAriaLabel: "Pilih level cerita",
  listAriaLabel: "Daftar level",
  ribbonTag: "Level",
  footTitle: "Pilih level",
  footTitleAllDone: "Semua level selesai",
  hint: "Dekatkan tangan ke pita (yang dekat menyala) · cubit lalu tarik ke bawah = mulai level",
  lockedDefault: "Belum bisa dipilih",
  stateLockedSuffix: ", terkunci",
  stateDoneSuffix: ", sudah selesai",
  momoAllDone: "Semua level sudah selesai. Hebat! Mau main lagi? Tarik salah satu pitanya.",
} as const;

export function getLevelStageCopy(stage: number): LevelStageCopy | undefined {
  return LEVEL_STAGE_COPY.find((entry) => entry.stage === stage);
}

export function formatLevelRibbonLabel(stage: number): string {
  return getLevelStageCopy(stage)?.label ?? `Level ${stage}`;
}

export function formatLevelRibbonName(stage: number, fallbackTitle?: string): string {
  const known = getLevelStageCopy(stage);
  if (known) return known.ribbonName;
  if (!fallbackTitle) return `Level ${stage}`;
  const parts = fallbackTitle.split("·");
  const subtitle = (parts[1] ?? fallbackTitle).trim();
  return subtitle.replace(/\bBab\b/gi, "Level");
}

export function formatLevelRibbonAriaLabel(
  stage: number,
  ribbonName: string,
  state: RibbonVisualState,
): string {
  const suffix =
    state === "locked"
      ? LEVEL_SELECT_COPY.stateLockedSuffix
      : state === "done"
        ? LEVEL_SELECT_COPY.stateDoneSuffix
        : "";
  return `Level ${stage}, ${ribbonName}${suffix}`;
}

export function formatLockedLevelMessage(stage: number): string {
  return stage > 1 ? `Selesaikan Level ${stage - 1} dulu` : LEVEL_SELECT_COPY.lockedDefault;
}

export interface MomoLevelPromptOptions {
  readonly freshStage?: number | null;
  readonly allDone: boolean;
  readonly nextStage?: number | null;
}

/** Port 1:1 kalimat Momo pada bab.js:171. */
export function formatMomoLevelPrompt({ freshStage, allDone, nextStage }: MomoLevelPromptOptions): string {
  if (freshStage) {
    return `Level ${freshStage} sudah kebuka! Dekatkan tangan ke pitanya, lalu cubit dan tarik ke bawah.`;
  }
  if (allDone) {
    return LEVEL_SELECT_COPY.momoAllDone;
  }
  return `Ini daftar levelnya. Dekatkan tangan ke pita **Level ${nextStage ?? 1}**, lalu cubit dan tarik ke bawah.`;
}

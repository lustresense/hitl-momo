import type { RuleKind } from "@/src/nui/core/types";

/**
 * Copy UI lapisan NUI r8.3.
 * Disalin apa adanya dari sandbox: proto-html/r83/shared/{hand.js, hand.css, ui.js, kartu/kartu.js}.
 */
export interface LegendSegment {
  readonly text: string;
  readonly bold?: boolean;
}

const SIM_ON_BASE_SEGMENTS: readonly LegendSegment[] = [
  { text: "Simulasi tangan", bold: true },
  { text: " · mouse = tangan (lihat kartu kamera) · " },
  { text: "tahan klik", bold: true },
  { text: " = cubit-tahan · tahan lalu geser = tarik · kursor cuma ada di kanvas" },
];
const SIM_ON_DEV_SUFFIX = " · H = mouse biasa";
const SIM_ON_SEGMENTS: readonly LegendSegment[] = [...SIM_ON_BASE_SEGMENTS, { text: SIM_ON_DEV_SUFFIX }];
const SIM_OFF_SEGMENTS: readonly LegendSegment[] = [
  { text: "Simulasi tangan mati", bold: true },
  { text: " · kursor mouse biasa · H = nyalakan lagi" },
];
const HAND_SEGMENTS: readonly LegendSegment[] = [
  { text: "Tangan kamera aktif", bold: true },
  { text: " · cubit dan tahan = pilih · cubit lalu geser = tarik · kursor cuma ada di kanvas" },
];

const joinSegments = (segments: readonly LegendSegment[]): string => segments.map((s) => s.text).join("");

/** hand.js:204-206 & §5.3.4 teks legenda tangan (satu sumber kebenaran, aman dirender di JSX). */
export const NUI_LEGEND = {
  simOnBaseSegments: SIM_ON_BASE_SEGMENTS,
  simOnDevSuffix: SIM_ON_DEV_SUFFIX,
  simOnSegments: SIM_ON_SEGMENTS,
  simOnPlain: joinSegments(SIM_ON_SEGMENTS),
  simOffSegments: SIM_OFF_SEGMENTS,
  simOffPlain: joinSegments(SIM_OFF_SEGMENTS),
  handSegments: HAND_SEGMENTS,
  handPlain: joinSegments(HAND_SEGMENTS),
} as const;

/** hand.css:51-54 keterangan kecil di bawah label ring sesuai aturan NUI. */
export const NUI_RULE_CAPTIONS = {
  A: "cubit dan tahan di mana aja",
  B: "dekatkan tangan ke sini",
  B_LIT: "cubit dan tahan",
  D: "tunjuk, cubit, tahan",
} as const;

/** ui.js:124,140,259 & kartu.js:89 label bawaan dan aria ring cubit. */
export const NUI_RING_COPY = {
  defaultLabel: "Cubit",
  ariaSuffix: ", cubit dan tahan",
  lockedLabel: "Coba dulu, ya",
} as const;

/** Status pelacakan tangan (hilang, ditahan saat T_gap, pemilik terkunci, fallback). */
export const NUI_HAND_STATUS = {
  open: "Tangan terbuka",
  pinching: "Mencubit",
  held: "Tangan terputus sebentar, posisi ditahan",
  lost: "Tangan tidak terlihat di kamera",
  ownerLocked: "Tangan utama terkunci",
  fallbackMouse: "Kendali berpindah ke mouse atau sentuh",
} as const;

/** Teks pratinjau/dev terkait NUI (PLAN §5.2 & onboarding/cam/index.html:453). */
export const NUI_DEV_COPY = {
  harnessUnavailable: "tidak tersedia",
  simPreview: "SIMULASI PRATINJAU",
} as const;

/** Port ui.js:140: membentuk aria-label ring cubit. */
export function ringAriaLabel(label?: string | null): string {
  return `${label ?? ""}${NUI_RING_COPY.ariaSuffix}`;
}

/** Port hand.css:51-54: keterangan ring menurut aturan aktif dan status menyala. */
export function ruleCaption(kind: RuleKind, lit: boolean): string {
  if (kind === "A") return NUI_RULE_CAPTIONS.A;
  if (kind === "D") return NUI_RULE_CAPTIONS.D;
  return lit ? NUI_RULE_CAPTIONS.B_LIT : NUI_RULE_CAPTIONS.B;
}

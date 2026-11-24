/**
 * R22B §7 Guided Capture Protocol (`?capture=1`) — pure deterministic protocol definition & masking helpers.
 *
 * Guarantees:
 *  - Exact §7 class sequence (12 classes × 6 variations × 6 s), 7 transition drills, and short left-hand round.
 *  - Every prompt step marks the first 700 ms and last 300 ms with `truthMasked = true` so human reaction /
 *    transition frames never contaminate supervised training labels.
 *  - Emits `labelSource = "DATASET_GT"`, `labelProvenance = "guided-capture-v1"`, `captureStep`, `variation`,
 *    `lighting` (`A-lampu-depan-mati` | `B-lampu-depan-nyala`), and `subjectCode` (`P1` | `P2`, zero names/PII).
 */

export const GUIDED_CAPTURE_PROVENANCE = "guided-capture-v1" as const;
export const GUIDED_MASK_START_MS = 700;
export const GUIDED_MASK_END_MS = 300;

export type CaptureSubjectCode = "P1" | "P2";
export type CaptureLightingCondition = "A-lampu-depan-mati" | "B-lampu-depan-nyala";
export type CaptureProtocolId = "p1-full" | "p2-short" | "p2-mini";

export type CaptureVariation =
  | "palm"
  | "back"
  | "side"
  | "moving"
  | "near-face"
  | "edge"
  | "transition"
  | "left-palm"
  | "left-back"
  | "left-side";

export interface GuidedCaptureStep {
  id: string;
  phase: "static" | "transition" | "left-hand";
  truthLabel: string;
  title: string;
  instruction: string;
  variation: CaptureVariation;
  variationLabel: string;
  durationMs: number;
  repetitions?: number;
}

const CLASS_DEFS: ReadonlyArray<{ label: string; title: string; instruction: string }> = [
  { label: "FIST", title: "Kepal (Batu)", instruction: "Kepalkan semua jari rapat, jempol menekuk di depan/samping." },
  { label: "PINCH_CLOSED", title: "Cubit Rapat (3 jari lipat)", instruction: "Tempelkan ujung jempol & telunjuk; jari tengah, manis, kelingking terlipat." },
  { label: "PINCH_OK", title: "Cubit OK (3 jari tegak)", instruction: "Tempelkan ujung jempol & telunjuk membentuk lingkaran; jari tengah, manis, kelingking tegak." },
  { label: "THREE_IMR", title: "3 Jari IMR (Telunjuk-Tengah-Manis)", instruction: "Angkat telunjuk, tengah, dan manis; jempol & kelingking terlipat (tanpa cubit)." },
  { label: "THREE_TIM", title: "3 Jari TIM (Jempol-Telunjuk-Tengah)", instruction: "Angkat jempol, telunjuk, dan tengah; jari manis & kelingking terlipat (tanpa cubit)." },
  { label: "THREE_MRP", title: "3 Jari MRP (Tengah-Manis-Kelingking)", instruction: "Angkat tengah, manis, dan kelingking; telunjuk ditekuk ke telapak (tanpa cubit OK)." },
  { label: "ONE", title: "1 Jari (Telunjuk)", instruction: "Angkat hanya jari telunjuk; jempol dan tiga jari lain terlipat." },
  { label: "TWO", title: "2 Jari (Telunjuk + Tengah)", instruction: "Angkat telunjuk dan jari tengah; jempol, manis, dan kelingking terlipat." },
  { label: "FIVE", title: "5 Jari (Telapak Terbuka)", instruction: "Buka lebar kelima jari (jempol sampai kelingking lurus)." },
  { label: "NEAR_PINCH", title: "Hampir Cubit (±1–2 cm)", instruction: "Dekatkan ujung jempol & telunjuk sekitar 1–2 cm, JANGAN bersentuhan." },
  { label: "OTHER", title: "Pose Lain (Bebas)", instruction: "Pose bebas: jempol atas, metal, telepon, atau 4 jari." },
  { label: "NO_HAND", title: "Tanpa Tangan", instruction: "Turunkan kedua tangan keluar dari area kamera." },
];

const VARIATION_DEFS: ReadonlyArray<{ id: CaptureVariation; label: string }> = [
  { id: "palm", label: "Telapak menghadap kamera" },
  { id: "back", label: "Punggung tangan menghadap kamera" },
  { id: "side", label: "Menyamping 45°" },
  { id: "moving", label: "Bergerak pelan kiri–kanan" },
  { id: "near-face", label: "Dekat wajah" },
  { id: "edge", label: "Dekat tepi frame" },
];

const TRANSITION_DRILLS: ReadonlyArray<{
  id: string;
  truthLabel: string;
  title: string;
  instruction: string;
  repetitions: number;
  durationMs: number;
}> = [
  {
    id: "drill-fist-one",
    truthLabel: "TRANSITION_FIST_ONE",
    title: "Transisi Kepal → 1 Jari (10×)",
    instruction: "Lakukan 10× siklus: kepal sebentar lalu buka 1 jari telunjuk (seperti Undo).",
    repetitions: 10,
    durationMs: 25_000,
  },
  {
    id: "drill-fist-two",
    truthLabel: "TRANSITION_FIST_TWO",
    title: "Transisi Kepal → 2 Jari (10×)",
    instruction: "Lakukan 10× siklus: kepal sebentar lalu buka 2 jari (seperti Redo).",
    repetitions: 10,
    durationMs: 25_000,
  },
  {
    id: "drill-one-fist",
    truthLabel: "TRANSITION_ONE_FIST",
    title: "Transisi 1 Jari → Kepal (5×)",
    instruction: "Lakukan 5× siklus: dari 1 jari kembali mengepal rapat.",
    repetitions: 5,
    durationMs: 14_000,
  },
  {
    id: "drill-open-pinch-closed-open",
    truthLabel: "TRANSITION_OPEN_PINCH_CLOSED_OPEN",
    title: "Transisi Buka → Cubit Rapat → Buka (10×)",
    instruction: "Lakukan 10× siklus: tangan terbuka → cubit rapat → lepas terbuka.",
    repetitions: 10,
    durationMs: 25_000,
  },
  {
    id: "drill-pinch-closed-ok",
    truthLabel: "TRANSITION_PINCH_CLOSED_PINCH_OK",
    title: "Transisi Cubit Rapat ↔ Cubit OK (10×)",
    instruction: "Lakukan 10× bolak-balik: cubit rapat ↔ cubit OK sambil mempertahankan kontak.",
    repetitions: 10,
    durationMs: 25_000,
  },
  {
    id: "drill-fist-pinch-closed",
    truthLabel: "TRANSITION_FIST_PINCH_CLOSED",
    title: "Transisi Kepal → Cubit Rapat Sengaja (10×)",
    instruction: "Lakukan 10× sengaja: dari kepal penuh langsung membuka ke cubit rapat untuk menggambar.",
    repetitions: 10,
    durationMs: 25_000,
  },
  {
    id: "drill-pinch-ok-five",
    truthLabel: "TRANSITION_PINCH_OK_FIVE",
    title: "Transisi Cubit OK ↔ 5 Jari Goyang (5×)",
    instruction: "Lakukan 5× siklus: cubit OK dengan lingkaran sedikit digoyang lalu buka jadi 5 jari.",
    repetitions: 5,
    durationMs: 15_000,
  },
];

const LEFT_HAND_CLASSES = ["FIST", "PINCH_CLOSED", "PINCH_OK", "THREE_IMR", "ONE", "TWO", "FIVE"] as const;
const LEFT_VARIATIONS: ReadonlyArray<{ id: CaptureVariation; label: string }> = [
  { id: "left-palm", label: "Tangan kiri · telapak menghadap kamera" },
  { id: "left-back", label: "Tangan kiri · punggung tangan" },
  { id: "left-side", label: "Tangan kiri · menyamping 45°" },
];

export function buildGuidedCaptureSteps(protocol: CaptureProtocolId = "p1-full"): GuidedCaptureStep[] {
  const steps: GuidedCaptureStep[] = [];
  const staticDurationMs = 6_000;

  if (protocol === "p2-mini") {
    // Lampiran C: Protokol p2-mini (±4 menit, 19 langkah, 138 detik waktu aksi)
    const p2MiniClasses = [
      "FIST",
      "PINCH_CLOSED",
      "PINCH_OK",
      "THREE_IMR",
      "ONE",
      "TWO",
      "FIVE",
    ] as const;
    const miniVars: ReadonlyArray<{ id: CaptureVariation; label: string }> = [
      { id: "palm", label: "Telapak menghadap kamera" },
      { id: "back", label: "Punggung tangan menghadap kamera" },
    ];
    for (const clsLabel of p2MiniClasses) {
      const cls = CLASS_DEFS.find((c) => c.label === clsLabel)!;
      for (const v of miniVars) {
        steps.push({
          id: `static-${cls.label}-${v.id}`,
          phase: "static",
          truthLabel: cls.label,
          title: cls.title,
          instruction: cls.instruction,
          variation: v.id,
          variationLabel: v.label,
          durationMs: staticDurationMs,
        });
      }
    }
    const noHand = CLASS_DEFS.find((c) => c.label === "NO_HAND")!;
    steps.push({
      id: `static-${noHand.label}-palm`,
      phase: "static",
      truthLabel: noHand.label,
      title: noHand.title,
      instruction: noHand.instruction,
      variation: "palm",
      variationLabel: "Adegan kosong tanpa tangan",
      durationMs: staticDurationMs,
    });
    const miniDrills = [
      {
        id: "drill-fist-one",
        truthLabel: "TRANSITION_FIST_ONE",
        title: "Transisi Kepal → 1 Jari (5×)",
        instruction: "Lakukan 5× siklus: kepal sebentar lalu buka 1 jari telunjuk (drill Undo).",
        repetitions: 5,
        durationMs: 12_000,
      },
      {
        id: "drill-fist-two",
        truthLabel: "TRANSITION_FIST_TWO",
        title: "Transisi Kepal → 2 Jari (5×)",
        instruction: "Lakukan 5× siklus: kepal sebentar lalu buka 2 jari (drill Redo).",
        repetitions: 5,
        durationMs: 12_000,
      },
      {
        id: "drill-open-pinch-closed-open",
        truthLabel: "TRANSITION_OPEN_PINCH_CLOSED_OPEN",
        title: "Transisi Buka → Cubit Rapat → Buka (5×)",
        instruction: "Lakukan 5× siklus: tangan terbuka → cubit rapat → lepas terbuka.",
        repetitions: 5,
        durationMs: 12_000,
      },
      {
        id: "drill-pinch-ok-five",
        truthLabel: "TRANSITION_PINCH_OK_FIVE",
        title: "Transisi Cubit OK ↔ 5 Jari Goyang (5×)",
        instruction: "Lakukan 5× siklus: cubit OK sedikit digoyang lalu buka jadi 5 jari.",
        repetitions: 5,
        durationMs: 12_000,
      },
    ];
    for (const d of miniDrills) {
      steps.push({
        id: d.id,
        phase: "transition",
        truthLabel: d.truthLabel,
        title: d.title,
        instruction: d.instruction,
        variation: "transition",
        variationLabel: `Drill transisi (${d.repetitions}×)`,
        durationMs: d.durationMs,
        repetitions: d.repetitions,
      });
    }
    return steps;
  }

  if (protocol === "p2-short") {
    // P2 concise protocol: condition B core variations (palm, back, side) + all 7 transition drills (~10 min)
    const coreVars = VARIATION_DEFS.slice(0, 3);
    for (const cls of CLASS_DEFS) {
      if (cls.label === "NO_HAND") {
        steps.push({
          id: `static-${cls.label}-palm`,
          phase: "static",
          truthLabel: cls.label,
          title: cls.title,
          instruction: cls.instruction,
          variation: "palm",
          variationLabel: "Adegan kosong tanpa tangan",
          durationMs: 12_000,
        });
        continue;
      }
      for (const v of coreVars) {
        steps.push({
          id: `static-${cls.label}-${v.id}`,
          phase: "static",
          truthLabel: cls.label,
          title: cls.title,
          instruction: cls.instruction,
          variation: v.id,
          variationLabel: v.label,
          durationMs: staticDurationMs,
        });
      }
    }
    for (const d of TRANSITION_DRILLS) {
      steps.push({
        id: d.id,
        phase: "transition",
        truthLabel: d.truthLabel,
        title: d.title,
        instruction: d.instruction,
        variation: "transition",
        variationLabel: `Drill transisi (${d.repetitions}×)`,
        durationMs: d.durationMs,
        repetitions: d.repetitions,
      });
    }
    return steps;
  }

  // Full P1 protocol (§7): 12 classes × 6 variations (6 s each) + 7 transition drills + short left-hand round
  for (const cls of CLASS_DEFS) {
    for (const v of VARIATION_DEFS) {
      steps.push({
        id: `static-${cls.label}-${v.id}`,
        phase: "static",
        truthLabel: cls.label,
        title: cls.title,
        instruction: cls.instruction,
        variation: v.id,
        variationLabel: cls.label === "NO_HAND" ? `Tanpa tangan (${v.label})` : v.label,
        durationMs: staticDurationMs,
      });
    }
  }

  for (const d of TRANSITION_DRILLS) {
    steps.push({
      id: d.id,
      phase: "transition",
      truthLabel: d.truthLabel,
      title: d.title,
      instruction: d.instruction,
      variation: "transition",
      variationLabel: `Drill transisi (${d.repetitions}×)`,
      durationMs: d.durationMs,
      repetitions: d.repetitions,
    });
  }

  for (const clsLabel of LEFT_HAND_CLASSES) {
    const cls = CLASS_DEFS.find((c) => c.label === clsLabel)!;
    for (const v of LEFT_VARIATIONS) {
      steps.push({
        id: `left-${cls.label}-${v.id}`,
        phase: "left-hand",
        truthLabel: cls.label,
        title: `${cls.title} (Tangan Kiri)`,
        instruction: cls.instruction,
        variation: v.id,
        variationLabel: v.label,
        durationMs: staticDurationMs,
      });
    }
  }

  return steps;
}

/**
 * Computes whether a frame at `elapsedMs` inside a prompt step of `durationMs` must be masked.
 * Per §B2.5: first 700 ms and last 300 ms of every prompt step are marked `truthMasked = true`.
 */
export function isGuidedCaptureFrameMasked(elapsedMs: number, durationMs: number): boolean {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(durationMs)) return true;
  if (elapsedMs < GUIDED_MASK_START_MS) return true;
  if (durationMs - elapsedMs <= GUIDED_MASK_END_MS) return true;
  return false;
}

export interface ActiveCaptureFrameTag {
  truth: string;
  truthMasked: boolean;
  labelProvenance: typeof GUIDED_CAPTURE_PROVENANCE;
  captureStep: string;
  variation: CaptureVariation;
  lighting: CaptureLightingCondition;
  subjectCode: CaptureSubjectCode;
}

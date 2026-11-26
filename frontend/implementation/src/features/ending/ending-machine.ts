import type { LevelRecap } from "@/src/components/ending/ending-types";
import { ENDING_AI_TALK_LINES, ENDING_FINISH_LINES } from "@/src/domain/copy/ending";
import type { AnchorName } from "@/src/features/shared/bubble-placement";

/**
 * State machine murni Penutup r8.3 (5 fase persis proto-html/r83/shared/end/end.js:67-182).
 * Tanpa ketergantungan DOM atau timer.
 */

export const ENDING_PHASES = ["payung", "kolam", "bicara", "rekap", "akhir"] as const;
export type EndingPhase = (typeof ENDING_PHASES)[number];

export type PayungSubPhase = "falling" | "landed";
export type KolamSubPhase = "walk" | "diving" | "emerged";
export type BicaraSubPhase = "walking-to-spot" | "turning" | "speaking" | "waiting-confirm";
export type RekapSubPhase = "intro" | "flying" | "counts" | "waiting-next";
export type AkhirSubPhase = "speaking" | "waiting-back";

export interface EndingMachineState {
  readonly phase: EndingPhase;
  readonly payungSubPhase: PayungSubPhase;
  readonly kolamSubPhase: KolamSubPhase;
  readonly bicaraSubPhase: BicaraSubPhase;
  readonly rekapSubPhase: RekapSubPhase;
  readonly akhirSubPhase: AkhirSubPhase;
  readonly thinmanAlive: boolean;
  readonly talkLineIndex: number;
  readonly finishLineIndex: number;
  readonly recapCount: number;
  readonly revealedRecapCount: number;
  readonly completed: boolean;
}

export type EndingEvent =
  | { type: "PAYUNG_TOUCHDOWN" }
  | { type: "PAYUNG_DONE" }
  | { type: "POND_REACHED" }
  | { type: "DIVE_DONE" }
  | { type: "KOLAM_DONE" }
  | { type: "BICARA_SPOT_REACHED" }
  | { type: "BICARA_TURN_DONE" }
  | { type: "BICARA_NEXT_LINE" }
  | { type: "BICARA_CONFIRMED" }
  | { type: "REKAP_INTRO_DONE" }
  | { type: "REKAP_ITEM_LANDED" }
  | { type: "REKAP_FLY_DONE" }
  | { type: "REKAP_COUNTS_DONE" }
  | { type: "REKAP_CONFIRMED" }
  | { type: "AKHIR_NEXT_LINE" }
  | { type: "AKHIR_CONFIRMED" }
  | { type: "SYNC_RECAP_COUNT"; recapCount: number }
  | { type: "RESET"; recapCount?: number; initialPhase?: EndingPhase };

export interface InitialEndingOptions {
  readonly recapCount?: number;
  readonly initialPhase?: EndingPhase;
}

function sanitizeCount(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

export function createInitialEndingState(options: InitialEndingOptions = {}): EndingMachineState {
  const phase: EndingPhase = options.initialPhase ?? "payung";
  const recapCount = sanitizeCount(options.recapCount);
  const alive = phase === "bicara" || phase === "rekap" || phase === "akhir";
  return {
    phase,
    payungSubPhase: "falling",
    kolamSubPhase: "walk",
    bicaraSubPhase: "walking-to-spot",
    rekapSubPhase: "intro",
    akhirSubPhase: "speaking",
    thinmanAlive: alive,
    talkLineIndex: 0,
    finishLineIndex: 0,
    recapCount,
    revealedRecapCount: 0,
    completed: false,
  };
}

export function canAdvanceEndingPhase(from: EndingPhase, to: EndingPhase): boolean {
  const i = ENDING_PHASES.indexOf(from);
  const j = ENDING_PHASES.indexOf(to);
  return i >= 0 && j === i + 1;
}

export function endingReducer(state: EndingMachineState, event: EndingEvent): EndingMachineState {
  switch (event.type) {
    case "RESET":
      return createInitialEndingState({
        recapCount: event.recapCount ?? state.recapCount,
        initialPhase: event.initialPhase ?? "payung",
      });

    case "SYNC_RECAP_COUNT": {
      const nextCount = sanitizeCount(event.recapCount);
      if (nextCount === state.recapCount) return state;
      return {
        ...state,
        recapCount: nextCount,
        revealedRecapCount: Math.min(state.revealedRecapCount, nextCount),
      };
    }

    case "PAYUNG_TOUCHDOWN":
      if (state.phase !== "payung" || state.payungSubPhase !== "falling") return state;
      return { ...state, payungSubPhase: "landed" };

    case "PAYUNG_DONE":
      if (state.phase !== "payung") return state;
      return { ...state, phase: "kolam", kolamSubPhase: "walk", thinmanAlive: false };

    case "POND_REACHED":
      if (state.phase !== "kolam" || state.kolamSubPhase !== "walk") return state;
      return { ...state, kolamSubPhase: "diving" };

    case "DIVE_DONE":
      if (state.phase !== "kolam" || state.kolamSubPhase !== "diving") return state;
      return { ...state, kolamSubPhase: "emerged", thinmanAlive: true };

    case "KOLAM_DONE":
      if (state.phase !== "kolam" || state.kolamSubPhase !== "emerged") return state;
      return {
        ...state,
        phase: "bicara",
        bicaraSubPhase: "walking-to-spot",
        thinmanAlive: true,
        talkLineIndex: 0,
      };

    case "BICARA_SPOT_REACHED":
      if (state.phase !== "bicara" || state.bicaraSubPhase !== "walking-to-spot") return state;
      return { ...state, bicaraSubPhase: "turning" };

    case "BICARA_TURN_DONE":
      if (state.phase !== "bicara" || state.bicaraSubPhase !== "turning") return state;
      return { ...state, bicaraSubPhase: "speaking", talkLineIndex: 0 };

    case "BICARA_NEXT_LINE": {
      if (state.phase !== "bicara" || state.bicaraSubPhase !== "speaking") return state;
      const lastIdx = ENDING_AI_TALK_LINES.length - 1;
      if (state.talkLineIndex < lastIdx) {
        return { ...state, talkLineIndex: state.talkLineIndex + 1 };
      }
      return { ...state, bicaraSubPhase: "waiting-confirm" };
    }

    case "BICARA_CONFIRMED":
      if (state.phase !== "bicara" || state.bicaraSubPhase !== "waiting-confirm") return state;
      return {
        ...state,
        phase: "rekap",
        rekapSubPhase: "intro",
        revealedRecapCount: 0,
      };

    case "REKAP_INTRO_DONE":
      if (state.phase !== "rekap" || state.rekapSubPhase !== "intro") return state;
      // Guard: jika data sesi kosong (recapCount === 0), lompat langsung ke ringkasan kosong yang jujur.
      if (state.recapCount === 0) {
        return { ...state, rekapSubPhase: "counts", revealedRecapCount: 0 };
      }
      return { ...state, rekapSubPhase: "flying", revealedRecapCount: 0 };

    case "REKAP_ITEM_LANDED": {
      if (state.phase !== "rekap" || state.rekapSubPhase !== "flying") return state;
      return { ...state, revealedRecapCount: Math.min(state.recapCount, state.revealedRecapCount + 1) };
    }

    case "REKAP_FLY_DONE":
      if (state.phase !== "rekap" || state.rekapSubPhase !== "flying") return state;
      return { ...state, rekapSubPhase: "counts", revealedRecapCount: state.recapCount };

    case "REKAP_COUNTS_DONE":
      if (state.phase !== "rekap" || state.rekapSubPhase !== "counts") return state;
      return { ...state, rekapSubPhase: "waiting-next" };

    case "REKAP_CONFIRMED":
      if (state.phase !== "rekap" || state.rekapSubPhase !== "waiting-next") return state;
      return {
        ...state,
        phase: "akhir",
        akhirSubPhase: "speaking",
        finishLineIndex: 0,
      };

    case "AKHIR_NEXT_LINE": {
      if (state.phase !== "akhir" || state.akhirSubPhase !== "speaking") return state;
      const lastIdx = ENDING_FINISH_LINES.length - 1;
      if (state.finishLineIndex < lastIdx) {
        return { ...state, finishLineIndex: state.finishLineIndex + 1 };
      }
      return { ...state, akhirSubPhase: "waiting-back" };
    }

    case "AKHIR_CONFIRMED":
      if (state.phase !== "akhir" || state.akhirSubPhase !== "waiting-back" || state.completed) {
        return state;
      }
      return { ...state, completed: true };
  }
}

export function isEndingJoystickEnabled(state: EndingMachineState): boolean {
  return state.phase === "kolam" && state.kolamSubPhase === "walk";
}

export function isEndingFrontRigActive(state: EndingMachineState): boolean {
  if (state.phase === "bicara") {
    return state.bicaraSubPhase === "speaking" || state.bicaraSubPhase === "waiting-confirm";
  }
  return state.phase === "rekap" || state.phase === "akhir";
}

export function getEndingMomoAnchor(state: EndingMachineState): AnchorName {
  return state.phase === "payung" || state.phase === "kolam" ? "corner" : "ending";
}

function parseLevelOrder(recap: LevelRecap, fallbackIndex: number): number {
  const fromId = /(\d+)/.exec(recap.levelId);
  if (fromId?.[1]) return Number(fromId[1]);
  const fromTitle = /(\d+)/.exec(recap.title);
  if (fromTitle?.[1]) return Number(fromTitle[1]);
  return Number.MAX_SAFE_INTEGER - 1000 + fallbackIndex;
}

export function sortRecapsByLevel(recaps: readonly LevelRecap[]): LevelRecap[] {
  return recaps
    .map((recap, idx) => ({ recap, idx, order: parseLevelOrder(recap, idx) }))
    .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.idx - b.idx))
    .map((entry) => entry.recap);
}

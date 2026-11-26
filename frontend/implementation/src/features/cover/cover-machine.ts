import { COVER_CAMERA_ERROR_COPY, COVER_INTRO_COPY } from "@/src/domain/copy/cover";
import { normalizeName } from "./name/normalize-name";

export const COVER_PHASES = [
  "sleep",
  "gate",
  "camera-on",
  "wake",
  "intro",
  "ayo",
  "book-curl",
  "name",
  "name-confirm",
  "name-exit",
  "ruler",
  "handoff",
] as const;

export type CoverPhase = (typeof COVER_PHASES)[number];

export type GateState = 0 | 1 | 2;
export type GateNudge = "unchecked" | "need-go" | null;
export type CoverCameraStatus = "idle" | "requesting" | "live" | "denied" | "unavailable";

export interface CoverMachineState {
  readonly phase: CoverPhase;
  readonly hasJoinToken: boolean;
  readonly gateState: GateState;
  readonly gateNudge: GateNudge;
  readonly cameraStatus: CoverCameraStatus;
  readonly cameraError: string | null;
  readonly fallbackAvailable: boolean;
  readonly fallbackMode: boolean;
  readonly introLineIndex: number;
  readonly studentName: string;
  readonly needsRuler: boolean;
  readonly skipNameStep: boolean;
  /** True bila langkah nama dilewati tombol "Lewati" tanpa nama: jangan dipakai bergabung ke kelas. */
  readonly demoName?: boolean;
}

/** Nama pengganti saat langkah nama dilewati (sama dengan sandbox). */
export const SKIP_PLACEHOLDER_NAME = "Teman";

export interface CreateInitialCoverOptions {
  readonly hasJoinToken: boolean;
  readonly initialPhase?: CoverPhase;
  readonly initialStudentName?: string;
  readonly skipNameStep?: boolean;
}

export type CoverAction =
  | { readonly type: "CAMERA_TOGGLE_LOCKED" }
  | { readonly type: "GATE_CHECK"; readonly checked: boolean }
  | { readonly type: "GATE_CONFIRM" }
  | { readonly type: "CAMERA_REQUEST" }
  | { readonly type: "CAMERA_READY" }
  | { readonly type: "CAMERA_STOPPED" }
  | { readonly type: "CAMERA_DENIED"; readonly error?: string }
  | { readonly type: "CAMERA_UNAVAILABLE"; readonly error?: string }
  | { readonly type: "CONTINUE_WITHOUT_CAMERA" }
  | { readonly type: "WAKE_DONE" }
  | { readonly type: "INTRO_NEXT" }
  | { readonly type: "INTRO_DONE" }
  | { readonly type: "AYO_CONFIRMED" }
  | { readonly type: "BOOK_CURL_DONE" }
  | { readonly type: "NAME_CAPTURED"; readonly name: string }
  | { readonly type: "NAME_RETRY" }
  | { readonly type: "NAME_CONFIRMED" }
  | { readonly type: "NAME_EXIT_DONE" }
  | { readonly type: "RULER_DONE" }
  | { readonly type: "SYNC_IDENTITY"; readonly studentName?: string; readonly skipNameStep?: boolean }
  | { readonly type: "SKIP_STEP" }
  | { readonly type: "RESET" };

const INTRO_LINE_COUNT = COVER_INTRO_COPY.lines.length;

function gateStateForPhase(phase: CoverPhase): GateState {
  if (phase === "sleep") return 0;
  if (phase === "gate") return 1;
  return 2;
}

export function createInitialCoverState(options: CreateInitialCoverOptions): CoverMachineState {
  const phase = options.initialPhase ?? "sleep";
  const studentName = normalizeName(options.initialStudentName ?? "");
  const skipNameStep = Boolean(
    options.skipNameStep ?? (options.initialStudentName && options.initialStudentName.trim().length > 0),
  );
  return {
    phase,
    hasJoinToken: Boolean(options.hasJoinToken),
    gateState: gateStateForPhase(phase),
    gateNudge: null,
    cameraStatus: phase === "sleep" || phase === "gate" ? "idle" : "live",
    cameraError: null,
    fallbackAvailable: false,
    fallbackMode: false,
    introLineIndex: phase === "ayo" ? INTRO_LINE_COUNT - 1 : 0,
    studentName,
    needsRuler: Boolean(options.hasJoinToken),
    skipNameStep,
  };
}

/** Fase setelah kamera menyala atau fallback dipilih: NUI (cubit / simulasi mouse) aktif. */
export function isNuiActivePhase(phase: CoverPhase): boolean {
  return phase !== "sleep" && phase !== "gate" && phase !== "camera-on";
}

/** Fase saat `#book` (halaman dalam & animasi curl) berada di layar. */
export function isBookVisiblePhase(phase: CoverPhase): boolean {
  return (
    phase === "book-curl" ||
    phase === "name" ||
    phase === "name-confirm" ||
    phase === "name-exit" ||
    phase === "ruler"
  );
}

/**
 * Mesin fase murni alur sampul r8.3:
 * `sleep -> gate -> camera-on -> wake -> intro -> ayo -> book-curl -> name -> name-confirm -> name-exit -> (ruler) -> handoff`.
 * Menjamin ZERO dead-end: kamera ditolak atau tidak tersedia selalu membuka jalur mouse/sentuh.
 */
export function coverReducer(state: CoverMachineState, action: CoverAction): CoverMachineState {
  switch (action.type) {
    case "RESET":
      return createInitialCoverState({
        hasJoinToken: state.hasJoinToken,
        initialStudentName: state.studentName,
        skipNameStep: state.skipNameStep,
      });

    case "CAMERA_TOGGLE_LOCKED": {
      if (state.phase === "sleep" || state.gateState === 0) return { ...state, gateNudge: "unchecked" };
      if (state.phase === "gate" && state.gateState === 1) return { ...state, gateNudge: "need-go" };
      return state;
    }

    case "GATE_CHECK": {
      if (state.phase === "sleep" && action.checked) return { ...state, phase: "gate", gateState: 1, gateNudge: null };
      if (state.phase === "gate" && state.gateState === 1 && !action.checked) {
        return { ...state, phase: "sleep", gateState: 0, gateNudge: null };
      }
      return state;
    }

    case "GATE_CONFIRM": {
      if (state.phase === "gate" && state.gateState === 1) return { ...state, gateState: 2, gateNudge: null };
      return state;
    }

    case "CAMERA_REQUEST": {
      const canRequestFromGate = state.phase === "gate" && state.gateState === 2;
      const canRetryFromCam = state.phase === "camera-on";
      if (!canRequestFromGate && !canRetryFromCam) return state;
      return { ...state, phase: "camera-on", cameraStatus: "requesting", cameraError: null, gateNudge: null };
    }

    case "CAMERA_READY": {
      if (state.phase !== "camera-on" && !(state.phase === "gate" && state.gateState === 2)) return state;
      return { ...state, phase: "wake", cameraStatus: "live", cameraError: null, fallbackMode: false };
    }

    case "CAMERA_STOPPED": {
      if (state.phase === "camera-on") return { ...state, phase: "gate", cameraStatus: "idle", cameraError: null };
      if (!isNuiActivePhase(state.phase)) return state;
      return { ...state, cameraStatus: "idle" };
    }

    case "CAMERA_DENIED": {
      if (state.phase !== "camera-on" && !(state.phase === "gate" && state.gateState === 2)) return state;
      return {
        ...state,
        phase: "camera-on",
        cameraStatus: "denied",
        cameraError: action.error ?? COVER_CAMERA_ERROR_COPY["permission-denied"],
        fallbackAvailable: true,
      };
    }

    case "CAMERA_UNAVAILABLE": {
      if (state.phase !== "camera-on" && !(state.phase === "gate" && state.gateState === 2)) return state;
      return {
        ...state,
        phase: "camera-on",
        cameraStatus: "unavailable",
        cameraError: action.error ?? COVER_CAMERA_ERROR_COPY["camera-unavailable"],
        fallbackAvailable: true,
      };
    }

    case "CONTINUE_WITHOUT_CAMERA": {
      const canFallback =
        state.phase === "camera-on" ||
        (state.phase === "gate" && state.gateState === 2 && state.fallbackAvailable);
      if (!canFallback) return state;
      return { ...state, phase: "wake", fallbackAvailable: true, fallbackMode: true };
    }

    case "WAKE_DONE": {
      if (state.phase !== "wake") return state;
      return { ...state, phase: "intro", introLineIndex: 0 };
    }

    case "INTRO_NEXT": {
      if (state.phase !== "intro") return state;
      const nextIdx = state.introLineIndex + 1;
      if (nextIdx >= INTRO_LINE_COUNT) {
        return { ...state, phase: "ayo", introLineIndex: INTRO_LINE_COUNT - 1 };
      }
      return { ...state, introLineIndex: nextIdx };
    }

    case "INTRO_DONE": {
      if (state.phase !== "intro") return state;
      return { ...state, phase: "ayo", introLineIndex: INTRO_LINE_COUNT - 1 };
    }

    case "AYO_CONFIRMED": {
      if (state.phase !== "ayo") return state;
      return { ...state, phase: "book-curl" };
    }

    case "BOOK_CURL_DONE": {
      if (state.phase !== "book-curl") return state;
      if (state.skipNameStep) {
        return { ...state, phase: "handoff", needsRuler: false };
      }
      return { ...state, phase: "name" };
    }

    case "NAME_CAPTURED": {
      if (state.phase !== "name") return state;
      const cleaned = normalizeName(action.name);
      if (!cleaned) return state;
      return { ...state, phase: "name-confirm", studentName: cleaned };
    }

    case "NAME_RETRY": {
      if (state.phase !== "name-confirm") return state;
      return { ...state, phase: "name", studentName: "" };
    }

    case "NAME_CONFIRMED": {
      if (state.phase !== "name-confirm" || !state.studentName) return state;
      return { ...state, phase: "name-exit" };
    }

    case "NAME_EXIT_DONE": {
      if (state.phase !== "name-exit") return state;
      if (state.hasJoinToken) {
        return { ...state, phase: "ruler", needsRuler: true };
      }
      return { ...state, phase: "handoff", needsRuler: false };
    }

    case "RULER_DONE": {
      if (state.phase !== "ruler") return state;
      return { ...state, phase: "handoff" };
    }

    case "SYNC_IDENTITY": {
      const cleaned = normalizeName(action.studentName ?? "");
      const nextSkip = Boolean(action.skipNameStep ?? cleaned.length > 0);
      if (cleaned === state.studentName && nextSkip === state.skipNameStep) return state;
      return { ...state, studentName: cleaned || state.studentName, skipNameStep: nextSkip };
    }

    case "SKIP_STEP": {
      // Paritas sandbox: satu tekanan hanya menyelesaikan satu kelompok adegan.
      if (state.phase === "sleep" || state.phase === "gate" || state.phase === "camera-on") {
        // Momo dibangunkan tanpa meminta izin kamera (kamera sandbox cuma simulasi).
        return {
          ...state, phase: "wake", gateState: 2, gateNudge: null, cameraError: null,
          fallbackAvailable: true, fallbackMode: true,
        };
      }
      if (state.phase === "wake" || state.phase === "intro" || state.phase === "ayo") {
        return { ...state, phase: "book-curl", introLineIndex: INTRO_LINE_COUNT - 1 };
      }
      if (state.phase === "book-curl") {
        return state.skipNameStep
          ? { ...state, phase: "handoff", needsRuler: false }
          : { ...state, phase: "name" };
      }
      if (state.phase === "handoff") return state;
      return {
        ...state, phase: "handoff", needsRuler: false,
        studentName: state.studentName || SKIP_PLACEHOLDER_NAME,
        ...(state.studentName ? {} : { demoName: true }),
      };
    }
  }
}

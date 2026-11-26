/**
 * Pure state machine & layout math for r8.3 TutorialScreen (P4).
 * Reuses CARD_READ_MS & cardGate/cardPhase/startCardGate from tutorial-card-gate,
 * TUTORIAL_TIMING from tutorial-timing, and WALK_* math from tutorial-walk.
 */
import {
  cardGate,
  cardPhase,
  startCardGate,
  type CardEvent,
  type CardGate,
  type CardIndex,
} from "@/src/components/onboarding/tutorial-card-gate";
import { TUTORIAL_TIMING } from "@/src/components/onboarding/tutorial-timing";
import {
  advanceWalkPhase,
  clampWalk,
  KEY_STEP,
  TUTORIAL_STRIDE_PCT,
  WALK_END,
  WALK_START,
} from "@/src/components/onboarding/tutorial-walk";
import { clamp } from "@/src/features/shared/bubble-placement";
import { CARD_READ_MS, FIGURE_FPS, TUTORIAL_TOOLS_REQUIRED } from "@/src/nui/core/constants";

export {
  advanceWalkPhase,
  CARD_READ_MS,
  cardGate,
  cardPhase,
  clampWalk,
  FIGURE_FPS,
  KEY_STEP,
  startCardGate,
  TUTORIAL_STRIDE_PCT,
  TUTORIAL_TIMING,
  TUTORIAL_TOOLS_REQUIRED,
  WALK_END,
  WALK_START,
  type CardEvent,
  type CardGate,
  type CardIndex,
};

export const TUTORIAL_CARD_INDICES: readonly CardIndex[] = [0, 1, 2] as const;
export const FAN_ROTATIONS: readonly [number, number, number] = [-5, 1.5, 5.5] as const;
export const TUTORIAL_MOMO_INTRO_MS = 950;
export const TUTORIAL_MOMO_GREET_MS = 3000;
export const TUTORIAL_BUBBLE_HIDE_MS = 220;
export const TUTORIAL_TOP_ROOM_PX = 46;
export const TUTORIAL_BOTTOM_RESERVE = 0.22;
export const TUTORIAL_LINE_MIN_MS = 1700;
export const TUTORIAL_LINE_MAX_MS = 3600;
export const TUTORIAL_LINE_MS_PER_CHAR = 55;

export interface R83TutorialLayout {
  readonly gw: number;
  readonly pw: number;
  readonly oh: number;
  readonly fit: number;
  readonly s0: number;
  readonly gap: number;
  readonly mini: number;
  readonly miniGap: number;
  readonly miniY: number;
  readonly cy: number;
  readonly vh: number;
}

/** Exact port of sandbox kartu.js:18-23 layout math (46px top room for hint chip, rowCentre - 10). */
export function computeTutorialLayout(vw: number, vh: number): R83TutorialLayout {
  const safeVw = Math.max(320, vw);
  const safeVh = Math.max(360, vh);
  const gw = Math.round(clamp(safeVw * 0.3, 320, 480));
  const pw = Math.round(gw * 1.6);
  const oh = Math.round(clamp(safeVh * 0.76, 480, 720));
  const top = Math.max(safeVh * 0.04, TUTORIAL_TOP_ROOM_PX);
  const freeH = safeVh - safeVh * TUTORIAL_BOTTOM_RESERVE - top;
  const fit = Math.min(1, (safeVw * 0.94) / (gw + pw), freeH / oh);
  const cy = top + (oh * fit) / 2;
  const closedW = Math.min(214, Math.max(150, safeVw * 0.17));
  const rowCentre = safeVh * (1 - TUTORIAL_BOTTOM_RESERVE / 2) - 10;
  return {
    gw,
    pw,
    oh,
    fit,
    s0: closedW / gw,
    gap: closedW * 1.1,
    mini: 46 / gw,
    miniGap: 62,
    miniY: rowCentre - cy,
    cy,
    vh: safeVh,
  };
}

export function cardRestTransform(index: CardIndex, layout: R83TutorialLayout) {
  return {
    x: (index - 1) * layout.miniGap,
    y: layout.miniY,
    rotation: 0,
    scale: layout.mini,
    opacity: 1,
  } as const;
}

export function speechLineDelayMs(line: string): number {
  return clamp(line.length * TUTORIAL_LINE_MS_PER_CHAR, TUTORIAL_LINE_MIN_MS, TUTORIAL_LINE_MAX_MS);
}

export type TutorialStagePhase = "intro-mid" | "intro-strip" | "dealing" | "card-active" | "exiting" | "done";

export interface TutorialFlowState {
  readonly stage: TutorialStagePhase;
  readonly activeCard: CardIndex;
  readonly completedCards: readonly boolean[];
  readonly gates: readonly [CardGate, CardGate, CardGate];
}

export type TutorialFlowAction =
  | { readonly type: "INTRO_TO_STRIP" }
  | { readonly type: "DEAL_STARTED" }
  | { readonly type: "CARD_OPENED"; readonly index: CardIndex }
  | { readonly type: "MOMO_DONE"; readonly index: CardIndex }
  | { readonly type: "PRACTICE_DONE"; readonly index: CardIndex }
  | { readonly type: "READ_DONE"; readonly index: CardIndex }
  | { readonly type: "THUMB"; readonly index: CardIndex }
  | { readonly type: "EXIT_DONE" };

export function createTutorialFlowState(initialCard: CardIndex = 0): TutorialFlowState {
  return {
    stage: "intro-mid",
    activeCard: initialCard,
    completedCards: [initialCard > 0, initialCard > 1, false],
    gates: [startCardGate(0), startCardGate(1), startCardGate(2)],
  };
}

function updateGate(
  gates: readonly [CardGate, CardGate, CardGate],
  index: CardIndex,
  event: CardEvent,
): readonly [CardGate, CardGate, CardGate] {
  const next = cardGate(gates[index], event);
  if (next === gates[index]) return gates;
  const copy: [CardGate, CardGate, CardGate] = [gates[0], gates[1], gates[2]];
  copy[index] = next;
  return copy;
}

export function tutorialFlowReducer(state: TutorialFlowState, action: TutorialFlowAction): TutorialFlowState {
  switch (action.type) {
    case "INTRO_TO_STRIP":
      return state.stage === "intro-mid" ? { ...state, stage: "intro-strip" } : state;
    case "DEAL_STARTED":
      return state.stage === "intro-mid" || state.stage === "intro-strip" ? { ...state, stage: "dealing" } : state;
    case "CARD_OPENED": {
      const gates = updateGate(state.gates, action.index, { type: "OPENED", index: action.index });
      return { ...state, stage: "card-active", activeCard: action.index, gates };
    }
    case "MOMO_DONE": {
      const gates = updateGate(state.gates, action.index, { type: "MOMO_DONE", index: action.index });
      return gates === state.gates ? state : { ...state, gates };
    }
    case "PRACTICE_DONE": {
      const gates = updateGate(state.gates, action.index, { type: "PRACTICE_DONE", index: action.index });
      return gates === state.gates ? state : { ...state, gates };
    }
    case "READ_DONE": {
      const gates = updateGate(state.gates, action.index, { type: "READ_DONE", index: action.index });
      return gates === state.gates ? state : { ...state, gates };
    }
    case "THUMB": {
      const gates = updateGate(state.gates, action.index, { type: "THUMB", index: action.index });
      if (gates === state.gates) return state;
      const completed = [...state.completedCards];
      completed[action.index] = true;
      return {
        ...state,
        completedCards: completed,
        stage: action.index === 2 ? "exiting" : state.stage,
        gates,
      };
    }
    case "EXIT_DONE":
      return { ...state, stage: "done" };
  }
}

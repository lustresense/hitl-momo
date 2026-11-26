import { formatLockedLevelMessage } from "@/src/domain/copy/levels";
import {
  CLICK_SUPPRESS_PX,
  LOCKED_TUG_MIN_PX,
  NOTCHES_TO_ARM,
  computeNotchCount,
  computePullProgress,
  computeRawPull,
  computeVisualPull,
  selectNearestRibbon,
  type RibbonRectLike,
} from "./ribbon-layout";

export * from "./ribbon-layout";

export interface RibbonSlotMeta {
  readonly stage: number;
  readonly locked: boolean;
  readonly restLength: number;
}

export interface ActiveRibbonDrag {
  readonly stage: number;
  readonly startY: number;
  readonly raw: number;
  readonly pull: number;
  readonly notch: number;
  readonly armed: boolean;
  readonly progress: number;
  readonly locked: boolean;
  readonly pointerId?: number | string;
}

export interface RibbonPullState {
  readonly litStage: number | null;
  readonly activeDrag: ActiveRibbonDrag | null;
  readonly launching: boolean;
}

export interface RibbonPullMoveResult {
  readonly stage: number;
  readonly raw: number;
  readonly pull: number;
  readonly length: number;
  readonly notch: number;
  readonly notchIncreased: boolean;
  readonly armed: boolean;
  readonly armedChanged: boolean;
  readonly progress: number;
  readonly locked: boolean;
}

export type RibbonPullReleaseResult =
  | { readonly action: "none" }
  | { readonly action: "launch"; readonly stage: number; readonly restLength: number; readonly fromLength: number }
  | { readonly action: "rebound"; readonly stage: number; readonly restLength: number; readonly fromLength: number }
  | {
      readonly action: "rebound-locked";
      readonly stage: number;
      readonly restLength: number;
      readonly fromLength: number;
      readonly tugged: boolean;
      readonly message: string;
    };

export type RibbonActivateResult =
  | { readonly action: "ignored" }
  | { readonly action: "launch"; readonly stage: number }
  | { readonly action: "locked"; readonly stage: number; readonly message: string };

export type RibbonKeyResult =
  | { readonly action: "ignored" }
  | { readonly action: "focus"; readonly stage: number }
  | { readonly action: "launch"; readonly stage: number }
  | { readonly action: "locked"; readonly stage: number; readonly message: string };

export interface RibbonPullController {
  setSlots(slots: readonly RibbonSlotMeta[]): void;
  hoverAt(rects: readonly RibbonRectLike[], x: number, y?: number): number | null;
  focusStage(stage: number | null): number | null;
  beginPull(stage: number, startY: number, pointerId?: number | string): boolean;
  beginVirtualPull(
    rects: readonly RibbonRectLike[],
    x: number,
    startY: number,
    y?: number,
    pointerId?: number | string,
  ): number | null;
  movePull(currentY: number, pointerId?: number | string): RibbonPullMoveResult | null;
  endPull(cancelled?: boolean, pointerId?: number | string): RibbonPullReleaseResult;
  consumeSuppressedClick(stage: number): boolean;
  activate(stage: number): RibbonActivateResult;
  handleKeyDown(key: string): RibbonKeyResult;
  resetLaunch(): void;
  getState(): Readonly<RibbonPullState>;
}

/** Mesin murni tarik pita bookmark r8.3 (tanpa DOM/React). */
export function createRibbonPullController(
  initialSlots: readonly RibbonSlotMeta[],
  initialLitStage: number | null = null,
): RibbonPullController {
  let slots = [...initialSlots];
  let litStage: number | null = initialLitStage;
  let launching = false;
  let suppressedStage: number | null = null;
  let drag: {
    stage: number;
    startY: number;
    raw: number;
    pull: number;
    notch: number;
    armed: boolean;
    progress: number;
    locked: boolean;
    restLength: number;
    pointerId?: number | string;
  } | null = null;

  const findSlot = (stage: number | null): RibbonSlotMeta | undefined =>
    stage === null ? undefined : slots.find((s) => s.stage === stage);

  const activateSlot = (stage: number): RibbonActivateResult => {
    if (launching) return { action: "ignored" };
    const slot = findSlot(stage);
    if (!slot) return { action: "ignored" };
    if (slot.locked) {
      return { action: "locked", stage: slot.stage, message: formatLockedLevelMessage(slot.stage) };
    }
    launching = true;
    return { action: "launch", stage: slot.stage };
  };

  const startDrag = (slot: RibbonSlotMeta, startY: number, pointerId?: number | string): void => {
    litStage = slot.stage;
    if (suppressedStage === slot.stage) suppressedStage = null;
    drag = {
      stage: slot.stage,
      startY,
      raw: 0,
      pull: 0,
      notch: 0,
      armed: false,
      progress: 0,
      locked: slot.locked,
      restLength: slot.restLength,
      pointerId,
    };
  };

  return {
    setSlots(nextSlots) {
      slots = [...nextSlots];
      if (litStage !== null && !findSlot(litStage)) litStage = slots[0]?.stage ?? null;
      if (drag) {
        const updated = findSlot(drag.stage);
        if (updated) {
          drag.restLength = updated.restLength;
          drag.locked = updated.locked;
        }
      }
    },

    hoverAt(rects, x, y) {
      if (launching || drag) return litStage;
      const picked = selectNearestRibbon(rects, x, y);
      if (picked) litStage = picked.stage;
      return litStage;
    },

    focusStage(stage) {
      if (stage === null) return (litStage = null);
      if (!findSlot(stage)) return litStage;
      return (litStage = stage);
    },

    beginPull(stage, startY, pointerId) {
      if (launching || drag) return false;
      const slot = findSlot(stage);
      if (!slot || !Number.isFinite(startY)) return false;
      startDrag(slot, startY, pointerId);
      return true;
    },

    beginVirtualPull(rects, x, startY, y, pointerId) {
      if (launching || drag || !Number.isFinite(startY)) return null;
      const picked = selectNearestRibbon(rects, x, y);
      const slot = findSlot(picked?.stage ?? litStage);
      if (!slot) return null;
      startDrag(slot, startY, pointerId);
      return slot.stage;
    },

    movePull(currentY, pointerId) {
      if (!drag) return null;
      if (pointerId !== undefined && drag.pointerId !== undefined && drag.pointerId !== pointerId) return null;
      const raw = computeRawPull(drag.startY, currentY);
      drag.raw = raw;
      if (raw > CLICK_SUPPRESS_PX) suppressedStage = drag.stage;
      const pull = computeVisualPull(raw, drag.locked);
      const notch = computeNotchCount(raw, drag.locked);
      const progress = computePullProgress(raw, drag.locked);
      const armed = !drag.locked && notch >= NOTCHES_TO_ARM;
      const notchIncreased = notch > drag.notch;
      const armedChanged = armed !== drag.armed;
      drag.pull = pull;
      drag.notch = notch;
      drag.progress = progress;
      drag.armed = armed;
      return { stage: drag.stage, raw, pull, length: drag.restLength + pull, notch, notchIncreased, armed, armedChanged, progress, locked: drag.locked };
    },

    endPull(cancelled = false, pointerId) {
      if (!drag) return { action: "none" };
      if (pointerId !== undefined && drag.pointerId !== undefined && drag.pointerId !== pointerId) return { action: "none" };
      const finished = drag;
      drag = null;
      const fromLength = finished.restLength + finished.pull;
      if (finished.locked) {
        return {
          action: "rebound-locked",
          stage: finished.stage,
          restLength: finished.restLength,
          fromLength,
          tugged: !cancelled && finished.raw > LOCKED_TUG_MIN_PX,
          message: formatLockedLevelMessage(finished.stage),
        };
      }
      if (!cancelled && finished.notch >= NOTCHES_TO_ARM) {
        launching = true;
        return { action: "launch", stage: finished.stage, restLength: finished.restLength, fromLength };
      }
      return { action: "rebound", stage: finished.stage, restLength: finished.restLength, fromLength };
    },

    consumeSuppressedClick(stage) {
      if (suppressedStage !== stage) return false;
      suppressedStage = null;
      return true;
    },

    activate: activateSlot,

    handleKeyDown(key) {
      if (launching || slots.length === 0) return { action: "ignored" };
      if (key === "ArrowRight") {
        const idx = litStage === null ? -1 : slots.findIndex((s) => s.stage === litStage);
        const next = slots[idx < 0 ? 0 : Math.min(slots.length - 1, idx + 1)];
        return next ? ((litStage = next.stage), { action: "focus", stage: next.stage }) : { action: "ignored" };
      }
      if (key === "ArrowLeft") {
        const idx = litStage === null ? slots.length : slots.findIndex((s) => s.stage === litStage);
        const prev = slots[idx >= slots.length ? slots.length - 1 : Math.max(0, idx - 1)];
        return prev ? ((litStage = prev.stage), { action: "focus", stage: prev.stage }) : { action: "ignored" };
      }
      if (key === "Enter" || key === " ") {
        const target = litStage ?? slots.find((s) => !s.locked)?.stage ?? slots[0]?.stage;
        if (target === undefined) return { action: "ignored" };
        litStage = target;
        return activateSlot(target);
      }
      if (key === "1" || key === "2" || key === "3") {
        const slot = slots[Number(key) - 1];
        if (!slot) return { action: "ignored" };
        litStage = slot.stage;
        return activateSlot(slot.stage);
      }
      return { action: "ignored" };
    },

    resetLaunch() {
      launching = false;
      drag = null;
    },

    getState() {
      return { litStage, launching, activeDrag: drag ? { ...drag } : null };
    },
  };
}

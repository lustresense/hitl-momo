"use client";

import { useRef } from "react";
import type { LevelEntryScreenProps } from "@/src/app/screens/LevelEntryScreen";
import { PageEdgeWalkers } from "@/src/components/level/PageEdgeWalkers";
import { OwnerIcon } from "@/src/components/ui/owner-icons";
import { LEVEL_SELECT_COPY } from "@/src/domain/copy/levels";
import { LEVELS, type LevelDefinition } from "@/src/domain/levels";
import { MomoStage, R83Bubble, ScreenFrame, type MomoStageHandle } from "@/src/features/shared";
import { HandLegend, NuiProvider, useOptionalNui } from "@/src/nui";
import { RibbonSlot } from "./RibbonSlot";
import { useRibbonShelf } from "./useRibbonShelf";
import "./level-select.css";

export interface LevelSelectScreenProps extends LevelEntryScreenProps {
  /** Tahap yang sudah selesai (opsional; default membaca `isStageCompleted` dari level-progress). */
  readonly completedStages?: ReadonlySet<number>;
  /** Nama siswa opsional untuk konsistensi shell alur r8.3. */
  readonly studentName?: string;
  /** Override daftar level (opsional; default memakai `LEVELS` dari domain). */
  readonly levels?: readonly LevelDefinition[];
  /** Override tahap yang baru terbuka (opsional; default memakai `consumeFreshUnlock()`). */
  readonly freshUnlockStage?: number | null;
}

const SPIRAL_RING_COUNT = 28;

function LevelSelectInner({
  entryHold,
  onSelectLevel,
  isLevelUnlocked,
  finished = false,
  completedStages,
  levels = LEVELS,
  freshUnlockStage,
}: LevelSelectScreenProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const statusChipRef = useRef<HTMLSpanElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);
  const momoRef = useRef<MomoStageHandle | null>(null);

  const shelf = useRibbonShelf({
    rootRef,
    statusChipRef,
    hintRef,
    momoRef,
    levels,
    isLevelUnlocked,
    completedStages,
    freshUnlockStage,
    entryHold,
    onSelectLevel,
  });

  return (
    <ScreenFrame
      variant="page"
      testId="r83-level-select-screen"
      ariaLabel={LEVEL_SELECT_COPY.screenLabel}
    >
      <div
        ref={rootRef}
        className="level-ribbon-page bm-page"
        aria-label={LEVEL_SELECT_COPY.screenAriaLabel}
        data-entry-hold={entryHold ? "" : undefined}
      >
        <div className="bm-logo-slot" aria-hidden="true" />
        <div className="bm-binding" aria-hidden="true">
          {Array.from({ length: SPIRAL_RING_COUNT }, (_, idx) => (
            <i key={idx} />
          ))}
        </div>

        <div
          className="bm-shelf level-list"
          role="group"
          aria-label={LEVEL_SELECT_COPY.listAriaLabel}
          data-testid="r83-level-list"
        >
          {shelf.resolvedSlots.map((slot) => (
            <RibbonSlot
              key={slot.level.levelId}
              level={slot.level}
              state={slot.state}
              isNext={slot.isNext}
              unlocking={slot.unlocking}
              dims={shelf.dims}
              restLength={slot.restLength}
              registerRefs={shelf.registerRefs}
              onPointerDown={shelf.onPointerDown}
              onPointerMove={shelf.onPointerMove}
              onPointerUp={shelf.onPointerUp}
              onClick={shelf.onClick}
            />
          ))}
        </div>

        <div className="bm-foot">
          <h2 className="bm-title" data-testid="r83-level-title">
            <OwnerIcon name={shelf.allDone ? "star" : "pull-down"} size={22} />
            {shelf.allDone ? LEVEL_SELECT_COPY.footTitleAllDone : LEVEL_SELECT_COPY.footTitle}
          </h2>
          <div className="bm-status" role="status" aria-live="polite" data-testid="r83-level-status">
            {shelf.statusMessage ? (
              <span ref={statusChipRef} className="k-chip" data-testid="r83-level-status-chip">
                <OwnerIcon name="lock" size={14} />
                {shelf.statusMessage}
              </span>
            ) : null}
          </div>
        </div>

        {finished && !entryHold ? <PageEdgeWalkers /> : null}
        <MomoStage ref={momoRef} at="strip" expression={shelf.momoExpression} hidden={entryHold} />
        <R83Bubble
          momoRef={momoRef}
          anchor="strip"
          text={shelf.bubbleText}
          visible={!entryHold && shelf.bubbleVisible}
          ariaLive="polite"
        />
        {!entryHold ? (
          <div ref={hintRef} className="r83-hint" role="note" data-testid="r83-level-hint">
            {LEVEL_SELECT_COPY.hint}
          </div>
        ) : null}
      </div>
      {!entryHold ? <HandLegend /> : null}
    </ScreenFrame>
  );
}

/**
 * Layar Pilih Level r8.3 (rak pita bookmark pada tepi spiral).
 * Drop-in menerima `LevelEntryScreenProps` plus `completedStages` / `studentName`.
 */
export function LevelSelectScreen(props: LevelSelectScreenProps) {
  const hasParentNui = useOptionalNui() !== null;
  const content = <LevelSelectInner {...props} />;
  return hasParentNui ? content : <NuiProvider>{content}</NuiProvider>;
}

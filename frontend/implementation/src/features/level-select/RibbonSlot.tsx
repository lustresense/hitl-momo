"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { OwnerIcon, type OwnerIconName } from "@/src/components/ui/owner-icons";
import type { LevelDefinition } from "@/src/domain/levels";
import {
  LEVEL_SELECT_COPY,
  formatLevelRibbonAriaLabel,
  formatLevelRibbonName,
  type RibbonVisualState,
} from "@/src/domain/copy/levels";
import {
  NARROW_RIBBON_W,
  NOTCHES_TO_ARM,
  RIBBON_SHADOW_PX,
  outerRibbonPath,
  stitchRibbonPath,
  type ShelfDims,
} from "./ribbon-pull";

export interface RibbonDomRefs {
  slot: HTMLDivElement | null;
  btn: HTMLButtonElement | null;
  svg: SVGSVGElement | null;
  shadowPath: SVGPathElement | null;
  bodyPath: SVGPathElement | null;
  stitchPath: SVGPathElement | null;
}

export interface RibbonSlotProps {
  readonly level: LevelDefinition;
  readonly state: RibbonVisualState;
  readonly isNext: boolean;
  readonly unlocking: boolean;
  readonly dims: ShelfDims;
  readonly restLength: number;
  readonly registerRefs: (stage: number, refs: RibbonDomRefs) => void;
  readonly onPointerDown: (stage: number, event: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly onPointerMove: (stage: number, event: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly onPointerUp: (stage: number, event: ReactPointerEvent<HTMLButtonElement>, cancelled: boolean) => void;
  readonly onClick: (stage: number) => void;
}

function badgeForState(state: RibbonVisualState): { name: OwnerIconName; size: number } {
  if (state === "locked") return { name: "lock", size: 24 };
  if (state === "done") return { name: "check", size: 26 };
  return { name: "play", size: 22 };
}

/**
 * Satu pita bookmark pada rak level r8.3 (port bab.js:58-70).
 * Seluruh transformasi dan perubahan panjang SVG selama tarik ditulis melalui ref DOM.
 */
export function RibbonSlot({
  level,
  state,
  isNext,
  unlocking,
  dims,
  restLength,
  registerRefs,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onClick,
}: RibbonSlotProps) {
  const locked = state === "locked";
  const ribbonName = formatLevelRibbonName(level.stage, level.title);
  const ariaLabel = formatLevelRibbonAriaLabel(level.stage, ribbonName, state);
  const badge = badgeForState(state);

  const refs: RibbonDomRefs = {
    slot: null,
    btn: null,
    svg: null,
    shadowPath: null,
    bodyPath: null,
    stitchPath: null,
  };

  const syncRef = () => registerRefs(level.stage, refs);
  const btnStyle = {
    width: `${dims.w}px`,
    "--bm-w": `${dims.w}px`,
    "--bm-len": `${restLength}px`,
  } as CSSProperties;

  return (
    <div
      ref={(el) => {
        refs.slot = el;
        syncRef();
      }}
      className={`bm-slot bm-${state}${isNext ? " is-next" : ""}${unlocking ? " is-unlocking" : ""}`}
      data-stage={level.stage}
      data-testid={`r83-level-slot-${level.stage}`}
    >
      <span className="bm-ring-clip" aria-hidden="true" />
      <button
        ref={(el) => {
          refs.btn = el;
          syncRef();
        }}
        type="button"
        className={`bm-ribbon level-card ${locked ? "is-locked" : "is-playable"}`}
        style={btnStyle}
        data-testid={`r83-level-card-${level.stage}`}
        data-level-id={level.levelId}
        data-stage={level.stage}
        data-state={state}
        aria-label={ariaLabel}
        onPointerDown={(e) => onPointerDown(level.stage, e)}
        onPointerMove={(e) => onPointerMove(level.stage, e)}
        onPointerUp={(e) => onPointerUp(level.stage, e, false)}
        onPointerCancel={(e) => onPointerUp(level.stage, e, true)}
        onClick={() => onClick(level.stage)}
      >
        <span className="bm-body">
          <svg
            ref={(el) => {
              refs.svg = el;
              syncRef();
            }}
            className="bm-shape"
            width={dims.w + RIBBON_SHADOW_PX}
            height={restLength + RIBBON_SHADOW_PX}
            viewBox={`0 0 ${dims.w + RIBBON_SHADOW_PX} ${restLength + RIBBON_SHADOW_PX}`}
            aria-hidden="true"
            focusable="false"
          >
            <path
              ref={(el) => {
                refs.shadowPath = el;
                syncRef();
              }}
              className="bm-outer bm-outer--shadow"
              d={outerRibbonPath(dims.w, restLength)}
              transform={`translate(${RIBBON_SHADOW_PX} ${RIBBON_SHADOW_PX})`}
            />
            <path
              ref={(el) => {
                refs.bodyPath = el;
                syncRef();
              }}
              className="bm-outer bm-outer--body"
              d={outerRibbonPath(dims.w, restLength)}
            />
            <path
              ref={(el) => {
                refs.stitchPath = el;
                syncRef();
              }}
              className="bm-stitch"
              d={stitchRibbonPath(dims.w, restLength)}
            />
          </svg>
          <span className="bm-content">
            <span className="bm-tag">{LEVEL_SELECT_COPY.ribbonTag}</span>
            <span className="bm-number">{level.stage}</span>
            <span
              className="bm-name"
              style={dims.w < NARROW_RIBBON_W ? { maxWidth: `${dims.w - 8}px` } : undefined}
            >
              {ribbonName}
            </span>
            <span className="bm-badge" aria-hidden="true">
              <OwnerIcon name={badge.name} size={badge.size} />
            </span>
          </span>
          <span className="bm-ring" aria-hidden="true">
            <OwnerIcon name="pull-down" size={20} />
          </span>
          <span className="bm-notches" aria-hidden="true">
            {Array.from({ length: NOTCHES_TO_ARM }, (_, idx) => (
              <i key={idx} />
            ))}
          </span>
        </span>
      </button>
    </div>
  );
}

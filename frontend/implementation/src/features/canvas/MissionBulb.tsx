"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { OwnerIcon } from "@/src/components/ui/owner-icons";
import { CANVAS_COPY } from "@/src/domain/copy/canvas";
import type { LevelDefinition } from "@/src/domain/levels";
import { getMissionConfigForLevel } from "@/src/domain/mission-config";
import { HOLD_MS_DEFAULT } from "@/src/nui/core/constants";
import { useNuiTarget, useOptionalNui } from "@/src/nui/react";
import { ObjectRecommendationChips } from "./ObjectRecommendationChips";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface MissionBulbProps {
  readonly level: LevelDefinition;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly hidden?: boolean;
}

function NuiMissionButton({ open, onToggle }: { readonly open: boolean; readonly onToggle: () => void }) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const resetRef = useRef<() => void>(() => undefined);
  const toggleRef = useRef(onToggle);
  toggleRef.current = onToggle;

  const target = useNuiTarget(btnRef, {
    id: "r83-mission-bulb",
    label: CANVAS_COPY.mission.buttonTitle,
    mode: "point",
    holdMs: HOLD_MS_DEFAULT,
    badge: true,
    allowClickWhenNoHand: true,
    trackState: false,
    onFire: () => {
      toggleRef.current();
      resetRef.current();
    },
  });
  resetRef.current = target.reset;

  return (
    <button
      ref={btnRef}
      type="button"
      className="nb-iconbtn nb-iconbtn--accent mission-hint-btn"
      data-testid="r83-mission-bulb"
      aria-label={CANVAS_COPY.mission.buttonAriaLabel}
      aria-expanded={open}
      title={CANVAS_COPY.mission.buttonTitle}
      onClick={onToggle}
    >
      <OwnerIcon name="bulb" size={26} />
    </button>
  );
}

/**
 * Tombol bohlam misi (ikon Owner `"bulb"`) yang membuka/menutup popover info misi level (`canvas.js:30-35`).
 */
export function MissionBulb({ level, open, onToggle, hidden = false }: MissionBulbProps) {
  const hasNui = useOptionalNui() !== null;
  const popRef = useRef<HTMLElement | null>(null);
  const mission = useMemo(() => getMissionConfigForLevel(level), [level]);
  const examples = mission.examples.length > 0 ? mission.examples : level.catalog;

  useIsoLayoutEffect(() => {
    const el = popRef.current;
    if (!open || !el || typeof window === "undefined") return;
    const ctx = gsap.context(() => {
      gsap.from(el, { opacity: 0, y: -10, duration: 0.3, ease: "power2.out" });
    }, el);
    return () => ctx.revert();
  }, [open]);

  if (hidden) return null;

  return (
    <>
      <div className="drawing-corner">
        {hasNui ? (
          <NuiMissionButton open={open} onToggle={onToggle} />
        ) : (
          <button
            type="button"
            className="nb-iconbtn nb-iconbtn--accent mission-hint-btn"
            data-testid="r83-mission-bulb"
            aria-label={CANVAS_COPY.mission.buttonAriaLabel}
            aria-expanded={open}
            title={CANVAS_COPY.mission.buttonTitle}
            onClick={onToggle}
          >
            <OwnerIcon name="bulb" size={26} />
          </button>
        )}
      </div>

      <section
        ref={popRef}
        className="fc dots mission-pop"
        data-testid="r83-mission-popover"
        aria-label={CANVAS_COPY.mission.dialogAriaLabel}
        hidden={!open}
      >
        <span className="k-kicker">{CANVAS_COPY.mission.levelKicker(level.stage)}</span>
        <h2 className="k-title">{CANVAS_COPY.mission.heading}</h2>
        <p className="k-text r83-mission-sub">{mission.title}</p>
        <ObjectRecommendationChips items={examples} testId="r83-mission-chips" />
      </section>
    </>
  );
}

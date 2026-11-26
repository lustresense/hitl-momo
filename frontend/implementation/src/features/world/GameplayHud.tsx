"use client";

import { useEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { env } from "@/src/config/env";
import { WORLD_COPY, WORLD_LEVEL_COPY, normalizeWorldStage } from "@/src/domain/copy/world";
import type { GameController } from "@/src/game/game-controller";
import type { GameOutcome } from "@/src/game/kaplay-runtime";
import { getStageGeometry } from "@/src/game/stage-geometry";
import { HandLegend, useJoystick } from "@/src/nui";
import { createRuntimeInputBridge, type BridgeKey, type RuntimeInputBridge } from "./joystick-to-runtime";
import { DEFAULT_WORLD_BOUNDS } from "./placement-controller";
import { prefersReducedMotion, useIsoLayoutEffect } from "./world-ui-helpers";

export interface GameplayHudProps {
  readonly active: boolean;
  readonly stage: number;
  readonly outcome: GameOutcome | null;
  readonly gameRef: RefObject<GameController | null>;
  readonly onExit: () => void;
  readonly onReposition: () => void;
  readonly onRedraw: () => void;
}

const KEY_MAP: Record<string, BridgeKey> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "jump",
  KeyW: "jump",
  Space: "jump",
};

/**
 * HUD bermain r8.3 (port `play.js`):
 * joystick analog Aturan C -> `joystick-to-runtime`, panah keyboard ← → ↑,
 * `HandLegend`, goal pulse, chip status level, serta tombol keluar/geser/gambar lagi.
 */
export function GameplayHud({
  active,
  stage,
  outcome,
  gameRef,
  onExit,
  onReposition,
  onRedraw,
}: GameplayHudProps) {
  const s = normalizeWorldStage(stage);
  const geometry = getStageGeometry(s);
  const live = active && outcome === null;

  const bridgeRef = useRef<RuntimeInputBridge | null>(null);
  const actorsRef = useRef<HTMLDivElement | null>(null);
  const goalBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!live) {
      bridgeRef.current?.releaseAll();
      bridgeRef.current?.dispose();
      bridgeRef.current = null;
      return;
    }

    const bridge = createRuntimeInputBridge({
      setInput: (input) => gameRef.current?.setInput(input),
    });
    bridgeRef.current = bridge;

    if (env.testHooksEnabled && typeof window !== "undefined") {
      window.__skbSetInput = (input) => {
        bridge.setOverride(input);
      };
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest("input,textarea,select,[contenteditable]")) return;
      const mapped = KEY_MAP[e.code];
      if (!mapped) return;
      e.preventDefault();
      bridge.setKey(mapped, true);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const mapped = KEY_MAP[e.code];
      if (mapped) bridge.setKey(mapped, false);
    };

    const onBlur = () => bridge.releaseKeys();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      bridge.releaseAll();
      bridge.dispose();
      if (bridgeRef.current === bridge) bridgeRef.current = null;
    };
  }, [live, gameRef]);

  useJoystick({
    enabled: live,
    showOverlay: true,
    ignore: "[data-nui-off],button,a",
    onAxis: (axis) => bridgeRef.current?.setJoystickAxis(axis),
    onJump: () => bridgeRef.current?.triggerJump(),
  });

  useIsoLayoutEffect(() => {
    const actors = actorsRef.current;
    const goalBox = goalBoxRef.current;
    if (!active || outcome !== null || !actors || !goalBox || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.to(goalBox, { scale: 1.35, opacity: 0.2, duration: 0.9, repeat: -1, ease: "sine.out" });
    }, actors);
    return () => ctx.revert();
  }, [active, outcome]);

  if (!active || outcome === "success") return null;

  const goalCenterX = geometry.goal.x + geometry.goal.w / 2;
  const goalBottomY = geometry.goal.y + geometry.goal.h;

  return (
    <>
      {outcome === null ? (
        <div ref={actorsRef} className="actors" aria-hidden="true">
          <div
            ref={goalBoxRef}
            className="goalbox"
            data-testid="r83-goal-pulse"
            style={{
              left: `${(goalCenterX / DEFAULT_WORLD_BOUNDS.width) * 100}%`,
              top: `${((goalBottomY - 12) / DEFAULT_WORLD_BOUNDS.height) * 100}%`,
              width: `${(30 / 4.9).toFixed(4)}%`,
            }}
          />
        </div>
      ) : null}

      <div className="hud tr">
        <span className="k-chip" data-testid="r83-hud-level">
          {WORLD_LEVEL_COPY[s].title}
        </span>
      </div>
      <div className="hud tr2">
        <span className="k-chip" data-testid="r83-hud-goal">
          {WORLD_COPY.gameplay.goalChip}
        </span>
      </div>

      {outcome === null ? (
        <>
          <div className="r83-world-actions" data-nui-off="true" data-testid="r83-gameplay-actions">
            <button
              type="button"
              className="nb-btn"
              data-testid="r83-world-exit"
              aria-label={WORLD_COPY.gameplay.exitAriaLabel}
              onClick={onExit}
            >
              {WORLD_COPY.gameplay.exitLabel}
            </button>
            <button
              type="button"
              className="nb-btn"
              data-testid="r83-world-reposition"
              onClick={onReposition}
            >
              {WORLD_COPY.gameplay.repositionLabel}
            </button>
            <button
              type="button"
              className="nb-btn"
              data-testid="r83-world-redraw"
              onClick={onRedraw}
            >
              {WORLD_COPY.gameplay.redrawLabel}
            </button>
          </div>

          <HandLegend testId="r83-world-hand-legend" />

          <div className="r83-hint" role="note" style={{ opacity: 1 }}>
            {WORLD_COPY.gameplay.hint}
          </div>
        </>
      ) : null}
    </>
  );
}

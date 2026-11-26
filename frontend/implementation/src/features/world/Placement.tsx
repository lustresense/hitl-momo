"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { env } from "@/src/config/env";
import { WORLD_COPY } from "@/src/domain/copy/world";
import type { GameController } from "@/src/game/game-controller";
import type { TurnDirection } from "@/src/game/runtime/creations";
import type { R83BubbleHandle } from "@/src/features/shared/R83Bubble";
import { NuiRing, useDragRelative } from "@/src/nui";
import {
  DEFAULT_WORLD_BOUNDS,
  PLACEMENT_DRAG_START_PX,
  PLACE_RING_HOLD_MS,
  createPlacementController,
  screenDeltaToWorldDelta,
  type PlacementBox,
  type PlacementController,
  type PlacementPoint,
} from "./placement-controller";
import { elementRect, prefersReducedMotion, useIsoLayoutEffect, usePinnedRingPosition } from "./world-ui-helpers";

const ROTATE_STEP_DEG = 15;

export interface PlacementProps {
  readonly active: boolean;
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly worldRef: RefObject<HTMLDivElement | null>;
  readonly overlayHost?: HTMLElement | null;
  readonly gameRef: RefObject<GameController | null>;
  readonly bubbleRef: RefObject<R83BubbleHandle | null>;
  readonly onExit: () => void;
  readonly onRedraw: () => void;
}

function readLiveBox(canvas: HTMLCanvasElement | null): { pos: PlacementPoint; box: PlacementBox } {
  const ds = canvas?.dataset;
  const x = Number(ds?.objectX);
  const y = Number(ds?.objectY);
  const w = Number(ds?.objectWidth);
  const h = Number(ds?.objectHeight);
  return {
    pos: { x: Number.isFinite(x) ? x : 360, y: Number.isFinite(y) ? y : 200 },
    box: { w: Number.isFinite(w) && w > 0 ? w : 80, h: Number.isFinite(h) && h > 0 ? h : 20 },
  };
}

function applyBoxDom(el: HTMLDivElement | null, pos: PlacementPoint, box: PlacementBox): void {
  if (!el) return;
  el.style.left = `${(pos.x / DEFAULT_WORLD_BOUNDS.width) * 100}%`;
  el.style.top = `${(pos.y / DEFAULT_WORLD_BOUNDS.height) * 100}%`;
  el.style.width = `${(box.w / DEFAULT_WORLD_BOUNDS.width) * 100}%`;
  el.style.height = `${(box.h / DEFAULT_WORLD_BOUNDS.height) * 100}%`;
}

/**
 * Penempatan benda r8.3 (port `place.js`): tarik relatif (ambang 12 px, clamp panggung),
 * diam `PLACE_RING_DELAY_MS` (700 ms) memunculkan ring "Taruh di sini" (1500 ms).
 */
export function Placement({ active, canvasRef, worldRef, overlayHost, gameRef, bubbleRef, onExit, onRedraw }: PlacementProps) {
  const [ringVisible, setRingVisible] = useState(false);
  const [draggingUi, setDraggingUi] = useState(false);
  const [illegalError, setIllegalError] = useState("");

  const ctrlRef = useRef<PlacementController | null>(null);
  const lastValidRef = useRef<PlacementPoint>({ x: 360, y: 200 });
  const boxRef = useRef<PlacementBox>({ w: 80, h: 20 });
  const boxElRef = useRef<HTMLDivElement | null>(null);
  const ringHostRef = useRef<HTMLDivElement | null>(null);
  const visualDegRef = useRef(0);
  const subQuarterDegRef = useRef(0);

  useIsoLayoutEffect(() => {
    if (!active) {
      setRingVisible(false);
      setDraggingUi(false);
      setIllegalError("");
      visualDegRef.current = 0;
      subQuarterDegRef.current = 0;
      if (boxElRef.current) {
        gsap.killTweensOf(boxElRef.current);
        gsap.set(boxElRef.current, { scale: 1, rotation: 0 });
        boxElRef.current.dataset.rotationDeg = "0";
      }
      ctrlRef.current?.dispose();
      ctrlRef.current = null;
      return;
    }

    const live = readLiveBox(canvasRef.current);
    lastValidRef.current = live.pos;
    boxRef.current = live.box;
    visualDegRef.current = 0;
    subQuarterDegRef.current = 0;
    if (boxElRef.current) boxElRef.current.dataset.rotationDeg = "0";
    applyBoxDom(boxElRef.current, live.pos, live.box);

    const ctrl = createPlacementController({ initial: live.pos, box: live.box, bounds: DEFAULT_WORLD_BOUNDS });
    ctrlRef.current = ctrl;
    const unsub = ctrl.subscribe((s) => {
      setRingVisible(s.ringVisible);
      setDraggingUi(s.dragging);
    });
    ctrl.markLanded(live.pos.x, live.pos.y, live.box);

    if (env.testHooksEnabled && typeof window !== "undefined") {
      window.__skbMovePlacement = (x: number, y: number) => {
        const currentBox = readLiveBox(canvasRef.current).box;
        if (gameRef.current?.setPlacement(x, y)) {
          lastValidRef.current = { x, y };
          ctrl.setResolvedPosition(x, y);
          applyBoxDom(boxElRef.current, { x, y }, currentBox);
          setIllegalError("");
        } else {
          setIllegalError(WORLD_COPY.placement.illegalPlacement);
        }
      };
    }

    return () => {
      unsub();
      ctrl.dispose();
      if (ctrlRef.current === ctrl) ctrlRef.current = null;
    };
  }, [active, canvasRef, gameRef]);

  const tryMoveRuntime = useCallback(
    (target: PlacementPoint) => {
      const game = gameRef.current;
      const commit = (p: PlacementPoint) => {
        lastValidRef.current = p;
        ctrlRef.current?.setResolvedPosition(p.x, p.y);
        applyBoxDom(boxElRef.current, p, boxRef.current);
      };
      if (!game) {
        commit(target);
        return;
      }
      const prev = lastValidRef.current;
      if (game.setPlacement(target.x, target.y)) {
        commit(target);
        setIllegalError("");
      } else if (game.setPlacement(target.x, prev.y)) {
        commit({ x: target.x, y: prev.y });
      } else if (game.setPlacement(prev.x, target.y)) {
        commit({ x: prev.x, y: target.y });
      }
    },
    [gameRef],
  );

  useDragRelative({
    enabled: active,
    threshold: PLACEMENT_DRAG_START_PX,
    ignore: "[data-nui-off],button,a,.thumb-confirm",
    onStart: () => {
      const live = readLiveBox(canvasRef.current);
      lastValidRef.current = live.pos;
      boxRef.current = live.box;
      setIllegalError("");
      if (boxElRef.current) {
        gsap.to(boxElRef.current, { scale: 1.08, duration: prefersReducedMotion() ? 0 : 0.15, overwrite: "auto" });
      }
      ctrlRef.current?.beginDrag(live.pos.x, live.pos.y, live.box);
    },
    onMove: (screenDx, screenDy) => {
      const surfaceRect =
        worldRef.current?.getBoundingClientRect() ??
        canvasRef.current?.getBoundingClientRect() ?? { width: 800, height: 450 };
      const delta = screenDeltaToWorldDelta(screenDx, screenDy, surfaceRect, DEFAULT_WORLD_BOUNDS);
      const next = ctrlRef.current?.moveByDelta(delta.dx, delta.dy);
      if (next) tryMoveRuntime(next);
    },
    onEnd: () => {
      if (boxElRef.current) {
        gsap.to(boxElRef.current, { scale: 1, duration: prefersReducedMotion() ? 0 : 0.15, overwrite: "auto" });
      }
      ctrlRef.current?.endDrag();
    },
  });

  const handleRotate = useCallback(
    (dir: TurnDirection, stepDeg: 15 | 90 = 90) => {
      if (!active || ctrlRef.current?.getState().dragging) return;
      const boxEl = boxElRef.current;
      const dur = prefersReducedMotion() ? 0 : 0.2;
      const nextSub = stepDeg === 90 ? 0 : subQuarterDegRef.current + dir * ROTATE_STEP_DEG;
      const crossedQuarter = stepDeg === 90 || nextSub >= 90 || nextSub <= -90;
      if (crossedQuarter && !gameRef.current?.rotate(dir)) {
        setIllegalError(WORLD_COPY.placement.illegalPlacement);
        return;
      }
      if (crossedQuarter) {
        const live = readLiveBox(canvasRef.current);
        lastValidRef.current = live.pos;
        boxRef.current = live.box;
        applyBoxDom(boxEl, live.pos, live.box);
      }
      const wrappedSub = stepDeg === 90 ? 0 : nextSub >= 90 ? nextSub - 90 : nextSub <= -90 ? nextSub + 90 : nextSub;
      subQuarterDegRef.current = wrappedSub;
      visualDegRef.current = (visualDegRef.current + dir * stepDeg + 360) % 360;
      if (boxEl) {
        boxEl.dataset.rotationDeg = String(visualDegRef.current);
        const tweenVars = { rotation: wrappedSub, duration: dur, ease: "back.out(2)", overwrite: "auto" as const };
        if (crossedQuarter) gsap.fromTo(boxEl, { rotation: wrappedSub - dir * stepDeg }, tweenVars);
        else gsap.to(boxEl, tweenVars);
      }
      setIllegalError("");
      ctrlRef.current?.notifyRotated(lastValidRef.current, boxRef.current);
    },
    [active, canvasRef, gameRef],
  );

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest("input,textarea,select,[contenteditable]")) return;
      if (e.key === "r" || e.key === "R") handleRotate(e.shiftKey ? -1 : 1, ROTATE_STEP_DEG);
    };
    const worldEl = worldRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      handleRotate(e.deltaY > 0 ? 1 : -1, ROTATE_STEP_DEG);
    };
    window.addEventListener("keydown", onKeyDown);
    worldEl?.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      worldEl?.removeEventListener("wheel", onWheel);
    };
  }, [active, handleRotate, worldRef]);

  const handleCommit = useCallback(() => {
    const live = readLiveBox(canvasRef.current);
    if (!(gameRef.current?.commitPlacementAt(live.pos.x, live.pos.y) ?? false)) {
      setIllegalError(WORLD_COPY.placement.illegalPlacement);
      ctrlRef.current?.markLanded(live.pos.x, live.pos.y, live.box);
    }
  }, [canvasRef, gameRef]);

  const getObjectAnchorRect = useCallback(
    () => elementRect(boxElRef.current) ?? elementRect(canvasRef.current),
    [canvasRef],
  );
  usePinnedRingPosition(ringHostRef, {
    enabled: active && ringVisible,
    side: "side",
    getAnchorRect: getObjectAnchorRect,
    bubbleRef,
    anchorIsBubble: false,
  });

  if (!active) return null;

  const overlays = (
    <>
      <div className="r83-world-actions" data-nui-off="true">
        <button type="button" className="nb-btn" data-testid="r83-place-exit" aria-label={WORLD_COPY.gameplay.exitAriaLabel} onClick={onExit}>{WORLD_COPY.gameplay.exitLabel}</button>
        <button type="button" className="nb-btn" data-testid="r83-place-rotate" onClick={() => handleRotate(1)}>{WORLD_COPY.gameplay.rotateLabel}</button>
        <button type="button" className="nb-btn" data-testid="r83-place-redraw" onClick={onRedraw}>{WORLD_COPY.gameplay.redrawLabel}</button>
      </div>
      {illegalError ? <div className="k-chip bad r83-place-error" role="status" data-testid="r83-place-error">{illegalError}</div> : null}
      {ringVisible ? (
        <div ref={ringHostRef} className="r83-ring-pinned" data-testid="r83-place-ring-host">
          <NuiRing label={WORLD_COPY.placement.placeRingLabel} holdMs={PLACE_RING_HOLD_MS} mode="any" testId="r83-place-ring" onFire={handleCommit} />
        </div>
      ) : null}
      <div className="r83-hint top tr" role="note" data-testid="r83-place-hint" style={{ opacity: 1 }}>{WORLD_COPY.placement.hint}</div>
    </>
  );

  return (
    <>
      <div className="actors" aria-hidden="true">
        <div ref={boxElRef} className={`r83-place-box obj fresh${draggingUi ? " sel" : ""}${illegalError ? " bad" : ""}`} data-testid="r83-placement-box" />
      </div>
      {overlayHost ? createPortal(overlays, overlayHost) : overlays}
    </>
  );
}

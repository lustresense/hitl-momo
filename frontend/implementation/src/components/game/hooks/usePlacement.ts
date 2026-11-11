/**
 * Placement state of the world stage: where the pending object sits, whether that spot is legal,
 * and how pointer drags / hand pinches / test hooks move it.
 */
import { useRef, useState, type MutableRefObject, type PointerEvent } from "react";
import type { LevelDefinition } from "@/src/domain/levels";
import { env } from "@/src/config/env";
import type { GameController } from "@/src/game/game-controller";
import type { CreationAngle } from "@/src/game/creation-store";
import { isLegalPlacement } from "@/src/game/placement-rules";
import type { StageGeometry } from "@/src/game/stage-geometry";
import { clientToPhysics } from "@/src/game/stage-transform";
import { screenToWorld, worldViewport } from "@/src/game/world-viewport";
import type { StagePhase } from "../game-stage-types";

const OUT_OF_WORLD_MESSAGE = "Posisi di luar dunia. Geser kembali; objekmu tetap disimpan.";

interface UsePlacementOptions {
  controllerRef: MutableRefObject<GameController | null>;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  level: LevelDefinition;
  geometry: StageGeometry | null;
  phase: StagePhase;
  integrated: boolean | undefined;
}

export function usePlacement({
  controllerRef,
  canvasRef,
  level,
  geometry,
  phase,
  integrated,
}: UsePlacementOptions) {
  const [position, setPosition] = useState(integrated ? 360 : level.scene.gapStartX - 10);
  const [placementY, setPlacementY] = useState(integrated ? 300 : 320);
  const [placementError, setPlacementError] = useState("");
  // The active object's quarter turn. It decides which box the legality check and the grab centre use.
  const [angle, setAngle] = useState<CreationAngle>(0);
  const dragging = useRef(false);
  // True while the student holds the object by a pinch (see usePlacementGrab). Only then does the hand move it.
  const grabbing = useRef(false);
  const sideways = angle === 90 || angle === 270;
  const boxW = geometry ? (sideways ? geometry.object.h : geometry.object.w) : level.scene.gapWidth + 24;
  const boxH = geometry ? (sideways ? geometry.object.w : geometry.object.h) : 8;
  // The hand reader keeps the callback it was given at its start: it reads the box and phase from here, not from a closure.
  const latest = useRef({ geometry, boxW, boxH, phase });
  latest.current = { geometry, boxW, boxH, phase };

  function movePlacement(x: number, y: number = 320) {
    setPosition(x);
    setPlacementY(y);
    const valid = controllerRef.current?.setPlacement(x, y) ?? false;
    setPlacementError(valid ? "" : OUT_OF_WORLD_MESSAGE);
  }

  // Test-only bypass hook: never installed in a production build (NEXT_PUBLIC_TEST_HOOKS must be "1").
  if (env.testHooksEnabled && typeof window !== "undefined") {
    window.__skbMovePlacement = (x: number, y: number) => movePlacement(x, y);
  }

  const legal = geometry
    ? position >= 0 && placementY >= 0 && position + boxW <= 800 && placementY + boxH <= 450
    : isLegalPlacement(position, placementY, level.scene.gapWidth + 20, 8);

  /** Mouse/touch drag on the canvas: the pointer is the centre of the object. */
  function movePlacementToPointer(event: PointerEvent<HTMLCanvasElement>) {
    if (phase !== "placing") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = geometry
      ? clientToPhysics({ x: event.clientX, y: event.clientY }, rect, geometry)
      : screenToWorld(
          event.clientX - rect.left,
          event.clientY - rect.top,
          worldViewport(rect.width, rect.height),
        );
    movePlacement(point.x - boxW / 2, point.y - boxH / 2);
  }

  /**
   * Hand: `cursor` is normalised (0..1) over the canvas. The object follows only while it is grabbed (the ring
   * filled and the pinch is still held); a pinch that merely passes over the stage moves nothing.
   */
  function movePlacementToHandCursor(cursor: { x: number; y: number }) {
    if (!grabbing.current || latest.current.phase !== "placing") return;
    const { geometry: geo, boxW: w, boxH: h } = latest.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = cursor.x * rect.width;
    const y = cursor.y * rect.height;
    const point = geo
      ? clientToPhysics(
          { x, y },
          { left: 0, top: 0, width: rect.width, height: rect.height },
          geo,
        )
      : screenToWorld(x, y, worldViewport(rect.width, rect.height));
    movePlacement(point.x - w / 2, point.y - h / 2);
  }

  /** Grab on or off. Synchronous, so the hand frame that follows already obeys it. */
  function setGrabbing(holding: boolean) {
    grabbing.current = holding;
  }

  const canvasPointerHandlers = {
    onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
      if (phase !== "placing") return;
      dragging.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      movePlacementToPointer(event);
    },
    onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
      if (dragging.current) movePlacementToPointer(event);
    },
    onPointerUp() {
      dragging.current = false;
    },
    onPointerCancel() {
      dragging.current = false;
    },
  };

  return {
    position,
    setPosition,
    placementY,
    setPlacementY,
    placementError,
    setPlacementError,
    angle,
    setAngle,
    legal,
    movePlacementToHandCursor,
    setGrabbing,
    canvasPointerHandlers,
  };
}

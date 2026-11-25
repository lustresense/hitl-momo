/**
 * Placement state of the world stage: where the pending object sits, whether that spot is legal,
 * and how pointer drags / hand pinches / test hooks move it.
 */
import { isDrag } from "@/src/input/r83/target-selection";
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
  const dragAnchor = useRef<{x:number;y:number;ox:number;oy:number}|null>(null);
  const lastPosition = useRef({x:position,y:placementY});
  lastPosition.current = {x:position,y:placementY};
  // The box of the object being placed. Objects take the size of their drawing, so the live size comes from the
  // scene's telemetry (already turned for a quarter turn); the level's plank is only the fallback before it exists.
  const readBox = () => {
    const data = canvasRef.current?.dataset;
    const liveW = Number(data?.objectWidth);
    const liveH = Number(data?.objectHeight);
    if (geometry && Number.isFinite(liveW) && Number.isFinite(liveH) && liveW > 0 && liveH > 0) return { w: liveW, h: liveH };
    const sideways = angle === 90 || angle === 270;
    return {
      w: geometry ? (sideways ? geometry.object.h : geometry.object.w) : level.scene.gapWidth + 24,
      h: geometry ? (sideways ? geometry.object.w : geometry.object.h) : 8,
    };
  };
  const { w: boxW, h: boxH } = readBox();
  // The hand reader keeps the callback it was given at its start: it reads the box and phase from here, not from a closure.
  const latest = useRef({ geometry, readBox, phase });
  latest.current = { geometry, readBox, phase };

  function movePlacement(x: number, y: number = 320) {
    lastPosition.current = {x,y};
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
  function movePlacementToHandCursor(cursor: {x:number;y:number} | null, pinched = true) {
    if (!pinched || !cursor || latest.current.phase !== "placing") {
      dragAnchor.current = null; grabbing.current = false; return;
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = cursor.x * innerWidth, y = cursor.y * innerHeight;
    const {geometry:geo} = latest.current;
    const toWorld=(cx:number,cy:number)=>geo ? clientToPhysics({x:cx,y:cy},rect,geo) : screenToWorld(cx-rect.left,cy-rect.top,worldViewport(rect.width,rect.height));
    if (!dragAnchor.current) {
      dragAnchor.current = {x,y,ox:lastPosition.current.x,oy:lastPosition.current.y}; return;
    }
    const anchor=dragAnchor.current;
    if (!grabbing.current && !isDrag(anchor,{x,y})) return;
    grabbing.current=true;
    const origin=toWorld(anchor.x,anchor.y), point=toWorld(x,y);
    movePlacement(anchor.ox+point.x-origin.x,anchor.oy+point.y-origin.y);
  }
  function setGrabbing(holding:boolean) { grabbing.current=holding; if(!holding)dragAnchor.current=null; }

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

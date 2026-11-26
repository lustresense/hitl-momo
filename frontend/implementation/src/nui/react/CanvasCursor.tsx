"use client";

import { useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { OwnerIcon } from "@/src/components/ui/owner-icons";
import {
  CHROME_SELECTOR,
  CURSOR_PENCIL_OFFSET_X,
  CURSOR_PENCIL_OFFSET_Y,
  CURSOR_PENCIL_SIZE_PX,
  ERASER_DIAMETER_PX,
  ERASER_RADIUS_PX,
  ERASER_STROKE_PX,
} from "../core/constants";
import { useNui, useNuiStatus } from "./NuiProvider";

/** PLAN Lampiran A & hand.css:18-19 (angka bersumber dari core/constants.ts). */
export const CURSOR_PENCIL_OFFSET = { x: CURSOR_PENCIL_OFFSET_X, y: CURSOR_PENCIL_OFFSET_Y } as const;
const ERASER_HALF_PX = ERASER_RADIUS_PX;
const ERASER_BORDER_PX = ERASER_STROKE_PX;
const FROZEN_COLOR = "#9a968c";
const FROZEN_OPACITY = "0.55";
const INK_COLOR = "var(--nb-ink, #1d1d1b)";

export type CanvasToolKind = "pencil" | "eraser";

export interface CanvasCursorProps {
  tool?: CanvasToolKind;
  /** Bila diberikan, pensil/hapus tampil saat di atas kertas; di luar kertas tampil ring 28 px. */
  paperRef?: RefObject<HTMLElement | null>;
  testId?: string;
}

function isOverChrome(x: number, y: number): boolean {
  if (typeof document === "undefined" || typeof document.elementFromPoint !== "function") return false;
  const el = document.elementFromPoint(x, y);
  return el !== null && el.closest(CHROME_SELECTOR) !== null;
}

const NON_PAPER_SELECTOR =
  ".nui-target, button, .nb-toolbar, .draw-tools, .tut-tools, .drawing-corner, .mission-pop, .r83-bubble, .r83-guess-ring-host, #cam-pip";

function isOverPaper(x: number, y: number, paper: HTMLElement | null): boolean {
  if (typeof document === "undefined" || typeof document.elementFromPoint !== "function") {
    return paper !== null;
  }
  const el = document.elementFromPoint(x, y);
  if (!el) return false;
  if (el.closest(NON_PAPER_SELECTOR)) return false;
  if (paper) return paper.contains(el);
  return el.closest(".sk-wrap") !== null;
}

/**
 * Kursor khusus mode kanvas (aturan D), port 1:1 `hand.css:10-27` + `hand.js:140-146`.
 * Hanya dirender saat mode kanvas aktif. Posisi & gaya diperbarui via DOM ref di rAF (0 commit/frame).
 */
export function CanvasCursor({ tool = "pencil", paperRef, testId = "r83-canvas-cursor" }: CanvasCursorProps) {
  const controller = useNui();
  const status = useNuiStatus();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLSpanElement | null>(null);
  const pencilRef = useRef<HTMLSpanElement | null>(null);
  const eraserRef = useRef<HTMLSpanElement | null>(null);
  const hoveredTargetRef = useRef<HTMLElement | null>(null);
  const toolRef = useRef<CanvasToolKind>(tool);
  toolRef.current = tool;

  const active = status.canvasMode && (status.simOn || status.activeSource === "hand" || status.ownerActive);

  useEffect(() => {
    if (!active) return;
    const clearHoveredTarget = () => {
      hoveredTargetRef.current?.classList.remove("nui-point-hover");
      hoveredTargetRef.current = null;
    };
    const applyFrame = (frame: ReturnType<typeof controller.getFrame>) => {
      const root = rootRef.current;
      if (!root) return;
      const paper = paperRef?.current ?? null;
      const drawingHandNib =
        frame.source === "hand" && toolRef.current === "pencil" && frame.pinch ? frame.nib : null;
      let cx = frame.x;
      let cy = frame.y;
      let over = false;
      if (frame.inFrame) {
        /* Kursor utama (hover kertas, ring luar kertas, toolbar, penghapus) selalu mengikuti pusat telapak tangan (frame.x, frame.y).
         * Hanya saat sedang mencubit menggambar dengan pensil, ujung pensil mengikuti pangkal telunjuk (nib) yang di-anchor mulus. */
        if (drawingHandNib !== null && isOverPaper(drawingHandNib.x, drawingHandNib.y, paper)) {
          cx = drawingHandNib.x;
          cy = drawingHandNib.y;
          over = true;
        } else {
          over = isOverPaper(cx, cy, paper);
        }
      }
      if (!frame.inFrame || (frame.source !== "hand" && isOverChrome(cx, cy))) {
        clearHoveredTarget();
        root.style.display = "none";
        root.classList.remove("is-lost");
        delete root.dataset.frozen;
        return;
      }
      root.style.display = "block";
      root.style.transform = `translate(${cx}px, ${cy}px)`;

      const pinched = frame.down || frame.pinch;
      const lost = frame.frozen;
      root.classList.toggle("is-pinch", pinched);
      root.classList.toggle("is-lost", lost);
      if (lost) root.dataset.frozen = "true";
      else delete root.dataset.frozen;

      if (over || typeof document === "undefined" || typeof document.elementFromPoint !== "function") {
        clearHoveredTarget();
      } else {
        const el = document.elementFromPoint(cx, cy)?.closest<HTMLElement>('.nui-target[data-nui="D"]') ?? null;
        if (el !== hoveredTargetRef.current) {
          hoveredTargetRef.current?.classList.remove("nui-point-hover");
          el?.classList.add("nui-point-hover");
          hoveredTargetRef.current = el;
        }
      }

      const isEraser = toolRef.current === "eraser";
      if (ringRef.current) ringRef.current.style.display = over ? "none" : "block";
      if (pencilRef.current) {
        pencilRef.current.style.display = over && !isEraser ? "block" : "none";
        pencilRef.current.style.color = lost ? FROZEN_COLOR : INK_COLOR;
        pencilRef.current.style.opacity = lost ? FROZEN_OPACITY : "1";
      }
      if (eraserRef.current) {
        eraserRef.current.style.display = over && isEraser ? "grid" : "none";
        eraserRef.current.style.borderStyle = pinched ? "solid" : "dashed";
        eraserRef.current.style.borderColor = lost
          ? FROZEN_COLOR
          : pinched
            ? "var(--nb-orange, #ef7a37)"
            : INK_COLOR;
        eraserRef.current.style.color = lost ? FROZEN_COLOR : INK_COLOR;
        eraserRef.current.style.opacity = lost ? FROZEN_OPACITY : "1";
      }
    };
    const unsub = controller.subscribeFrame(applyFrame);
    applyFrame(controller.getFrame());
    return () => {
      unsub();
      clearHoveredTarget();
    };
  }, [active, controller, paperRef]);

  if (!active) return null;

  const cursorNode = (
    <div
      ref={rootRef}
      id="hand-cursor"
      aria-hidden="true"
      data-testid={testId}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        zIndex: 10000,
        pointerEvents: "none",
        display: "none",
      }}
    >
      <span ref={ringRef} className="hc-ring" />
      <span
        ref={pencilRef}
        className="r83-cursor-pencil"
        style={{
          display: "none",
          position: "absolute",
          left: `${CURSOR_PENCIL_OFFSET.x}px`,
          top: `${CURSOR_PENCIL_OFFSET.y}px`,
          width: `${CURSOR_PENCIL_SIZE_PX}px`,
          height: `${CURSOR_PENCIL_SIZE_PX}px`,
          color: "var(--nb-ink, #1d1d1b)",
        }}
      >
        <OwnerIcon name="pencil-fine" size={CURSOR_PENCIL_SIZE_PX} />
      </span>
      <span
        ref={eraserRef}
        className="r83-cursor-eraser"
        style={{
          display: "none",
          placeItems: "center",
          position: "absolute",
          left: `-${ERASER_HALF_PX}px`,
          top: `-${ERASER_HALF_PX}px`,
          width: `${ERASER_DIAMETER_PX}px`,
          height: `${ERASER_DIAMETER_PX}px`,
          boxSizing: "border-box",
          borderRadius: "50%",
          borderWidth: `${ERASER_BORDER_PX}px`,
          borderStyle: "dashed",
          borderColor: "var(--nb-ink, #1d1d1b)",
          background: "color-mix(in srgb, var(--nb-paper, #fffaf0) 45%, transparent)",
          color: "var(--nb-ink, #1d1d1b)",
        }}
      >
        <OwnerIcon name="tool-eraser" size={28} />
      </span>
    </div>
  );

  if (typeof document !== "undefined") {
    const portalHost = document.querySelector('[data-ui="r83"]') ?? document.body;
    if (portalHost) return createPortal(cursorNode, portalHost);
  }
  return cursorNode;
}

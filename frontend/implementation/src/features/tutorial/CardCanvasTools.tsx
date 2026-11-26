"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { OwnerIcon } from "@/src/components/ui/owner-icons";
import { TUTORIAL_COPY } from "@/src/domain/copy/tutorial";
import {
  CanvasController,
  Toolbar,
  type CanvasControllerState,
  type CanvasToolId,
} from "@/src/features/canvas";
import { CanvasCursor, useOptionalNui } from "@/src/nui/react";
import { TUTORIAL_TOOLS_REQUIRED } from "./tutorial-machine";

export interface CardCanvasToolsProps {
  readonly active: boolean;
  /** Dipicu tiap kali bifold terbuka rata sehingga canvas DPR & metrik selalu presisi. */
  readonly resizeKey: number;
  readonly onComplete: () => void;
}

function isTutorialPaperPoint(x: number, y: number, paper: HTMLElement | null): boolean {
  if (typeof document === "undefined") return true;
  if (typeof document.elementFromPoint === "function") {
    const el = document.elementFromPoint(x, y);
    if (!el) return true;
    if (el.closest(".nui-target, button, .r83-bubble")) return false;
    return paper ? paper.contains(el) : true;
  }
  return true;
}

/**
 * Praktik Kartu 3 (port kartu.js:144-157):
 * - Memakai CanvasController (StrokeStore + hapus segmen O-7) & Toolbar variant="tutorial" yang sama dengan kanvas game.
 * - Mode kanvas NUI Aturan D (`setCanvasMode(true)`) + CanvasCursor pensil/hapus hanya selama Kartu 3 aktif.
 * - Kartu selesai setelah ke-5 alat (`pencil`, `eraser`, `undo`, `redo`, `clear`) digunakan & tercentang.
 */
export function CardCanvasTools({ active, resizeKey, onComplete }: CardCanvasToolsProps) {
  const nui = useOptionalNui();
  const paperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const doneSentRef = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const [ctrlState, setCtrlState] = useState<CanvasControllerState>({
    activeTool: "pencil",
    hasInk: false,
    idleReady: false,
    usedTools: new Set<CanvasToolId>(),
    strokeCount: 0,
    inkEnabled: true,
  });
  const [toolsDone, setToolsDone] = useState(false);
  const [triedTools, setTriedTools] = useState<ReadonlySet<CanvasToolId>>(() => new Set());
  const usedTools = useMemo(() => {
    const merged = new Set(ctrlState.usedTools);
    for (const t of triedTools) merged.add(t);
    return merged;
  }, [ctrlState.usedTools, triedTools]);

  useEffect(() => {
    if (!doneSentRef.current && usedTools.size >= TUTORIAL_TOOLS_REQUIRED) {
      doneSentRef.current = true;
      setToolsDone(true);
      nui?.setCanvasMode(false);
      onCompleteRef.current();
    }
  }, [usedTools, nui]);

  const controller = useMemo(
    () =>
      new CanvasController({
        isPointOnPaper: (x, y) => isTutorialPaperPoint(x, y, paperRef.current),
        getNibBridge: () => nui?.getHandSource() ?? null,
      }),
    [nui],
  );

  // Ghost pinch wobble until the first stroke completes
  useEffect(() => {
    const ghost = ghostRef.current;
    if (!ghost || ctrlState.usedTools.has("pencil")) return;
    const ctx = gsap.context(() => {
      gsap.set(ghost, { x: -16, y: 8, rotation: -8 });
      gsap.to(ghost, { x: 16, y: -8, rotation: 6, duration: 1, ease: "sine.inOut", yoyo: true, repeat: -1 });
    }, ghost);
    return () => ctx.revert();
  }, [ctrlState.usedTools]);

  useEffect(() => {
    if (ctrlState.usedTools.has("pencil") && ghostRef.current) {
      gsap.to(ghostRef.current, { opacity: 0, duration: 0.3 });
    }
  }, [ctrlState.usedTools]);

  useEffect(() => {
    const canvas = canvasRef.current;
    setCtrlState(controller.getState());
    const unsubState = controller.subscribe((next) => {
      setCtrlState(next);
    });
    const detachCanvas = canvas ? controller.attachCanvas(canvas) : () => undefined;
    const detachFallback = canvas
      ? controller.attachPointerFallback(canvas, () => {
          if (!nui) return true;
          const st = nui.getStatus();
          return !st.simOn && !st.handAttached && st.activeSource !== "hand";
        })
      : () => undefined;
    const unsubSample = nui ? nui.subscribeSample((s, chrome) => controller.feedSample(s, chrome)) : () => undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!activeRef.current) return;
      if (e.target instanceof Element && e.target.closest("input,textarea,select")) return;
      if (e.key === "z" || e.key === "Z") controller.selectTool("undo");
      else if (e.key === "x" || e.key === "X") controller.selectTool("redo");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unsubSample();
      detachFallback();
      detachCanvas();
      unsubState();
      controller.dispose();
    };
  }, [controller, nui]);

  useEffect(() => {
    controller.setInkEnabled(active && !toolsDone);
    if (!nui) return;
    nui.setCanvasMode(active && !toolsDone);
    return () => nui.setCanvasMode(false);
  }, [active, toolsDone, controller, nui]);

  useEffect(() => {
    controller.resizeForDpr();
  }, [controller, resizeKey]);

  return (
    <div className="tut-scene tut-draw" data-testid="r83-tut-draw">
      {nui && active && !toolsDone ? <CanvasCursor tool={ctrlState.activeTool} paperRef={paperRef} /> : null}
      <div className="tut-draw__paper">
        <div ref={paperRef} className="sk-wrap">
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            aria-label={TUTORIAL_COPY.practiceCanvasAriaLabel}
            data-testid="r83-tut-canvas"
          />
        </div>
        <div ref={ghostRef} className="tut-draw__ghost" aria-hidden="true">
          <OwnerIcon name="gesture-pinch" size={40} />
        </div>
      </div>
      <Toolbar
        activeTool={ctrlState.activeTool}
        disabled={!active || toolsDone}
        variant="tutorial"
        usedTools={usedTools}
        onSelectTool={(tool) => controller.selectTool(tool)}
        onToolUsed={(tool) => {
          if (
            (tool === "undo" || tool === "redo") &&
            (ctrlState.usedTools.has("pencil") || ctrlState.usedTools.has("eraser") || ctrlState.hasInk)
          ) {
            setTriedTools((prev) => (prev.has(tool) ? prev : new Set([...prev, tool])));
          }
        }}
        testId="r83-tut-toolbar"
      />
    </div>
  );
}

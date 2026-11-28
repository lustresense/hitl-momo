"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import gsap from "gsap";
import { audio } from "@/src/audio";
import { consumeFreshUnlock, isStageCompleted } from "@/src/app/level-progress";
import type { MomoExpression } from "@/src/components/momo/momo-engine";
import { formatMomoLevelPrompt, type RibbonVisualState } from "@/src/domain/copy/levels";
import type { LevelDefinition } from "@/src/domain/levels";
import type { MomoStageHandle } from "@/src/features/shared";
import { isChromeElement, useNui } from "@/src/nui";
import type { RibbonDomRefs } from "./RibbonSlot";
import {
  RIBBON_SHADOW_PX, SPRING_LOCKED_DURATION_S, SPRING_REBOUND_DURATION_S, STATUS_FLASH_MS, UNLOCK_DELAY_MS,
  createRibbonPullController, outerRibbonPath, ribbonRestLength, selectNearestRibbon, shelfLayout, stitchRibbonPath,
  type RibbonActivateResult, type RibbonPullMoveResult, type RibbonPullReleaseResult,
  type RibbonRectLike, type RibbonSlotMeta, type ShelfDims,
} from "./ribbon-pull";
import { notchRate, shouldSoundRebound } from "./ribbon-audio";
import { prefersReducedMotion, useIsoLayoutEffect, useRibbonAnimations } from "./useRibbonAnimations";

const viewportSize = () => (typeof window === "undefined" ? { w: 1280, h: 720 } : { w: window.innerWidth, h: window.innerHeight });

export interface ResolvedRibbonSlot {
  readonly level: LevelDefinition;
  readonly state: RibbonVisualState;
  readonly locked: boolean;
  readonly isNext: boolean;
  readonly unlocking: boolean;
  readonly restLength: number;
}

export interface UseRibbonShelfOptions {
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly statusChipRef: RefObject<HTMLSpanElement | null>;
  readonly hintRef: RefObject<HTMLDivElement | null>;
  readonly momoRef: RefObject<MomoStageHandle | null>;
  readonly levels: readonly LevelDefinition[];
  readonly isLevelUnlocked: (stage: number) => boolean;
  readonly completedStages?: ReadonlySet<number>;
  readonly freshUnlockStage?: number | null;
  readonly entryHold: boolean;
  readonly onSelectLevel: (level: LevelDefinition) => void;
}

export function useRibbonShelf(opts: UseRibbonShelfOptions) {
  const { rootRef, statusChipRef, hintRef, momoRef, levels, isLevelUnlocked, completedStages, freshUnlockStage, entryHold, onSelectLevel } = opts;
  const nui = useNui();
  const [dims, setDims] = useState<ShelfDims>(() => { const v = viewportSize(); return shelfLayout(levels.length, v.w, v.h); });
  const [freshStage] = useState<number | null>(() => (freshUnlockStage !== undefined ? freshUnlockStage : consumeFreshUnlock()));
  const [revealed, setRevealed] = useState<boolean>(() => freshStage === null);
  const [statusMessage, setStatusMessage] = useState("");
  const [bubbleVisible, setBubbleVisible] = useState(!entryHold);
  const [momoExpression, setMomoExpression] = useState<MomoExpression>("Senang");

  const refsByStage = useRef(new Map<number, RibbonDomRefs>());
  const lenMapRef = useRef(new Map<number, { length: number }>());
  const pendingLengths = useRef(new Map<number, number>());
  const rafPaintId = useRef<number>(0);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragModeRef = useRef<"none" | "nui" | "dom">("none");

  const resolvedSlots = useMemo<ResolvedRibbonSlot[]>(() => {
    const base = levels.map((level) => {
      const open = isLevelUnlocked(level.stage);
      const isFresh = freshStage === level.stage;
      const locked = !open || (isFresh && !revealed);
      const done = !locked && (completedStages ? completedStages.has(level.stage) : isStageCompleted(level.stage));
      const state: RibbonVisualState = locked ? "locked" : done ? "done" : "open";
      return { level, state, locked, unlocking: isFresh && revealed, restLength: ribbonRestLength(dims.h, locked) };
    });
    const nextStage = base.find((s) => !s.locked && s.state !== "done")?.level.stage ?? null;
    return base.map((s) => ({ ...s, isNext: !s.locked && nextStage === s.level.stage }));
  }, [levels, isLevelUnlocked, freshStage, revealed, completedStages, dims.h]);

  const slotMetas = useMemo<RibbonSlotMeta[]>(() => resolvedSlots.map((s) => ({ stage: s.level.stage, locked: s.locked, restLength: s.restLength })), [resolvedSlots]);
  const allDone = resolvedSlots.length > 0 && resolvedSlots.every((s) => s.state === "done");
  const nextStage = resolvedSlots.find((s) => s.isNext)?.level.stage ?? null;
  const bubbleText = useMemo(() => formatMomoLevelPrompt({ freshStage, allDone, nextStage }), [freshStage, allDone, nextStage]);

  const pullCtrlRef = useRef<ReturnType<typeof createRibbonPullController> | null>(null);
  if (!pullCtrlRef.current) pullCtrlRef.current = createRibbonPullController(slotMetas, nextStage ?? resolvedSlots[0]?.level.stage ?? null);
  const pullCtrl = pullCtrlRef.current;

  const registerRefs = useCallback((stage: number, refs: RibbonDomRefs) => {
    if (!refs.btn && !refs.slot) return;
    refsByStage.current.set(stage, refs);
    if (!lenMapRef.current.has(stage)) lenMapRef.current.set(stage, { length: 0 });
  }, []);

  const paintRibbon = useCallback((stage: number, length: number) => {
    const refs = refsByStage.current.get(stage);
    if (!refs?.btn) return;
    const lenObj = lenMapRef.current.get(stage) ?? { length };
    lenObj.length = length;
    lenMapRef.current.set(stage, lenObj);
    refs.btn.style.setProperty("--bm-len", `${length}px`);
    if (refs.svg) {
      const vb = `0 0 ${dims.w + RIBBON_SHADOW_PX} ${length + RIBBON_SHADOW_PX}`;
      refs.svg.setAttribute("width", String(dims.w + RIBBON_SHADOW_PX));
      refs.svg.setAttribute("height", String(length + RIBBON_SHADOW_PX));
      refs.svg.setAttribute("viewBox", vb);
    }
    const outer = outerRibbonPath(dims.w, length);
    refs.shadowPath?.setAttribute("d", outer);
    refs.bodyPath?.setAttribute("d", outer);
    refs.stitchPath?.setAttribute("d", stitchRibbonPath(dims.w, length));
  }, [dims.w]);

  const schedulePaint = useCallback((stage: number, length: number) => {
    pendingLengths.current.set(stage, length);
    if (rafPaintId.current || typeof window === "undefined") return;
    rafPaintId.current = window.requestAnimationFrame(() => {
      rafPaintId.current = 0;
      for (const [st, len] of pendingLengths.current) paintRibbon(st, len);
      pendingLengths.current.clear();
    });
  }, [paintRibbon]);

  const hideBubble = useCallback(() => setBubbleVisible(false), []);
  const anims = useRibbonAnimations({
    rootRef, statusChipRef, hintRef, refsByStage, lenMapRef, shelfHeight: dims.h,
    entryHold, freshStage, revealed, statusMessage, paintRibbon, hideBubble, onSelectLevel,
  });

  const applyLitDom = useCallback((litStage: number | null) => {
    for (const [st, refs] of refsByStage.current) refs.btn?.classList.toggle("nui-lit", st === litStage);
  }, []);

  const flashLocked = useCallback((stage: number, msg: string) => {
    audio.emit("ui.denied"); // tap / Enter on a locked ribbon, or a tugged locked release: soft refusal
    setStatusMessage(msg); setMomoExpression("Berpikir");
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => { setStatusMessage(""); setMomoExpression("Senang"); statusTimer.current = null; }, STATUS_FLASH_MS);
    anims.shakeLockedRibbon(stage);
  }, [anims]);

  const applyPullMove = useCallback((res: RibbonPullMoveResult | null) => {
    if (!res) return;
    const btn = refsByStage.current.get(res.stage)?.btn;
    if (btn) {
      btn.dataset.pullProgress = res.progress.toFixed(3);
      if (!res.locked) {
        btn.dataset.notch = String(res.notch);
        btn.classList.toggle("is-armed", res.armed);
        // Locked ribbons never reach here with a notch (computeNotchCount is 0), so no tick for a refused pull.
        if (res.notchIncreased) audio.emit("ribbon.notch", { rate: notchRate(res.notch) });
        if (res.armedChanged && res.armed) audio.emit("ribbon.armed");
        if (res.notchIncreased && !prefersReducedMotion()) {
          anims.trackTween(gsap.fromTo(btn, { scaleX: 1.045 }, { scaleX: 1, duration: 0.22, ease: "back.out(3)", transformOrigin: "50% 0%" }));
        }
      }
    }
    schedulePaint(res.stage, res.length);
  }, [anims, schedulePaint]);

  const applyPullRelease = useCallback((rel: RibbonPullReleaseResult) => {
    if (rel.action === "none") return;
    const btn = refsByStage.current.get(rel.stage)?.btn, lenObj = lenMapRef.current.get(rel.stage);
    const slot = resolvedSlots.find((s) => s.level.stage === rel.stage);
    if (btn) { btn.classList.remove("is-pulling", "is-armed"); delete btn.dataset.notch; delete btn.dataset.pullProgress; }
    if (rafPaintId.current && typeof window !== "undefined") { window.cancelAnimationFrame(rafPaintId.current); rafPaintId.current = 0; }
    pendingLengths.current.delete(rel.stage);
    if (rel.action === "launch" && slot) { paintRibbon(rel.stage, rel.fromLength); anims.launchRibbon(slot.level, rel.restLength); return; } // launchRibbon emits ribbon.launch
    if (shouldSoundRebound(rel)) audio.emit("ribbon.rebound");
    if (lenObj && !prefersReducedMotion()) {
      lenObj.length = rel.fromLength;
      const isLocked = rel.action === "rebound-locked";
      anims.trackTween(gsap.to(lenObj, { length: rel.restLength, duration: isLocked ? SPRING_LOCKED_DURATION_S : SPRING_REBOUND_DURATION_S, ease: isLocked ? "elastic.out(1, 0.5)" : "elastic.out(1, 0.4)", onUpdate: () => paintRibbon(rel.stage, lenObj.length) }));
    } else paintRibbon(rel.stage, rel.restLength);
    if (rel.action === "rebound-locked" && rel.tugged) flashLocked(rel.stage, rel.message);
  }, [resolvedSlots, anims, flashLocked, paintRibbon]);

  const handleActivateResult = useCallback((res: RibbonActivateResult) => {
    if (res.action === "launch") { const slot = resolvedSlots.find((s) => s.level.stage === res.stage); if (slot) anims.autoPullRibbon(slot.level, slot.restLength); }
    else if (res.action === "locked") flashLocked(res.stage, res.message);
  }, [resolvedSlots, anims, flashLocked]);

  const readRects = useCallback((): RibbonRectLike[] => resolvedSlots.flatMap((s) => {
    const btn = refsByStage.current.get(s.level.stage)?.btn;
    if (!btn) return [];
    const r = btn.getBoundingClientRect();
    return [{ stage: s.level.stage, locked: s.locked, left: r.left, top: r.top, width: r.width || dims.w, height: r.height || s.restLength }];
  }), [resolvedSlots, dims.w]);

  useEffect(() => { pullCtrl.setSlots(slotMetas); applyLitDom(pullCtrl.getState().litStage); }, [pullCtrl, slotMetas, applyLitDom]);
  useIsoLayoutEffect(() => {
    for (const s of resolvedSlots) {
      if (s.unlocking) continue;
      const lenObj = lenMapRef.current.get(s.level.stage);
      if (lenObj) gsap.killTweensOf(lenObj);
      paintRibbon(s.level.stage, s.restLength);
    }
  }, [resolvedSlots, paintRibbon]);
  useEffect(() => {
    const onResize = () => { if (!pullCtrl.getState().launching) { const v = viewportSize(); setDims(shelfLayout(levels.length, v.w, v.h)); } };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [levels.length, pullCtrl]);
  useEffect(() => { setBubbleVisible(!entryHold); if (entryHold) pullCtrl.resetLaunch(); }, [entryHold, pullCtrl]);
  useEffect(() => {
    if (entryHold || freshStage === null || revealed) return;
    let alive = true, id = 0;
    void (async () => { await momoRef.current?.moveTo("strip", 700); if (alive) id = window.setTimeout(() => { if (alive) setRevealed(true); }, UNLOCK_DELAY_MS); })();
    return () => { alive = false; if (id) window.clearTimeout(id); };
  }, [entryHold, freshStage, revealed, momoRef]);

  const nuiCbRef = useRef({ readRects, applyLitDom, applyPullMove, applyPullRelease });
  nuiCbRef.current = { readRects, applyLitDom, applyPullMove, applyPullRelease };

  useEffect(() => {
    if (entryHold) return;
    const init = nui.getFrame();
    let prevPinch = init.pinch;
    let lastX = init.x, lastY = init.y;
    const isHandSource = () => nui.getFrame().source === "hand" || nui.getStatus().activeSource === "hand";
    const pickStage = (x: number, y: number, useZones: boolean) => {
      const st = pullCtrl.getState();
      return selectNearestRibbon(nuiCbRef.current.readRects(), x, y, useZones ? viewportSize().w : undefined, useZones ? st.litStage : undefined)?.stage ?? st.litStage;
    };
    const hoverAt = (x: number, y: number, useZones: boolean) => {
      const st = pullCtrl.getState();
      if (!st.launching && !st.activeDrag) nuiCbRef.current.applyLitDom(pullCtrl.focusStage(pickStage(x, y, useZones)));
    };
    const unsubSample = nui.subscribeSample((sample, chrome) => {
      if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) return;
      const blockedByChrome = chrome && sample.source !== "hand";
      if (sample.pinch && !prevPinch && !blockedByChrome && dragModeRef.current === "none") {
        const pt = sample.clickPoint ?? sample;
        const target = pickStage(pt.x, pt.y, isHandSource());
        const started = target !== null && pullCtrl.beginPull(target, sample.y) ? target : null;
        if (started !== null) {
          dragModeRef.current = "nui";
          const lenObj = lenMapRef.current.get(started);
          if (lenObj) gsap.killTweensOf(lenObj);
          nuiCbRef.current.applyLitDom(started);
          refsByStage.current.get(started)?.btn?.classList.add("is-pulling");
        }
      } else if (sample.pinch && prevPinch && dragModeRef.current === "nui") nuiCbRef.current.applyPullMove(pullCtrl.movePull(sample.y));
      else if (!sample.pinch && prevPinch && dragModeRef.current === "nui") { dragModeRef.current = "none"; nuiCbRef.current.applyPullRelease(pullCtrl.endPull(false)); }
      else if (!sample.pinch && sample.inFrame && dragModeRef.current === "none") { lastX = sample.x; lastY = sample.y; hoverAt(sample.x, sample.y, isHandSource()); }
      prevPinch = sample.pinch;
    });
    const unsubFrame = nui.subscribeFrame((frame) => {
      if (dragModeRef.current === "nui" && frame.source === "hand" && frame.pinch) nuiCbRef.current.applyPullMove(pullCtrl.movePull(frame.y));
      else if (dragModeRef.current === "none" && frame.inFrame) {
        const moved = frame.x !== lastX || frame.y !== lastY;
        lastX = frame.x; lastY = frame.y;
        if (frame.source === "hand" || moved) hoverAt(frame.x, frame.y, frame.source === "hand");
      } else { lastX = frame.x; lastY = frame.y; }
    });
    return () => { unsubSample(); unsubFrame(); if (dragModeRef.current === "nui") { dragModeRef.current = "none"; nuiCbRef.current.applyPullRelease(pullCtrl.endPull(true)); } };
  }, [entryHold, nui, pullCtrl]);

  useEffect(() => {
    if (entryHold) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input,textarea,select,[contenteditable]")) return;
      const res = pullCtrl.handleKeyDown(e.key);
      if (res.action === "ignored") return;
      e.preventDefault(); applyLitDom(res.stage);
      if (res.action === "focus") refsByStage.current.get(res.stage)?.btn?.focus({ preventScroll: true });
      else handleActivateResult(res);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entryHold, pullCtrl, applyLitDom, handleActivateResult]);

  useEffect(() => () => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    if (rafPaintId.current && typeof window !== "undefined") window.cancelAnimationFrame(rafPaintId.current);
    pullCtrl.resetLaunch();
  }, [pullCtrl]);

  const onPointerDown = useCallback((stage: number, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (entryHold || nui.getStatus().handAttached || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (dragModeRef.current !== "none" || isChromeElement(e.target) || !pullCtrl.beginPull(stage, e.clientY, e.pointerId)) return;
    dragModeRef.current = "dom";
    const lenObj = lenMapRef.current.get(stage);
    if (lenObj) gsap.killTweensOf(lenObj);
    applyLitDom(stage);
    refsByStage.current.get(stage)?.btn?.classList.add("is-pulling");
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  }, [entryHold, nui, pullCtrl, applyLitDom]);

  const onPointerMove = useCallback((_stage: number, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragModeRef.current === "dom" && !nui.getStatus().handAttached) applyPullMove(pullCtrl.movePull(e.clientY, e.pointerId));
  }, [nui, pullCtrl, applyPullMove]);

  const onPointerUp = useCallback((_stage: number, e: ReactPointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    if (dragModeRef.current !== "dom") return;
    const rel = pullCtrl.endPull(cancelled || nui.getStatus().handAttached, e.pointerId);
    if (rel.action !== "none") dragModeRef.current = "none";
    applyPullRelease(rel);
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
  }, [nui, pullCtrl, applyPullRelease]);

  const onClick = useCallback((stage: number) => {
    if (entryHold || nui.getStatus().handAttached || pullCtrl.consumeSuppressedClick(stage)) return;
    applyLitDom(stage);
    handleActivateResult(pullCtrl.activate(stage));
  }, [entryHold, nui, pullCtrl, applyLitDom, handleActivateResult]);

  return { dims, resolvedSlots, allDone, bubbleText, bubbleVisible, momoExpression, statusMessage, registerRefs, onPointerDown, onPointerMove, onPointerUp, onClick };
}

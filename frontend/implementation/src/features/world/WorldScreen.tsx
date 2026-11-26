"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import type { GameplayScreenProps } from "@/src/app/screens/GameplayScreen";
import type { MomoExpression } from "@/src/components/momo/momo-engine";
import { StageArtwork } from "@/src/components/stage-preview/StageArtwork";
import type { SceneIndex } from "@/src/components/stage-preview/scene-metadata";
import { CloudBand } from "@/src/components/ui/SkyBackdrop";
import { WORLD_COPY, formatWorldFailReason, normalizeWorldStage } from "@/src/domain/copy/world";
import { recordCompletedStage } from "@/src/app/level-progress";
import { MomoStage, type MomoStageHandle } from "@/src/features/shared/MomoStage";
import { R83Bubble, type R83BubbleHandle } from "@/src/features/shared/R83Bubble";
import { R83SkipBar } from "@/src/features/shared/R83SkipBar";
import { ScreenFrame } from "@/src/features/shared/ScreenFrame";
import type { AnchorName } from "@/src/features/shared/bubble-placement";
import { NuiProvider, useOptionalNui } from "@/src/nui";
import { FailPanel } from "./FailPanel";
import { FallFxOverlay } from "./FallFxOverlay";
import { GameplayHud } from "./GameplayHud";
import { Placement } from "./Placement";
import { PostPlaceGate, getPostPlaceBubbleSpec, type PostPlaceMode } from "./PostPlaceGate";
import { DEFAULT_WORLD_BOUNDS } from "./placement-controller";
import { CAMERA_WORLD_Y_PERCENT, SKY_TRANSITION_DURATIONS } from "./sky-transition";
import { SuccessPanel } from "./SuccessPanel";
import { useWorldRuntime } from "./useWorldRuntime";
import { useWorldSkip } from "./useWorldSkip";
import { mapWorldMood, prefersReducedMotion, useIsoLayoutEffect, worldNextStageLabel } from "./world-ui-helpers";
import "./world.css";

interface BubbleState {
  readonly anchor: AnchorName;
  readonly mood: MomoExpression;
  readonly text: string;
}

function WorldScreenInner({
  level,
  snapshot,
  phase,
  controller,
  characterDisplayName,
  creations,
  onCreationsChange,
  onBumpDrawingRevision,
  onBackToLevels,
  onWon,
  devTools = false,
  onDemoAttempt,
}: GameplayScreenProps) {
  const stage = normalizeWorldStage(level.stage);
  const rootRef = useRef<HTMLElement | null>(null);
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);
  const setRootNode = useCallback((el: HTMLElement | null) => {
    rootRef.current = el;
    setOverlayHost(el);
  }, []);
  const cameraRef = useRef<HTMLDivElement | null>(null);
  const nearRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const momoRef = useRef<MomoStageHandle | null>(null);
  const bubbleRef = useRef<R83BubbleHandle | null>(null);

  const runtime = useWorldRuntime({
    canvasRef, level, snapshot, controller, creations,
    onCreationsChange, onBumpDrawingRevision, onBackToLevels,
  });

  const [winLine, setWinLine] = useState("");
  const [postPlaceMode, setPostPlaceMode] = useState<PostPlaceMode>("none");
  const [riseBubbleHidden, setRiseBubbleHidden] = useState(false);
  const prevPhaseRef = useRef(phase);
  const cameFromRepositionRef = useRef(false);
  const risingActionRef = useRef<"createAnother" | "redraw">("createAnother");
  const [bubble, setBubble] = useState<BubbleState>(() => ({
    anchor: "corner",
    mood: mapWorldMood("Semangat"),
    text: WORLD_COPY.placement.fallingBubble,
  }));

  const handleReposition = useCallback(() => {
    cameFromRepositionRef.current = true;
    runtime.reposition();
  }, [runtime]);

  const handleStartRising = useCallback((action: "createAnother" | "redraw" = "createAnother") => {
    risingActionRef.current = action;
    setRiseBubbleHidden(false);
    setPostPlaceMode("rising");
  }, []);
  const handleRiseComplete = useCallback(() => {
    if (risingActionRef.current === "redraw") runtime.redraw();
    else runtime.createAnother();
  }, [runtime]);
  const handleStartPlay = useCallback(() => setPostPlaceMode("none"), []);
  const worldSkip = useWorldSkip({
    stage, phase, postPlaceMode, runtime, canvasRef, attemptId: snapshot.attemptId, onDemoAttempt,
    onStartRising: () => handleStartRising("createAnother"), onRiseComplete: handleRiseComplete,
    onStartPlay: handleStartPlay,
  });

  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (phase === "falling") cameFromRepositionRef.current = false;
    if (phase !== "gameplay" || runtime.outcome !== null) {
      setPostPlaceMode((cur) => (cur === "rising" && phase === "gameplay" && runtime.outcome === "fail" ? cur : "none"));
      return;
    }
    if (prevPhase === "placing") {
      if (cameFromRepositionRef.current) {
        cameFromRepositionRef.current = false;
        setPostPlaceMode("reposition-ready");
        return;
      }
      const placedCount = Math.max(1, creations.snapshot().length);
      const minDrawings = level.minDrawings ?? 2;
      setPostPlaceMode(placedCount < minDrawings ? "need-more" : "ready-play");
    }
  }, [phase, runtime.outcome, creations, level.minDrawings]);

  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    const cam = cameraRef.current;
    const near = nearRef.current;
    if (!root || !cam) return;
    if (postPlaceMode !== "rising") {
      setRiseBubbleHidden(false);
      gsap.set(cam, { clearProps: "transform" });
      return;
    }
    const dur = SKY_TRANSITION_DURATIONS.nextRiseS;
    const ctx = gsap.context(() => {
      gsap.fromTo(cam, { yPercent: 0 }, { yPercent: -CAMERA_WORLD_Y_PERCENT, duration: dur, ease: "power2.inOut" });
      if (near) gsap.fromTo(near, { y: -220 }, { y: 260, duration: dur, ease: "power1.inOut" });
    }, root);
    const hideId = window.setTimeout(() => setRiseBubbleHidden(true), Math.round(dur * 1000));
    return () => { window.clearTimeout(hideId); ctx.revert(); };
  }, [postPlaceMode]);

  useEffect(() => {
    if (postPlaceMode === "rising") {
      void momoRef.current?.moveTo("corner", 1700);
      setBubble(getPostPlaceBubbleSpec("rising", 1, level.minDrawings ?? 2, stage, characterDisplayName));
      return;
    }
    if (runtime.outcome === "fail") {
      void momoRef.current?.moveTo("mid", 650);
      setBubble({ anchor: "mid", mood: mapWorldMood("Berpikir"), text: formatWorldFailReason(runtime.failReason, characterDisplayName) });
      return;
    }
    if (runtime.outcome === "success") {
      void momoRef.current?.moveTo("side", 800);
      setBubble({ anchor: "side", mood: mapWorldMood("Bangga"), text: winLine || WORLD_COPY.win.lines(stage, characterDisplayName)[0]! });
      return;
    }
    void momoRef.current?.moveTo("corner", phase === "falling" ? 1100 : 700);
    if (phase === "falling") {
      setBubble({ anchor: "corner", mood: mapWorldMood("Semangat"), text: WORLD_COPY.placement.fallingBubble });
    } else if (phase === "placing") {
      setBubble({ anchor: "corner", mood: mapWorldMood("Semangat"), text: WORLD_COPY.placement.landedBubble });
    } else if (postPlaceMode !== "none") {
      const placedCount = Math.max(1, creations.snapshot().length);
      setBubble(getPostPlaceBubbleSpec(postPlaceMode, placedCount, level.minDrawings ?? 2, stage, characterDisplayName));
    } else {
      setBubble({ anchor: "corner", mood: mapWorldMood("Semangat"), text: WORLD_COPY.gameplay.playBubble(characterDisplayName) });
    }
  }, [phase, postPlaceMode, runtime.outcome, runtime.failReason, characterDisplayName, stage, winLine, creations, level.minDrawings]);

  const getThinmanRect = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const px = Number(canvas.dataset.playerX);
    const py = Number(canvas.dataset.playerY);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    const pw = Number(canvas.dataset.playerWidth) || 24;
    const ph = Number(canvas.dataset.playerHeight) || 40;
    const scale = Number(canvas.dataset.worldScale) || Math.min(rect.width / DEFAULT_WORLD_BOUNDS.width, rect.height / DEFAULT_WORLD_BOUNDS.height);
    const offsetX = Number(canvas.dataset.worldOffsetX) || (rect.width - DEFAULT_WORLD_BOUNDS.width * scale) / 2;
    const offsetY = Number(canvas.dataset.worldOffsetY) || (rect.height - DEFAULT_WORLD_BOUNDS.height * scale) / 2;
    return {
      left: rect.left + offsetX + px * scale,
      top: rect.top + offsetY + py * scale,
      width: pw * scale,
      height: ph * scale,
    };
  }, []);

  useIsoLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (runtime.outcome !== "fail" || !canvas || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.to(canvas, {
        keyframes: [
          { x: 8, duration: 0.06 },
          { x: -7, duration: 0.08 },
          { x: 5, duration: 0.08 },
          { x: -3, duration: 0.08 },
          { x: 1.5, duration: 0.08 },
          { x: 0, duration: 0.1 },
        ],
        ease: "sine.inOut",
      });
    }, canvas);
    return () => {
      ctx.revert();
      gsap.set(canvas, { x: 0 });
    };
  }, [runtime.outcome]);

  if (!snapshot.behavior || !snapshot.decision) return null;

  const isRising = postPlaceMode === "rising";

  return (
    <section
      ref={setRootNode}
      className="r83-world-root paper"
      data-testid="r83-world-stage"
      data-phase={phase}
      data-postplace={postPlaceMode}
      data-outcome={runtime.outcome ?? "none"}
      aria-label={WORLD_COPY.gameplay.sceneLabel(stage)}
    >
      <div
        ref={cameraRef}
        className={isRising ? "intro-camera r83-world-camera is-rising" : "intro-camera r83-world-camera"}
        data-testid="r83-world-camera"
      >
        <div className="cam-screen sky-top" />
        <div className="cam-screen band"><CloudBand layer="far" /></div>
        <div className="cam-screen world-screen">
          <div className="stage" data-l={stage}>
            <div ref={worldRef} className="world">
              <StageArtwork scene={stage as SceneIndex} gameplay nextStageLabel={worldNextStageLabel(stage)} />
              <canvas
                ref={canvasRef}
                width={800}
                height={450}
                className="r83-world-canvas"
                data-testid="r83-game-canvas"
                aria-label={`Dunia ${characterDisplayName} 2D`}
              />
              <FallFxOverlay phase={phase} canvasRef={canvasRef} />
              <Placement
                active={phase === "placing" && runtime.outcome === null}
                canvasRef={canvasRef}
                worldRef={worldRef}
                overlayHost={overlayHost}
                gameRef={runtime.gameRef}
                bubbleRef={bubbleRef}
                onExit={onBackToLevels}
                onRedraw={runtime.redraw}
              />
            </div>
          </div>
        </div>
      </div>

      <div ref={nearRef} className={isRising ? "intro-near on" : "intro-near"} data-testid="r83-world-near-clouds" aria-hidden="true">
        <CloudBand layer="near" />
      </div>

      <PostPlaceGate
        mode={postPlaceMode}
        stage={stage}
        bubbleRef={bubbleRef}
        onStartRising={() => handleStartRising("createAnother")}
        onRiseComplete={handleRiseComplete}
        onStartPlay={handleStartPlay}
      />
      <GameplayHud
        active={phase === "gameplay" && postPlaceMode === "none"}
        stage={stage}
        outcome={runtime.outcome}
        gameRef={runtime.gameRef}
        onExit={onBackToLevels}
        onReposition={handleReposition}
        onRedraw={() => handleStartRising("createAnother")}
      />
      {runtime.outcome === "success" ? (
        <SuccessPanel
          stage={stage}
          characterDisplayName={characterDisplayName}
          bubbleRef={bubbleRef}
          onWin={() => { recordCompletedStage(level.stage); onWon?.(); }}
          onLineChange={setWinLine}
          onContinue={runtime.finishWin}
        />
      ) : null}

      {runtime.error ? (
        <div className="k-chip bad r83-place-error" role="alert" data-testid="r83-world-error">
          {runtime.error}
        </div>
      ) : null}

      <MomoStage
        ref={momoRef}
        at={phase === "falling" ? "side" : "corner"}
        expression={bubble.mood}
        gazeTarget={getThinmanRect}
      />

      <R83Bubble
        ref={bubbleRef}
        text={bubble.text}
        visible={!riseBubbleHidden}
        anchor={bubble.anchor}
        momoRef={momoRef}
        extra={
          runtime.outcome === "fail" && !isRising ? (
            <FailPanel
              onRetry={runtime.retry}
              onReposition={handleReposition}
              onRedraw={() => handleStartRising("redraw")}
            />
          ) : undefined
        }
      />
      <R83SkipBar visible={devTools} align="right" label={worldSkip.label} onSkip={worldSkip.skip} />
    </section>
  );
}

/** Akar komposisi layar dunia r8.3 drop-in menerima `GameplayScreenProps`. */
export function WorldScreen(props: GameplayScreenProps) {
  const existingNui = useOptionalNui();
  const frame = (
    <ScreenFrame variant="page" testId="r83-world-screen">
      <WorldScreenInner {...props} />
    </ScreenFrame>
  );
  return existingNui ? frame : <NuiProvider devTools={Boolean(props.devTools)}>{frame}</NuiProvider>;
}

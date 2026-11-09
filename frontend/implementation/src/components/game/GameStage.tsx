"use client";
/**
 * World stage composition root. Wires the stage hooks (game controller, placement, input, hand
 * control, actions) to the presentational pieces; it owns no game logic of its own.
 */
import { useEffect, useRef, useState } from "react";
import { resolveCharacterDisplayName } from "@/src/config/character-tokens";
import type { GameController } from "@/src/game/game-controller";
import { getStageGeometry } from "@/src/game/stage-geometry";
import { useInputMode } from "@/src/hooks/useHandGesture";
import { StageWorld } from "../stage-preview/StageWorld";
import { ControlGuide } from "./ControlGuide";
import { CreationShortcuts } from "./CreationShortcuts";
import { EnterWorldPopup } from "./EnterWorldPopup";
import { FailOverlay } from "./FailOverlay";
import { GameplayControls } from "./GameplayControls";
import { InputStatusChip } from "./InputStatusChip";
import { PlacementControls } from "./PlacementControls";
import { StageHeader } from "./StageHeader";
import { SuccessPopup } from "./SuccessPopup";
import { WorldMomo } from "./WorldMomo";
import { useControlGuide } from "./hooks/useControlGuide";
import { useGameController } from "./hooks/useGameController";
import { useGameplayInput, useKeyboardInput } from "./hooks/useGameplayInput";
import { useHandControl } from "./hooks/useHandControl";
import { usePlacement } from "./hooks/usePlacement";
import { useSharedStreamLive } from "./hooks/useSharedStreamLive";
import { useStageActions } from "./hooks/useStageActions";
import type { GameStageProps, InputMode } from "./game-stage-types";
import styles from "./game-stage.module.css";

export type { GameStageProps } from "./game-stage-types";

export function GameStage(props: GameStageProps) {
  const { level, behavior, decision, drawingInput, phase, integrated } = props;
  const latest = useRef(props);
  latest.current = props;
  const characterName = resolveCharacterDisplayName(props.characterDisplayName);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GameController | null>(null);
  const geometry = integrated ? getStageGeometry(level.stage) : null;
  // The decided object is offered to the world first (pop-up); the world only starts when the student enters it.
  const [entered, setEntered] = useState(false);
  const [momoPoke, setMomoPoke] = useState(0);

  // R13: the app-wide input mode, plus a live camera stream. Only "camera" lets the hand steer.
  const appMode = useInputMode();
  const streamLive = useSharedStreamLive();
  // The hand reader failed (camera lost, model crashed): buttons take over until a camera returns.
  const [handFailed, setHandFailed] = useState(false);
  useEffect(() => {
    if (streamLive) setHandFailed(false);
  }, [streamLive, appMode]);
  const mode: InputMode = appMode === "camera" && streamLive && !handFailed ? "camera" : "fallback";

  const placement = usePlacement({ controllerRef, canvasRef, level, geometry, phase, integrated });
  const input = useGameplayInput({ controllerRef, phase, mode });
  const game = useGameController({
    canvasRef,
    controllerRef,
    latest,
    entered,
    integrated,
    creations: props.creations,
    level,
    behavior,
    decision,
    drawingInput,
    releaseManualInput: input.releaseManualInput,
    onFallPosition: (x, y) => {
      placement.setPosition(x);
      placement.setPlacementY(y);
    },
  });
  const { ready, error, outcome } = game;
  useKeyboardInput(input, { ready, phase, outcome });
  const hand = useHandControl({
    ready,
    phase,
    outcome,
    mode,
    input,
    latest,
    movePlacementToHandCursor: placement.movePlacementToHandCursor,
    onHandFailed: () => setHandFailed(true),
  });
  const actions = useStageActions({
    controllerRef,
    canvasRef,
    outcome,
    setOutcome: game.setOutcome,
    setFailReason: game.setFailReason,
    position: placement.position,
    placementY: placement.placementY,
    setPosition: placement.setPosition,
    setPlacementY: placement.setPlacementY,
    setPlacementError: placement.setPlacementError,
    onRetry: props.onRetry,
    onRedraw: props.onRedraw,
    onCreateAnotherObject: props.onCreateAnotherObject,
  });

  // Play-phase guide: opens when play starts, closes by itself or at the first movement.
  const guide = useControlGuide({
    active: phase === "gameplay" && !outcome && ready,
    moved: input.heldDirs.length > 0 || input.handDirs.length > 0,
  });

  return (
    <section id="screen-gameplay" className={integrated ? styles.root : "screen"} data-testid="world-stage">
      <StageHeader characterName={characterName} decision={decision} onDrawAgain={actions.drawAgain} />

      <div className={integrated ? styles.surface : undefined}>
        {integrated && <StageWorld scene={level.stage} gameplay />}
        <canvas
          ref={canvasRef}
          width={800}
          height={integrated ? 450 : 380}
          className={integrated ? styles.canvas : "game-canvas"}
          data-testid="game-canvas"
          aria-label={`Dunia ${characterName} 2D`}
          {...placement.canvasPointerHandlers}
        />
      </div>
      {error && <p role="alert">{error}</p>}
      {integrated && (props.creations?.length ?? 0) > 0 && phase === "gameplay" && !outcome && (
        <CreationShortcuts creations={props.creations ?? []} onSelect={actions.selectCreation} />
      )}

      {phase === "placing" && !error && (
        <PlacementControls
          confirmDisabled={!ready || !placement.legal}
          placementError={placement.placementError}
          onConfirm={actions.confirmPlacement}
        />
      )}

      {phase === "gameplay" && !outcome && (
        <GameplayControls
          mode={mode}
          heldDirs={input.heldDirs}
          handDirs={input.handDirs}
          onPress={input.pressPointer}
          onRelease={input.releasePointer}
          onReposition={actions.reposition}
          guideOpen={guide.open}
          onToggleGuide={guide.toggle}
        />
      )}
      {phase === "gameplay" && !outcome && guide.open && (
        <ControlGuide mode={mode} onClose={guide.close} />
      )}

      {outcome === "fail" && (
        <FailOverlay
          failReason={game.failReason}
          onRetry={actions.retryFromCheckpoint}
          onReposition={actions.reposition}
          onRedraw={props.onRedraw}
        />
      )}

      {outcome === "success" && (
        <SuccessPopup
          summary={props.summary}
          onWin={props.onLevelWon}
          onContinue={() => {
            props.onOutcomeReported("success");
            props.onBackToLevels?.();
          }}
        />
      )}

      {!entered && (
        <EnterWorldPopup
          label={decision.finalLabel}
          behavior={behavior}
          drawingInput={drawingInput}
          onEnter={() => setEntered(true)}
          onRedraw={props.onRedraw}
        />
      )}

      <WorldMomo
        entered={entered}
        outcome={outcome}
        phase={phase}
        canvasRef={canvasRef}
        geometry={geometry}
        position={placement.position}
        placementY={placement.placementY}
        poke={momoPoke}
        onPoke={() => setMomoPoke((n) => n + 1)}
        decision={decision}
      />

      {integrated && mode === "camera" && (
        <InputStatusChip>{hand.status} (uji coba)</InputStatusChip>
      )}
      {!integrated && (
        <InputStatusChip>
          {mode === "fallback" ? "FALLBACK pointer/keyboard — BUKAN NUI TERVERIFIKASI" : hand.status}
        </InputStatusChip>
      )}
      <p data-testid="world-phase" style={{ display: "none" }}>
        {phase === "falling" ? "FALL_ANIMATION" : phase === "placing" ? "PLACE" : "PLAY"}
      </p>
    </section>
  );
}

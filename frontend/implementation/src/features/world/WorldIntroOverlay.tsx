"use client";

import { useCallback, useRef } from "react";
import { StageArtwork } from "@/src/components/stage-preview/StageArtwork";
import type { SceneIndex } from "@/src/components/stage-preview/scene-metadata";
import { CloudBand } from "@/src/components/ui/SkyBackdrop";
import { ThinmanArt } from "@/src/components/ui/ThinmanArt";
import { WORLD_COPY, WORLD_LEVEL_COPY, normalizeWorldStage } from "@/src/domain/copy/world";
import type { LevelDefinition } from "@/src/domain/levels";
import { MomoStage, type MomoStageHandle } from "@/src/features/shared/MomoStage";
import { R83Bubble, type R83BubbleHandle } from "@/src/features/shared/R83Bubble";
import { R83SkipBar } from "@/src/features/shared/R83SkipBar";
import { ScreenFrame } from "@/src/features/shared/ScreenFrame";
import { getStageGeometry } from "@/src/game/stage-geometry";
import { NuiProvider, NuiRing, useOptionalNui } from "@/src/nui";
import { useIntroTimeline } from "./useIntroTimeline";
import { elementRect, mapWorldMood, usePinnedRingPosition, worldNextStageLabel } from "./world-ui-helpers";
import "./world.css";

export interface WorldIntroOverlayProps {
  readonly level: LevelDefinition;
  readonly characterDisplayName?: string | null;
  readonly devTools?: boolean;
  readonly onReveal?: () => void;
  readonly onFinish: () => void;
}

function WorldIntroContent({
  level,
  characterDisplayName,
  devTools = false,
  onReveal,
  onFinish,
}: WorldIntroOverlayProps) {
  const stage = normalizeWorldStage(level.stage);
  const geometry = getStageGeometry(stage);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<HTMLDivElement | null>(null);
  const nearRef = useRef<HTMLDivElement | null>(null);
  const dimRef = useRef<HTMLDivElement | null>(null);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const thinmanRef = useRef<HTMLDivElement | null>(null);
  const momoRef = useRef<MomoStageHandle | null>(null);
  const bubbleRef = useRef<R83BubbleHandle | null>(null);
  const ringHostRef = useRef<HTMLDivElement | null>(null);

  const intro = useIntroTimeline({
    stage,
    characterDisplayName,
    rootRef,
    cameraRef,
    nearRef,
    dimRef,
    chipRef,
    thinmanRef,
    momoRef,
    onReveal,
    onFinish,
  });

  const getThinmanRect = useCallback(() => elementRect(thinmanRef.current), []);
  const getBubbleRect = useCallback(() => bubbleRef.current?.rect() ?? null, []);
  usePinnedRingPosition(ringHostRef, {
    enabled: intro.ringVisible,
    side: "under",
    getAnchorRect: getBubbleRect,
    bubbleRef,
    anchorIsBubble: true,
  });

  return (
    <div
      ref={rootRef}
      className="level-intro"
      data-testid="r83-world-intro"
      data-phase={intro.phase}
      data-stage={stage}
    >
      <div ref={cameraRef} className="intro-camera">
        <div className="cam-screen sky-top" />
        <div className="cam-screen band">
          <CloudBand layer="far" />
        </div>
        <div className="cam-screen world-screen">
          <div className="stage" data-l={stage}>
            <div className="world">
              <StageArtwork
                scene={stage as SceneIndex}
                gameplay
                nextStageLabel={worldNextStageLabel(stage)}
              />
              <div className="actors">
                <div
                  ref={thinmanRef}
                  className="tm intro-thinman"
                  style={{
                    left: `${(geometry.spawn.x / 800) * 100}%`,
                    top: `${(geometry.spawn.y / 450) * 100}%`,
                    width: `${(13.5 / 4.9).toFixed(4)}%`,
                  }}
                >
                  <ThinmanArt />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div ref={nearRef} className="intro-near">
        <CloudBand layer="near" />
      </div>
      <div ref={dimRef} className="intro-dim" data-testid="r83-intro-dim" aria-hidden="true" />

      <div ref={chipRef} className="hud tr">
        <span className="k-chip" data-testid="r83-intro-title">
          {WORLD_LEVEL_COPY[stage].title}
        </span>
      </div>

      <MomoStage
        ref={momoRef}
        at="side"
        expression={mapWorldMood(intro.mood)}
        flapKey={intro.flapKey}
        gazeTarget={getThinmanRect}
      />

      <R83Bubble
        ref={bubbleRef}
        text={intro.bubbleText}
        visible={intro.bubbleVisible}
        anchor="side"
        momoRef={momoRef}
      />

      {intro.ringVisible ? (
        <div ref={ringHostRef} className="r83-ring-pinned">
          <NuiRing
            label={WORLD_COPY.intro.understandRingLabel}
            holdMs={1000}
            mode="any"
            testId="r83-intro-understand"
            onFire={intro.triggerRise}
          />
        </div>
      ) : null}

      {intro.phase !== "rise" && intro.phase !== "sky" ? (
        <div className="r83-hint" role="note" style={{ opacity: 1 }}>
          {WORLD_COPY.intro.hint}
        </div>
      ) : null}

      <R83SkipBar
        visible={devTools}
        align="right"
        label={WORLD_COPY.intro.sceneLabel(stage)}
        buttonTestId="r83-intro-skip"
        onSkip={intro.skip}
      />
    </div>
  );
}

/**
 * Intro dunia r8.3 (port `intro.js`): panggung gelap + spotlight bergerak per topik,
 * lalu mengangkat kamera melalui awan ke langit setelah ring "Aku mengerti".
 */
export function WorldIntroOverlay(props: WorldIntroOverlayProps) {
  const existingNui = useOptionalNui();
  const inner = (
    <ScreenFrame variant="page" testId="r83-intro-frame">
      <WorldIntroContent {...props} />
    </ScreenFrame>
  );
  return existingNui ? inner : <NuiProvider devTools={Boolean(props.devTools)}>{inner}</NuiProvider>;
}

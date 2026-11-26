"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { MomoExpression } from "@/src/components/momo/momo-engine";
import { WORLD_COPY, WORLD_LEVEL_COPY, normalizeWorldStage } from "@/src/domain/copy/world";
import type { AnchorName } from "@/src/features/shared/bubble-placement";
import type { R83BubbleHandle } from "@/src/features/shared/R83Bubble";
import { NuiRing } from "@/src/nui";
import { HOLD_MS_DEFAULT } from "@/src/nui/core/constants";
import { SKY_TRANSITION_DURATIONS } from "./sky-transition";
import { mapWorldMood, usePinnedRingPosition } from "./world-ui-helpers";

export type PostPlaceMode = "none" | "need-more" | "ready-play" | "reposition-ready" | "rising";

export interface PostPlaceBubbleSpec {
  readonly anchor: AnchorName;
  readonly mood: MomoExpression;
  readonly text: string;
}

export interface PostPlaceGateProps {
  readonly mode: PostPlaceMode;
  readonly stage: number;
  readonly bubbleRef: RefObject<R83BubbleHandle | null>;
  readonly onStartRising: () => void;
  readonly onRiseComplete: () => void;
  readonly onStartPlay: () => void;
}

const NEED_MORE_RING_DELAY_MS = 900;
const READY_PLAY_RING_DELAY_MS = 700;
const REPOSITION_RING_DELAY_MS = 500;
/** Durasi kamera naik ke langit (`pages.js:19-21`: 1,8 s pan + 250 ms jeda langit bersih). */
export const SKY_RISE_FINISH_MS = Math.round(SKY_TRANSITION_DURATIONS.nextRiseS * 1000) + 250;
const POST_PLACE_RING_HOLD_MS = HOLD_MS_DEFAULT;

/** Menentukan salinan & ekspresi bubble Momo selama gerbang pasca-penempatan (`pages.js:52-58, 71`). */
export function getPostPlaceBubbleSpec(
  mode: Exclude<PostPlaceMode, "none">,
  placedCount: number,
  minDrawings: number,
  stage: number,
  characterDisplayName?: string | null,
): PostPlaceBubbleSpec {
  if (mode === "need-more") {
    const remaining = Math.max(1, minDrawings - placedCount);
    return {
      anchor: "corner",
      mood: mapWorldMood("Penasaran"),
      text: WORLD_COPY.placement.needMoreObjectsBubble(remaining, stage, characterDisplayName),
    };
  }
  if (mode === "rising") {
    return {
      anchor: "corner",
      mood: mapWorldMood("Semangat"),
      text: WORLD_COPY.rise.bubble,
    };
  }
  if (mode === "reposition-ready") {
    return {
      anchor: "corner",
      mood: mapWorldMood("Semangat"),
      text: WORLD_COPY.placement.repositionReadyBubble,
    };
  }
  return {
    anchor: "corner",
    mood: mapWorldMood("Semangat"),
    text: WORLD_COPY.placement.readyPlayBubble,
  };
}

function delayForMode(mode: PostPlaceMode): number {
  if (mode === "need-more") return NEED_MORE_RING_DELAY_MS;
  if (mode === "reposition-ready") return REPOSITION_RING_DELAY_MS;
  return READY_PLAY_RING_DELAY_MS;
}

/**
 * Gerbang pasca-penempatan r8.3 (port `pages.js:52-58, 71`):
 * - `need-more`: jeda 900 ms -> ring Aturan A "Gambar lagi" (1000 ms) -> `rising` (900 ms) -> ke kanvas.
 * - `ready-play`: jeda 700 ms -> ring Aturan A "Mulai" (1000 ms) -> mulai bermain.
 * - `reposition-ready`: jeda 500 ms -> ring Aturan A "Mulai" (1000 ms) -> lanjut bermain.
 */
export function PostPlaceGate({
  mode,
  stage,
  bubbleRef,
  onStartRising,
  onRiseComplete,
  onStartPlay,
}: PostPlaceGateProps) {
  const s = normalizeWorldStage(stage);
  const [ringVisible, setRingVisible] = useState(false);
  const ringHostRef = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);

  const cbRef = useRef({ onStartRising, onRiseComplete, onStartPlay });
  cbRef.current = { onStartRising, onRiseComplete, onStartPlay };

  useEffect(() => {
    firedRef.current = false;
    setRingVisible(false);

    if (mode === "none") return;

    if (mode === "rising") {
      const id = setTimeout(() => {
        if (firedRef.current) return;
        firedRef.current = true;
        cbRef.current.onRiseComplete();
      }, SKY_RISE_FINISH_MS);
      return () => clearTimeout(id);
    }

    const id = setTimeout(() => {
      setRingVisible(true);
    }, delayForMode(mode));
    return () => clearTimeout(id);
  }, [mode]);

  const handleRingFire = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (mode === "need-more") {
      cbRef.current.onStartRising();
      return;
    }
    if (mode === "ready-play" || mode === "reposition-ready") {
      cbRef.current.onStartPlay();
    }
  }, [mode]);

  const getBubbleRect = useCallback(() => bubbleRef.current?.rect() ?? null, [bubbleRef]);
  const showRing = ringVisible && (mode === "need-more" || mode === "ready-play" || mode === "reposition-ready");

  usePinnedRingPosition(ringHostRef, {
    enabled: showRing,
    side: "under",
    getAnchorRect: getBubbleRect,
    bubbleRef,
    anchorIsBubble: true,
  });

  if (mode === "none") return null;

  const ringLabel =
    mode === "need-more"
      ? WORLD_COPY.placement.needMoreRingLabel
      : WORLD_COPY.placement.readyPlayRingLabel;

  return (
    <div data-testid="r83-postplace-gate" data-mode={mode}>
      {mode !== "rising" ? (
        <div className="hud tr">
          <span className="k-chip" data-testid="r83-hud-level">
            {WORLD_LEVEL_COPY[s].title}
          </span>
        </div>
      ) : null}

      {showRing ? (
        <div ref={ringHostRef} className="r83-ring-pinned">
          <NuiRing
            key={mode}
            label={ringLabel}
            holdMs={POST_PLACE_RING_HOLD_MS}
            mode="any"
            testId="r83-postplace-ring"
            onFire={handleRingFire}
          />
        </div>
      ) : null}
    </div>
  );
}

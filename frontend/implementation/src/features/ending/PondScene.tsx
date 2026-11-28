"use client";

import { useEffect, useRef, type Dispatch, type RefObject } from "react";
import { audio } from "@/src/audio";
import { ENDING_AI_TALK_LINES } from "@/src/domain/copy/ending";
import type { MomoStageHandle } from "@/src/features/shared/MomoStage";
import type { R83BubbleHandle } from "@/src/features/shared/R83Bubble";
import { UnderstandRing } from "./UnderstandRing";
import { screenPxToUnits, worldPercentW, worldPercentX, worldPercentY } from "./end-camera";
import {
  POND_EXIT_X,
  POND_X,
  TALK_SPOT_X,
  computeSafeTalkZone,
  sampleGroundY,
} from "./end-walker";
import {
  isEndingFrontRigActive,
  type EndingEvent,
  type EndingMachineState,
} from "./ending-machine";
import { createThinmanFrontRig, runPondDiveSequence } from "./pond-timeline";
import { usePondWalkerLoop } from "./usePondWalkerLoop";

const clampMs = (len: number) => Math.max(1700, Math.min(3600, len * 55));

export interface PondSceneProps {
  readonly state: EndingMachineState;
  readonly dispatch: Dispatch<EndingEvent>;
  readonly worldRef: RefObject<HTMLDivElement | null>;
  readonly camRef: RefObject<HTMLDivElement | null>;
  readonly heroRef: RefObject<HTMLDivElement | null>;
  readonly artRef: RefObject<HTMLDivElement | null>;
  readonly momoRef: RefObject<MomoStageHandle | null>;
  readonly bubbleRef: RefObject<R83BubbleHandle | null>;
  readonly hintRef: RefObject<HTMLDivElement | null>;
  readonly onThinmanPoke: () => void;
}

/**
 * Fase 2 (`kolam`) & Fase 3 (`bicara`) + menjaga Thinman pose depan selama `rekap` & `akhir`.
 */
export function PondScene({
  state,
  dispatch,
  worldRef,
  camRef,
  heroRef,
  artRef,
  momoRef,
  bubbleRef,
  hintRef,
  onThinmanPoke,
}: PondSceneProps) {
  const pondRef = useRef<HTMLDivElement | null>(null);
  const fxRef = useRef<HTMLDivElement | null>(null);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const { walkerRef, camStateRef, heroRendererRef, frontRigRef, spotSentRef } =
    usePondWalkerLoop({
      state,
      dispatch,
      worldRef,
      camRef,
      heroRef,
      artRef,
      pondRef,
      momoRef,
      onThinmanPoke,
    });

  useEffect(() => {
    const heroEl = heroRef.current;
    const artEl = artRef.current;
    const pondEl = pondRef.current;
    const fxLayer = fxRef.current;
    const worldEl = worldRef.current ?? heroEl?.closest<HTMLDivElement>(".world") ?? null;
    const renderer = heroRendererRef.current;
    if (!heroEl || !artEl || !pondEl || !fxLayer || !worldEl || !renderer) return;

    if (state.phase === "kolam" && state.kolamSubPhase === "diving") {
      walkerRef.current = { ...walkerRef.current, hold: true };
      const dive = runPondDiveSequence({
        heroEl,
        pondEl,
        fxLayer,
        worldEl,
        heroRenderer: renderer,
        startX: walkerRef.current.x,
        onFollowCam: (x) => {
          camStateRef.current.tgtX = x;
          camStateRef.current.tgtFrac = 0.5;
        },
      });
      let alive = true;
      void dive.promise.then(() => {
        if (!alive) return;
        walkerRef.current = {
          ...walkerRef.current,
          x: POND_EXIT_X,
          y: sampleGroundY(POND_EXIT_X),
          face: -1,
          hold: false,
        };
        dispatchRef.current({ type: "DIVE_DONE" });
      });
      return () => {
        alive = false;
        dive.cancel();
      };
    }

    if (state.phase === "kolam" && state.kolamSubPhase === "emerged") {
      const id = setTimeout(() => dispatchRef.current({ type: "KOLAM_DONE" }), 1100);
      return () => clearTimeout(id);
    }

    if (state.phase === "bicara" && state.bicaraSubPhase === "walking-to-spot") {
      spotSentRef.current = false;
      camStateRef.current.tgtX = TALK_SPOT_X;
      camStateRef.current.tgtFrac = 0.42;
      walkerRef.current = {
        ...walkerRef.current,
        hold: false,
        enabled: true,
        autoTargetX: TALK_SPOT_X,
      };
    }

    if (state.phase === "bicara" && state.bicaraSubPhase === "turning") {
      walkerRef.current = {
        ...walkerRef.current,
        x: TALK_SPOT_X,
        y: sampleGroundY(TALK_SPOT_X),
        vx: 0,
        hold: true,
        autoTargetX: null,
      };
      renderer.place(TALK_SPOT_X, sampleGroundY(TALK_SPOT_X));
      let active = true;
      const rig = frontRigRef.current ?? createThinmanFrontRig(heroEl, artEl);
      frontRigRef.current = rig;
      void (async () => {
        await rig.turn();
        if (!active) return;
        rig.idle();
        // The front-facing Thinman waves at the student (a Momo-side paper/air sound, no voice).
        audio.emit("momo.wave");
        void rig.wave();
        await momoRef.current?.moveTo("ending", 1000);
        if (active) dispatchRef.current({ type: "BICARA_TURN_DONE" });
      })();
      return () => {
        active = false;
      };
    }

    if (state.phase === "bicara" && state.bicaraSubPhase === "speaking") {
      void frontRigRef.current?.nod();
      const line = ENDING_AI_TALK_LINES[state.talkLineIndex] ?? "";
      const isLast = state.talkLineIndex >= ENDING_AI_TALK_LINES.length - 1;
      const delay = clampMs(line.length) + (isLast ? 300 : 0);
      const id = setTimeout(() => dispatchRef.current({ type: "BICARA_NEXT_LINE" }), delay);
      return () => clearTimeout(id);
    }

    if (state.phase === "rekap") {
      const bRect = bubbleRef.current?.rect();
      const wRect = worldEl.getBoundingClientRect();
      if (wRect.width > 0) {
        const nextZone = computeSafeTalkZone({
          bubbleLeftPx: bRect ? bRect.left : null,
          bubbleWidthPx: bRect ? bRect.width : 0,
          heroWidthPx: heroEl.getBoundingClientRect().width,
          viewportW: window.innerWidth,
          pxToUnits: (px) => screenPxToUnits(px, wRect.left, wRect.width),
        });
        walkerRef.current = {
          ...walkerRef.current,
          zone: nextZone,
          x: Math.max(nextZone[0], Math.min(nextZone[1], walkerRef.current.x)),
        };
      }
    }
    return undefined;
  }, [
    state.phase,
    state.kolamSubPhase,
    state.bicaraSubPhase,
    state.talkLineIndex,
    heroRef,
    artRef,
    worldRef,
    momoRef,
    bubbleRef,
    walkerRef,
    camStateRef,
    heroRendererRef,
    frontRigRef,
    spotSentRef,
  ]);

  useEffect(() => {
    const heroEl = heroRef.current;
    if (!heroEl) return;
    const interactive = isEndingFrontRigActive(state);
    heroEl.style.pointerEvents = interactive ? "auto" : "none";
    heroEl.style.cursor = interactive ? "pointer" : "default";
  }, [state, heroRef]);

  return (
    <>
      <div
        ref={pondRef}
        className="pond"
        data-testid="r83-ending-pond"
        style={{
          left: `${worldPercentX(POND_X)}%`,
          top: `${worldPercentY(sampleGroundY(POND_X) + 1)}%`,
          width: `${worldPercentW(78)}%`,
          transform: "translate(-50%, -50%)",
        }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 150 40" aria-hidden="true">
          <ellipse cx="75" cy="22" rx="70" ry="15" fill="#15171b" stroke="#111" strokeWidth="3.4" />
          <path d="M20 18Q42 8 76 9" fill="none" stroke="#fffdf6" strokeOpacity=".6" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M108 13Q122 15 128 20" fill="none" stroke="#fffdf6" strokeOpacity=".35" strokeWidth="2.4" strokeLinecap="round" />
          <ellipse className="idle-rip" cx="75" cy="22" rx="34" ry="6.5" fill="none" stroke="#fffdf6" strokeOpacity=".32" strokeWidth="1.6" />
        </svg>
      </div>
      <div ref={fxRef} className="r83-ending-fx" aria-hidden="true" />
      {state.phase === "bicara" && state.bicaraSubPhase === "waiting-confirm" ? (
        <UnderstandRing
          momoRef={momoRef}
          bubbleRef={bubbleRef}
          hintRef={hintRef}
          onConfirm={() => dispatch({ type: "BICARA_CONFIRMED" })}
        />
      ) : null}
    </>
  );
}

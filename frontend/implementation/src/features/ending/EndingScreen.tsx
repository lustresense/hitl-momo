"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import gsap from "gsap";
import { audio } from "@/src/audio";
import type { CenterOfPageProps } from "@/src/components/ending/CenterOfPage";
import { ENDING_COPY, ENDING_FINISH_LINES } from "@/src/domain/copy/ending";
import { MomoStage, type MomoStageHandle } from "@/src/features/shared/MomoStage";
import { R83Bubble, type R83BubbleHandle } from "@/src/features/shared/R83Bubble";
import { R83SkipBar } from "@/src/features/shared/R83SkipBar";
import { ScreenFrame } from "@/src/features/shared/ScreenFrame";
import type { EndingTarget } from "@/src/features/shared/bubble-placement";
import { HandLegend, NuiProvider, useOptionalNui } from "@/src/nui";
import { BackToCoverRing } from "./BackToCoverRing";
import { CenterArt } from "./CenterArt";
import { ParachuteScene } from "./ParachuteScene";
import { PondScene } from "./PondScene";
import { RecapChat } from "./RecapChat";
import { worldPercentW } from "./end-camera";
import { getEndingDisplay } from "./ending-display";
import {
  createInitialEndingState,
  endingReducer,
  sortRecapsByLevel,
  type EndingPhase,
} from "./ending-machine";
import "./ending.css";

export interface EndingScreenProps extends CenterOfPageProps {
  /** Nama siswa opsional dari sesi sampul. */
  readonly studentName?: string;
  /** Fase awal opsional (untuk pengujian & capture paritas). */
  readonly initialPhase?: EndingPhase;
  /** Aktifkan alat dev NUI (default false). */
  readonly devTools?: boolean;
}

const clampMs = (len: number) => Math.max(1700, Math.min(3600, len * 55));

/** Label adegan persis `sandbox-r8.3` (`shared/end/end.js`). */
const ENDING_SKIP_LABELS: Record<EndingPhase, string> = {
  payung: "Terjun payung",
  kolam: "Kolam tinta",
  bicara: "Penjelasan Momo",
  rekap: "Rekap",
  akhir: "Akhir",
};

function EndingScreenContent({ recaps, onChoose, initialPhase = "payung", devTools = false }: EndingScreenProps) {
  const sortedRecaps = useMemo(() => sortRecapsByLevel(recaps), [recaps]);
  const [state, dispatch] = useReducer(
    endingReducer,
    { recapCount: sortedRecaps.length, initialPhase },
    createInitialEndingState,
  );
  const [payungLineStep, setPayungLineStep] = useState<0 | 1 | 2>(0);
  const [pokeShock, setPokeShock] = useState(false);

  const worldRef = useRef<HTMLDivElement | null>(null);
  const camRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const heroArtRef = useRef<HTMLDivElement | null>(null);
  const momoRef = useRef<MomoStageHandle | null>(null);
  const bubbleRef = useRef<R83BubbleHandle | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);
  const pokeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pokeTweenRef = useRef<gsap.core.Tween | null>(null);
  const chooseSentRef = useRef(false);
  const closeJingleRef = useRef(false);

  useEffect(() => {
    dispatch({ type: "SYNC_RECAP_COUNT", recapCount: sortedRecaps.length });
  }, [sortedRecaps.length]);

  useEffect(() => {
    if (state.phase !== "akhir" || state.akhirSubPhase !== "speaking") return undefined;
    const line = ENDING_FINISH_LINES[state.finishLineIndex] ?? "";
    const delay = state.finishLineIndex >= ENDING_FINISH_LINES.length - 1 ? 400 : clampMs(line.length);
    const id = setTimeout(() => dispatch({ type: "AKHIR_NEXT_LINE" }), delay);
    return () => clearTimeout(id);
  }, [state.phase, state.akhirSubPhase, state.finishLineIndex]);

  useEffect(() => () => {
    if (pokeTimerRef.current) clearTimeout(pokeTimerRef.current);
    pokeTweenRef.current?.kill();
    pokeTweenRef.current = null;
  }, []);

  const readEndingTarget = useCallback((): EndingTarget | null => {
    const r = heroRef.current?.getBoundingClientRect();
    return r && r.height > 0 ? { right: r.right, top: r.top, height: r.height } : null;
  }, []);

  const readHeroGazeRect = useCallback(() => {
    const r = heroRef.current?.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0
      ? { left: r.left, top: r.top, width: r.width, height: r.height }
      : null;
  }, []);

  const handleThinmanPoke = useCallback(() => {
    if (pokeTimerRef.current) return;
    audio.emit("thinman.poke");
    setPokeShock(true);
    const momo = momoRef.current;
    if (momo) {
      const baseY = momo.pose().y;
      const proxy = { y: baseY };
      pokeTweenRef.current?.kill();
      pokeTweenRef.current = gsap.to(proxy, {
        y: baseY - 12,
        duration: 0.35,
        yoyo: true,
        repeat: 1,
        ease: "sine.inOut",
        onUpdate: () => {
          const cur = momoRef.current?.pose();
          if (cur) momoRef.current?.setPose({ ...cur, y: proxy.y });
        },
        onComplete: () => {
          pokeTweenRef.current = null;
        },
      });
    }
    pokeTimerRef.current = setTimeout(() => { setPokeShock(false); pokeTimerRef.current = null; }, 900);
  }, []);

  /** Recap confirmed: the final phase really begins. The closing jingle plays once, never for a dev skip or a restart. */
  const handleRecapConfirmed = useCallback(() => {
    if (!closeJingleRef.current) {
      closeJingleRef.current = true;
      audio.emit("jingle.ending_close");
    }
    dispatch({ type: "REKAP_CONFIRMED" });
  }, []);

  const handleConfirmBack = useCallback(() => {
    if (chooseSentRef.current) return;
    chooseSentRef.current = true;
    dispatch({ type: "AKHIR_CONFIRMED" });
    onChoose("finish");
  }, [onChoose]);

  /** "Lewati" (paritas `end.js`): satu adegan per tekanan; di "Akhir" ucapan dulu, baru kembali ke sampul. */
  const handleEndingSkip = useCallback(() => {
    if (state.phase === "payung") dispatch({ type: "PAYUNG_DONE" });
    else if (state.phase === "kolam") dispatch({ type: "RESET", initialPhase: "bicara" });
    else if (state.phase === "bicara") dispatch({ type: "RESET", initialPhase: "rekap" });
    else if (state.phase === "rekap") dispatch({ type: "RESET", initialPhase: "akhir" });
    else if (state.akhirSubPhase === "speaking") {
      for (let i = state.finishLineIndex; i < ENDING_FINISH_LINES.length; i++) dispatch({ type: "AKHIR_NEXT_LINE" });
    } else handleConfirmBack();
  }, [state.phase, state.akhirSubPhase, state.finishLineIndex, handleConfirmBack]);

  const display = getEndingDisplay(state, sortedRecaps, payungLineStep);
  const gazeActive =
    (state.phase === "bicara" && state.bicaraSubPhase !== "walking-to-spot") ||
    state.phase === "rekap" ||
    state.phase === "akhir";

  return (
    <ScreenFrame variant="page" testId="r83-ending-screen" ariaLabel={ENDING_COPY.screenTitle}>
      <div id="app" className="r83-ending-app" data-phase={state.phase} data-testid="r83-ending-app">
        <div id="scene">
          <div className="sc">
            <div className="stage" data-l="4">
              <div className="cam" ref={camRef}>
                <div className="world" ref={worldRef}>
                  <CenterArt />
                  <div className="actors">
                    <div
                      ref={heroRef}
                      className={`tm${state.thinmanAlive ? " alive" : ""}`}
                      style={{ width: `${worldPercentW(13.5)}%` }}
                      data-testid="r83-ending-thinman"
                      data-alive={state.thinmanAlive ? "true" : "false"}
                      aria-label={ENDING_COPY.thinmanAriaLabel}
                    >
                      <div className="tm-art" ref={heroArtRef} />
                    </div>
                    {state.phase === "payung" ? (
                      <ParachuteScene
                        worldRef={worldRef}
                        camRef={camRef}
                        heroRef={heroRef}
                        artRef={heroArtRef}
                        momoRef={momoRef}
                        onLineStep={setPayungLineStep}
                        onTouchdown={() => dispatch({ type: "PAYUNG_TOUCHDOWN" })}
                        onLanded={() => dispatch({ type: "PAYUNG_DONE" })}
                      />
                    ) : (
                      <PondScene
                        state={state}
                        dispatch={dispatch}
                        worldRef={worldRef}
                        camRef={camRef}
                        heroRef={heroRef}
                        artRef={heroArtRef}
                        momoRef={momoRef}
                        bubbleRef={bubbleRef}
                        hintRef={hintRef}
                        onThinmanPoke={handleThinmanPoke}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <MomoStage
          ref={momoRef}
          at={display.momoAnchor}
          expression={pokeShock ? "Kaget" : display.momoExpression}
          gazeTarget={gazeActive ? readHeroGazeRect : undefined}
          endingTarget={readEndingTarget}
        />

        <R83Bubble
          ref={bubbleRef}
          text={display.bubbleText}
          visible={display.bubbleVisible}
          anchor={display.momoAnchor}
          momoRef={momoRef}
        >
          {state.phase === "rekap" ? (
            <RecapChat
              recaps={sortedRecaps}
              subPhase={state.rekapSubPhase}
              revealedCount={state.revealedRecapCount}
              onIntroDone={() => dispatch({ type: "REKAP_INTRO_DONE" })}
              onItemLanded={() => dispatch({ type: "REKAP_ITEM_LANDED" })}
              onFlyDone={() => dispatch({ type: "REKAP_FLY_DONE" })}
              onCountsDone={() => dispatch({ type: "REKAP_COUNTS_DONE" })}
              onConfirmNext={handleRecapConfirmed}
            />
          ) : state.phase === "akhir" && state.akhirSubPhase === "waiting-back" ? (
            <BackToCoverRing onConfirm={handleConfirmBack} disabled={state.completed} />
          ) : null}
        </R83Bubble>

        <div
          ref={hintRef}
          className={`r83-hint${display.hintTopRight ? " top tr" : ""}`}
          role="note"
          data-testid="r83-ending-hint"
          style={{ opacity: display.hintText ? 1 : 0 }}
        >
          {display.hintText}
        </div>
      </div>
      <HandLegend />
      <R83SkipBar visible={devTools} align="right" label={ENDING_SKIP_LABELS[state.phase]} onSkip={handleEndingSkip} />
    </ScreenFrame>
  );
}

/** Akar komposisi Penutup r8.3 (drop-in pengganti `CenterOfPage`). */
export function EndingScreen(props: EndingScreenProps) {
  const existingNui = useOptionalNui();
  if (existingNui) {
    return <EndingScreenContent {...props} />;
  }
  return (
    <NuiProvider devTools={props.devTools ?? false}>
      <EndingScreenContent {...props} />
    </NuiProvider>
  );
}

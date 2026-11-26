"use client";

import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { MomoAvatar } from "@/src/components/momo/MomoAvatar";
import type { MomoExpression } from "@/src/components/momo/momo-engine";
import {
  COVER_GATE_COPY, COVER_HERO_COPY, COVER_INTRO_COPY, COVER_NAME_COPY,
  formatCoverIntroLine0, formatNameConfirmPrompt, formatNameGreeting,
} from "@/src/domain/copy/cover";
import { parseBubbleSegments, ScreenFrame } from "@/src/features/shared";
import { R83SkipBar } from "@/src/features/shared/R83SkipBar";
import { HandLegend, NuiProvider, useOptionalNui } from "@/src/nui";
import { AyoRing } from "./AyoRing";
import { BookCurlTransition } from "./BookCurlTransition";
import { CameraConsentGate } from "./CameraConsentGate";
import { CoverCameraCard } from "./CoverCameraCard";
import { CoverBrandLogo, CoverDoodles, CoverHero, CoverSpiralBinding } from "./CoverDecorations";
import { coverReducer, createInitialCoverState, isBookVisiblePhase, isNuiActivePhase, type CoverPhase } from "./cover-machine";
import { NameConfirm } from "./name/NameConfirm";
import { NameStep } from "./name/NameStep";
import { useCoverCamera, type CoverScreenCameraState } from "./useCoverCamera";
import { useCoverTimeline } from "./useCoverTimeline";
import "./cover.css";

export interface CoverCompleteResult { readonly studentName: string; readonly needsRuler: boolean; readonly demoName?: boolean }

export interface CoverScreenProps {
  readonly hasJoinToken: boolean;
  readonly onComplete: (result: CoverCompleteResult) => void;
  readonly onCameraToggle?: (
    nextOn: boolean,
    deviceId?: string,
  ) => Promise<boolean | "idle" | "requesting" | "live" | "denied" | "unavailable" | void> | boolean | "idle" | "requesting" | "live" | "denied" | "unavailable" | void;
  readonly onCameraDeviceChange?: (deviceId: string) => void;
  readonly cameraState?: CoverScreenCameraState;
  readonly nuiWarming?: boolean;
  readonly devTools?: boolean;
  /** Sembunyikan bilah "Lewati" (mis. saat sampul masih tertutup layar muat). */
  readonly hideSkipBar?: boolean;
  readonly cameraSlot?: ReactNode;
  readonly rulerSlot?: ReactNode;
  readonly initialPhase?: CoverPhase;
  readonly initialStudentName?: string;
  readonly skipNameStep?: boolean;
  readonly onPhaseChange?: (phase: CoverPhase) => void;
}

const STAGE_PHASE_MAP: Record<CoverPhase, string> = {
  sleep: "sleep", gate: "gate", "camera-on": "camera-on", wake: "launch", intro: "chat",
  ayo: "ready", "book-curl": "book", name: "inside", "name-confirm": "inside",
  "name-exit": "inside", ruler: "inside", handoff: "inside",
};

/** Label adegan persis `sandbox-r8.3` (`onboarding/cam`, daftar `L`). */
function coverSkipLabel(phase: CoverPhase): string {
  if (phase === "sleep" || phase === "gate" || phase === "camera-on") return "Kamera · Momo tidur";
  if (phase === "wake" || phase === "intro" || phase === "ayo") return "Momo bangun";
  if (phase === "book-curl") return "Buka buku";
  return "Nama";
}

function CoverScreenInner({
  hasJoinToken, onComplete, onCameraToggle, onCameraDeviceChange,
  cameraState, nuiWarming = false, devTools = false, hideSkipBar = false, cameraSlot, rulerSlot,
  initialPhase = "sleep", initialStudentName, skipNameStep, onPhaseChange,
}: CoverScreenProps) {
  const [state, dispatch] = useReducer(
    coverReducer,
    { hasJoinToken, initialPhase, initialStudentName, skipNameStep },
    (init) => createInitialCoverState(init),
  );

  useEffect(() => {
    if (initialStudentName !== undefined || skipNameStep !== undefined) {
      dispatch({ type: "SYNC_IDENTITY", studentName: initialStudentName, skipNameStep });
    }
  }, [initialStudentName, skipNameStep]);
  const [momoMood, setMomoMood] = useState<MomoExpression>("Ngantuk");
  const [flapKey, setFlapKey] = useState(0);
  const [waveKey, setWaveKey] = useState(0);
  const [insideBubbleText, setInsideBubbleText] = useState<string>(COVER_NAME_COPY.bubbleInitial);
  const bookFrontCoverRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);

  const onMomoMood = useCallback((mood: MomoExpression, opts?: { flap?: boolean; wave?: boolean }) => {
    setMomoMood(mood);
    if (opts?.flap) setFlapKey((k) => k + 1);
    if (opts?.wave) setWaveKey((k) => k + 1);
  }, []);

  const effectiveCameraStatus = cameraState?.status ?? state.cameraStatus;
  const isRequestLaunching = state.phase === "camera-on" && effectiveCameraStatus === "requesting";

  const timeline = useCoverTimeline({
    phase: state.phase, gateState: state.gateState, cameraStatus: effectiveCameraStatus,
    introLineIndex: state.introLineIndex, gateNudge: state.gateNudge,
    insideBubbleText, skipNameStep: state.skipNameStep, dispatch, onMomoMood, onBookBubble: setInsideBubbleText,
  });
  const { refs } = timeline;

  const cam = useCoverCamera({
    phase: state.phase, gateState: state.gateState, pipMode: timeline.pipMode,
    cameraStatus: effectiveCameraStatus,
    dispatch, cameraState, onCameraToggle, onCameraDeviceChange,
  });

  useEffect(() => {
    onPhaseChange?.(state.phase);
    if (state.phase === "sleep" || state.phase === "gate") completedRef.current = false;
    const readyHandoff = state.phase === "handoff" || (state.phase === "ruler" && !rulerSlot);
    if (readyHandoff && !completedRef.current) {
      completedRef.current = true;
      onComplete({
        studentName: state.studentName, needsRuler: state.needsRuler,
        ...(state.demoName ? { demoName: true } : {}),
      });
    }
  }, [state.phase, state.studentName, state.needsRuler, state.demoName, rulerSlot, onComplete, onPhaseChange]);

  const gateVisible = state.phase === "sleep" || state.phase === "gate" || state.phase === "camera-on";
  const momoSleeping = gateVisible && !isRequestLaunching;
  const avatarSleeping = state.phase === "sleep" && state.gateState === 0;
  const effectiveMood: MomoExpression = isRequestLaunching
    ? "Kaget"
    : gateVisible
      ? state.gateState === 0
        ? "Ngantuk"
        : state.gateState === 1
          ? "Ngelindur"
          : "SetengahBangun"
      : momoMood;
  const zzzOpacity = isRequestLaunching ? 0 : state.gateState === 0 ? 1 : state.gateState === 1 ? 0.55 : 0.2;
  const activeIntroLine =
    state.introLineIndex === 0
      ? formatCoverIntroLine0(state.studentName)
      : (COVER_INTRO_COPY.lines[state.introLineIndex] ?? COVER_INTRO_COPY.lines[0]);
  const dialogSegments = parseBubbleSegments(activeIntroLine);

  return (
    <ScreenFrame variant="cover" className="r83-cover-root" testId="r83-cover-screen" ariaLabel={COVER_HERO_COPY.stageAriaLabel}>
      <div ref={refs.root} id="stage" className="camera-prototype-root" data-phase={STAGE_PHASE_MAP[state.phase]} data-machine-phase={state.phase}>
        <CoverSpiralBinding viewportWidth={timeline.viewportWidth} />
        <CoverBrandLogo slotRef={refs.logoSlot} />
        <CoverDoodles containerRef={refs.doodles} bookRef={refs.doodleBook} pencilRef={refs.doodlePencil} />
        <div ref={refs.shadow} id="perch-shadow" aria-hidden="true" />
        <div ref={refs.shade} id="shade" aria-hidden="true" />
        <div ref={refs.spot} id="spot" aria-hidden="true" />
        <CoverHero heroRef={refs.hero} />

        <CoverCameraCard
          cardRef={refs.camera} gateState={state.gateState} cameraStatus={effectiveCameraStatus}
          cameraError={state.cameraError} pipMode={timeline.pipMode} morphing={timeline.morphing}
          nuiActive={isNuiActivePhase(state.phase) && state.phase !== "wake"} warming={nuiWarming} fallbackMode={state.fallbackMode} devTools={devTools} stream={cam.stream}
          devices={cam.devices} selectedDeviceId={cam.selectedDeviceId}
          onDeviceChange={cam.changeDevice} onToggleCamera={() => void cam.toggleCamera()} cameraSlot={cameraSlot}
        />

        <div ref={refs.momo} id="momo" className={momoSleeping ? "sleeping" : "awake"} data-testid="r83-cover-momo">
          <MomoAvatar
            expression={effectiveMood} height={timeline.momoHeight} trackMotion sleeping={avatarSleeping}
            flapKey={flapKey} waveKey={waveKey}
            label={momoSleeping ? COVER_HERO_COPY.momoSleepAriaLabel : COVER_HERO_COPY.momoAwakeAriaLabel}
          />
          <div id="sleep-zzz" aria-hidden="true" style={{ opacity: zzzOpacity, display: isRequestLaunching ? "none" : undefined }}><span className="snore">Z</span><span className="snore">z</span><span className="snore">z</span></div>
        </div>

        <div ref={refs.bubble} id="bubble" aria-live="polite" role="status" data-testid="r83-cover-bubble">
          <div className="speaker">{COVER_GATE_COPY.speakerName}</div>
          <div id="dialog">{dialogSegments.map((seg, i) => (seg.bold ? <strong key={i}>{seg.text}</strong> : seg.text))}</div>
        </div>

        <CameraConsentGate
          gateRef={refs.gate} gateState={state.gateState} gateNudge={state.gateNudge}
          cameraStatus={effectiveCameraStatus} cameraError={state.cameraError} visible={gateVisible && !isRequestLaunching}
          onToggleCheck={(checked) => dispatch({ type: "GATE_CHECK", checked })}
          onConfirmGo={() => dispatch({ type: "GATE_CONFIRM" })}
          onFallbackContinue={() => dispatch({ type: "CONTINUE_WITHOUT_CAMERA" })}
        />

        {isNuiActivePhase(state.phase) ? <HandLegend /> : null}

        <AyoRing hostRef={refs.confirm} visible={state.phase === "ayo"} onConfirm={() => dispatch({ type: "AYO_CONFIRMED" })} />

        <BookCurlTransition
          ref={refs.bookCurl}
          visible={
            (isBookVisiblePhase(state.phase) && (state.phase !== "book-curl" || timeline.bookRevealed)) ||
            (state.phase === "handoff" && timeline.bookRevealed)
          }
          viewportWidth={timeline.viewportWidth}
          rulerPageRef={refs.rulerPage} bookFrontCoverRef={bookFrontCoverRef} bookInsideBubbleRef={refs.bookInsideBubble}
          insideBubbleText={insideBubbleText} insideBubbleVisible={!state.skipNameStep && (state.phase === "name" || state.phase === "name-confirm")}
          blankInsidePage={state.skipNameStep}
        >
          {state.skipNameStep ? null
            : state.phase === "ruler" && rulerSlot ? rulerSlot
            : state.phase === "name-confirm" || state.phase === "name-exit" || state.phase === "ruler" ? (
              <NameConfirm
                studentName={state.studentName} exiting={state.phase !== "name-confirm"} cardRef={refs.nameCard}
                onRetry={() => { setInsideBubbleText(COVER_NAME_COPY.bubbleRetry); dispatch({ type: "NAME_RETRY" }); }}
                onConfirm={() => { setInsideBubbleText(formatNameGreeting(state.studentName)); dispatch({ type: "NAME_CONFIRMED" }); }}
              />
            ) : (
              <NameStep
                ready={state.phase === "name" && timeline.nameReady} devTools={devTools} cardRef={refs.nameCard}
                onSay={setInsideBubbleText}
                onCaptured={(name) => { setInsideBubbleText(formatNameConfirmPrompt(name)); dispatch({ type: "NAME_CAPTURED", name }); }}
              />
            )}
        </BookCurlTransition>

        {hideSkipBar || state.phase === "handoff" ? null : (
          <R83SkipBar visible={devTools} label={coverSkipLabel(state.phase)} onSkip={() => dispatch({ type: "SKIP_STEP" })} />
        )}

        {devTools && (state.phase === "name" || state.phase === "name-confirm") ? (
          <button id="replay" type="button" className="nb-btn" data-nui-off="true" data-testid="r83-cover-replay" onClick={() => dispatch({ type: "RESET" })}>
            {COVER_NAME_COPY.replayLabel}
          </button>
        ) : null}
      </div>
    </ScreenFrame>
  );
}

/** Layar Sampul, Kamera, Buka Buku 3D Curl, dan Alur Nama r8.3 (`/` dan `/onboarding/cam`). */
export function CoverScreen(props: CoverScreenProps) {
  const existingNui = useOptionalNui();
  if (existingNui) return <CoverScreenInner {...props} />;
  return <NuiProvider devTools={Boolean(props.devTools)}><CoverScreenInner {...props} /></NuiProvider>;
}

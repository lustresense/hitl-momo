"use client";

import { useMemo, type ReactNode } from "react";
import { OwnerIcon } from "@/src/components/ui/owner-icons";
import { resolveCharacterDisplayName } from "@/src/config/character-tokens";
import { TUTORIAL_COPY } from "@/src/domain/copy/tutorial";
import { MomoStage, R83Bubble, ScreenFrame } from "@/src/features/shared";
import { R83SkipBar } from "@/src/features/shared/R83SkipBar";
import { HandLegend, NuiProvider, useOptionalNui } from "@/src/nui/react";
import { CardCanvasTools } from "./CardCanvasTools";
import { CardSafeDanger } from "./CardSafeDanger";
import { CardWalk } from "./CardWalk";
import { TutorialThumbRing } from "./TutorialThumbRing";
import { TUTORIAL_CARD_INDICES, cardPhase, type CardIndex } from "./tutorial-machine";
import { useTutorialTimeline } from "./useTutorialTimeline";
import "./tutorial.css";

/** Sama persis dengan `TutorialBrochureProps` agar AppShell dapat menukar layar 1:1. */
export interface TutorialScreenProps {
  onStart(): void;
  onSkip?: () => void;
  characterDisplayName?: string | null;
  /** Nama siswa dari langkah nama sampul r8.3 untuk sapaan intro Momo. */
  readonly studentName?: string;
  /** True saat transisi datang langsung dari layar nama (`from=name` di sandbox). */
  readonly fromName?: boolean;
  /** Mulai langsung dari kartu ke-n (khusus parity capture & test). */
  readonly initialCard?: CardIndex;
  /** Aktifkan alat dev NUI (default false). */
  readonly devTools?: boolean;
  /** Slot opsional PIP kamera global bila dirender di atas layar. */
  readonly cameraSlot?: ReactNode;
}

function TutorialScreenInner({
  onStart,
  characterDisplayName,
  studentName,
  fromName = true,
  initialCard = 0,
  devTools = false,
  cameraSlot,
}: TutorialScreenProps) {
  const charName = resolveCharacterDisplayName(characterDisplayName);
  const initialPose = useMemo(() => {
    if (!fromName || initialCard > 0 || typeof window === "undefined") return undefined;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;
    const mobile = vw < 700;
    return {
      x: vw * (mobile ? 0.81 : 0.86),
      y: mobile ? Math.max(100, vh * 0.12) : Math.max(152, vh * 0.238),
      s: mobile ? 0.69 : 0.88,
      r: 0,
    };
  }, [fromName, initialCard]);
  const tl = useTutorialTimeline({
    characterName: charName,
    studentName,
    fromName,
    initialCard,
    onStart,
  });

  return (
    <ScreenFrame variant="page" testId="r83-tutorial-screen" ariaLabel={TUTORIAL_COPY.screenAriaLabel}>
      {cameraSlot ? <div className="r83-tutorial-pip">{cameraSlot}</div> : null}

      <div ref={tl.tutRef} className="tut" id="tut" data-stage={tl.flow.stage}>
        <div ref={tl.shadeRef} className="tut-shade" />

        <main className="tut-stage" aria-label={TUTORIAL_COPY.screenAriaLabel}>
          {TUTORIAL_CARD_INDICES.map((idx) => {
            const card = tl.cards[idx]!;
            const gate = tl.flow.gates[idx];
            const phase = cardPhase(gate);
            const isOpened = tl.openedCard === idx;
            const unlocked = phase === "ackEligible";
            const reading = isOpened && phase === "reading";
            const hintLine = unlocked ? card.unlockedHint : card.gestureLabel;

            return (
              <article
                key={card.id}
                ref={(el) => {
                  tl.cardRefs.current[idx] = el;
                }}
                className={`tut-card${tl.flow.completedCards[idx] ? " is-done" : ""}`}
                data-i={idx}
                data-testid={`r83-tut-card-${idx}`}
                aria-label={TUTORIAL_COPY.cardAriaLabel(idx + 1)}
              >
                <div
                  ref={(el) => {
                    tl.flipRefs.current[idx] = el;
                  }}
                  className="tut-flip"
                >
                  <section className="tut-face tut-front">
                    <span className="tut-front__stitch" />
                    <span className="tut-front__number">{idx + 1}</span>
                    <span
                      ref={(el) => {
                        tl.doneRefs.current[idx] = el;
                      }}
                      className="tut-front__done"
                      aria-hidden="true"
                    >
                      <svg
                        viewBox="0 0 48 48"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={5.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m11 25 8.5 8.5L37 15" />
                      </svg>
                    </span>
                  </section>

                  <section className="tut-face tut-back">
                    <div className="tut-steps">
                      {TUTORIAL_CARD_INDICES.map((stepIdx) => (
                        <i
                          key={stepIdx}
                          className={
                            stepIdx === idx ? "is-now" : stepIdx < idx ? "is-done" : undefined
                          }
                        />
                      ))}
                    </div>
                    <h2 className="guide-title">{card.title}</h2>
                    <p className="guide-copy">{card.copy}</p>
                    <p className="tut-gesture">
                      <span className="gi" aria-hidden="true">
                        {unlocked ? (
                          <OwnerIcon name="gesture-pinch" size={22} />
                        ) : card.gestureIcon === "bulb" ? (
                          <OwnerIcon name="bulb" size={22} />
                        ) : (
                          <OwnerIcon name="gesture-pinch" size={22} />
                        )}
                      </span>
                      <span className="gt">{hintLine}</span>
                    </p>
                    <div className="brochure-cta brochure-cta--thumb">
                      <TutorialThumbRing
                        reading={reading}
                        unlocked={unlocked}
                        ctaLabel={card.cta}
                        onReadComplete={() => tl.markReadDone(idx)}
                        onConfirm={() => tl.confirmCard(idx)}
                      />
                    </div>
                  </section>
                </div>

                <section
                  ref={(el) => {
                    tl.playRefs.current[idx] = el;
                  }}
                  className="tut-play"
                  aria-label={card.label}
                >
                  {isOpened && idx === 0 ? (
                    <CardWalk active={isOpened} onComplete={() => tl.markPracticeDone(0)} />
                  ) : null}
                  {isOpened && idx === 1 ? <CardSafeDanger active={isOpened} /> : null}
                  {isOpened && idx === 2 ? (
                    <CardCanvasTools
                      active={isOpened}
                      resizeKey={tl.resizeKey}
                      onComplete={() => tl.markPracticeDone(2)}
                    />
                  ) : null}
                </section>
              </article>
            );
          })}
        </main>
      </div>

      {tl.hintText ? (
        <div ref={tl.hintRef} className="r83-hint top is-visible" role="note" data-testid="r83-tut-hint">
          {tl.hintText}
        </div>
      ) : null}

      <MomoStage
        ref={tl.momoRef}
        at={initialCard > 0 ? "strip" : "mid"}
        from={initialPose}
        expression={tl.momoExpr}
      />
      <R83Bubble
        momoRef={tl.momoRef}
        anchor={tl.momoAnchor}
        text={tl.bubbleText}
        visible={tl.bubbleVisible}
        ariaLive="polite"
      />
      <HandLegend />
      <R83SkipBar visible={devTools} label={tl.skipLabel} onSkip={tl.skip} />
    </ScreenFrame>
  );
}

/**
 * Layar Tutorial 3 Kartu r8.3 (`/` -> `/onboarding/card`).
 * Drop-in menerima `TutorialBrochureProps`, dapat di-mount di dalam `AppShell` (NuiProvider root) atau mandiri.
 */
export function TutorialScreen(props: TutorialScreenProps) {
  const hasParentNui = useOptionalNui() !== null;
  const inner = <TutorialScreenInner {...props} />;
  return hasParentNui ? inner : <NuiProvider devTools={Boolean(props.devTools)}>{inner}</NuiProvider>;
}

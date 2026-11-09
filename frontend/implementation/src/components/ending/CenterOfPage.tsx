"use client";
/**
 * R9 Penutup: Pusat Halaman. After Level 3 the book opens its last page. Thinman's thin line fills with ink and he
 * walks by himself to Momo; she startles, then is glad and flaps (they become friends). Then the overview of the
 * student's three objects, Momo's short epilog, and a 2 s thumb for Main lagi or Selesai.
 * DOM + CSS animation (no KAPLAY). Display only: nothing here changes a decision or a number.
 */
import { useEffect, useState } from "react";
import { MomoChat } from "../momo/MomoChat";
import { ThinmanArt } from "../ui/ThinmanArt";
import { ThumbConfirm } from "../ui/ThumbConfirm";
import { DECISION_TEXT, ENDING_TIMING, EPILOG_LINES, strokesToPath, type EndingChoice, type EndingStage, type LevelRecap } from "./ending-types";

export interface CenterOfPageProps {
  recaps: LevelRecap[];
  onChoose: (choice: EndingChoice) => void;
  /** Start at a later stage (tests, video capture). */
  initialStage?: EndingStage;
}

export function CenterOfPage({ recaps, onChoose, initialStage = "page" }: CenterOfPageProps) {
  const [stage, setStage] = useState<EndingStage>(initialStage);
  const [epilogDone, setEpilogDone] = useState(false);
  const [choice, setChoice] = useState<EndingChoice>("finish");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (stage === "page") {
      const t = setTimeout(() => setStage("alive"), ENDING_TIMING.page);
      return () => clearTimeout(t);
    }
    if (stage === "alive") {
      const touch = setTimeout(() => setTouched(true), ENDING_TIMING.alive * 0.7);
      const t = setTimeout(() => setStage("overview"), ENDING_TIMING.alive);
      return () => { clearTimeout(t); clearTimeout(touch); };
    }
    return undefined;
  }, [stage]);

  const momoMood = stage === "alive" ? (touched ? "Senang" : "Penasaran") : stage === "epilog" ? "Tenang" : "Senang";

  return (
    <section className={`center-page center-page--${stage}`} data-testid="center-of-page" data-stage={stage} aria-label="Pusat Halaman">
      <div className="center-page__ink" aria-hidden="true">
        <span /><span /><span />
      </div>
      <h2 className="center-page__title">Pusat Halaman</h2>

      {(stage === "page" || stage === "alive") && (
        <div className="center-page__meet">
          <div className={`center-page__thinman${stage === "alive" ? " is-alive" : ""}${touched ? " is-touching" : ""}`} data-testid="ending-thinman">
            <ThinmanArt pose={stage === "alive" && !touched ? "walkA" : "stand"} />
          </div>
          <div className="center-page__momo">
            <MomoChat
              lines={stage === "alive" && touched ? "Eh! Kamu... hidup?" : "..."}
              mood={momoMood}
              avatarHeight={150}
              flapKey={touched ? 1 : 0}
              typing={false}
            />
          </div>
        </div>
      )}

      {stage === "overview" && (
        <div className="center-page__overview" data-testid="ending-overview">
          <ol className="center-page__objects">
            {recaps.map((r) => (
              <li key={r.levelId} className={`center-page__obj center-page__obj--${r.category}`} data-level={r.levelId}>
                <span className="center-page__chapter">{r.title}</span>
                <svg className="center-page__drawing" viewBox="0 0 120 80" role="img" aria-label={`Gambarmu: ${r.finalLabel}`}>
                  <path d={strokesToPath(r.strokes, 120, 80)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="center-page__label">{r.finalLabel}</span>
                <span className="center-page__meta">{r.category}</span>
                <span className="center-page__meta" data-decision={r.decision}>Keputusanmu: {DECISION_TEXT[r.decision]}</span>
                <span className="center-page__meta">Tebakan pertama Momo: {r.firstGuess}</span>
              </li>
            ))}
          </ol>
          <div className="center-page__walker" aria-hidden="true"><ThinmanArt pose="walkB" /></div>
          <ThumbConfirm holdMs={1000} testId="ending-next" label="Lanjut" onConfirm={() => setStage("epilog")} />
        </div>
      )}

      {stage === "epilog" && (
        <div className="center-page__epilog" data-testid="ending-epilog">
          <MomoChat lines={[...EPILOG_LINES]} mood="Tenang" avatarHeight={150} onDone={() => setEpilogDone(true)}>
            {epilogDone ? <ThumbConfirm holdMs={1000} testId="ending-epilog-next" label="Lanjut" onConfirm={() => setStage("choice")} /> : null}
          </MomoChat>
        </div>
      )}

      {stage === "choice" && (
        <div className="center-page__choice" data-testid="ending-choice">
          <div className="center-page__options" role="radiogroup" aria-label="Pilih">
            {(["again", "finish"] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={choice === c}
                className={`nb-btn${choice === c ? " nb-btn--primary is-selected" : ""}`}
                data-testid={c === "again" ? "ending-play-again" : "ending-finish"}
                onClick={() => setChoice(c)}
              >
                {c === "again" ? "Main lagi" : "Selesai"}
              </button>
            ))}
          </div>
          <ThumbConfirm
            key={choice}
            holdMs={2000}
            testId="ending-confirm"
            label={choice === "again" ? "Tahan jempol untuk main lagi" : "Tahan jempol untuk selesai"}
            onConfirm={() => onChoose(choice)}
          />
        </div>
      )}
    </section>
  );
}

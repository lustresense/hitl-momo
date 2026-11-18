"use client";
/**
 * Penutup (Pusat Halaman). After the last level, Thinman walks into a portal and comes out alive. Momo reacts, gives
 * a short overview of AI, and shows a neutral recap of what was recorded. Then, only when the quiz flag is ON, a
 * quiz placeholder. The last control is Kembali ke sampul. Display only: nothing here changes a decision or a number.
 * Every stage waits for Momo's lines to finish; a thumb appears only after the last line. No stage moves on by itself,
 * except the timed portal. All timers are cleared on unmount.
 */
import { useEffect, useState } from "react";
import { MomoChat } from "../momo/MomoChat";
import { DwellButton } from "../ui/DwellButton";
import { ThinmanArt } from "../ui/ThinmanArt";
import { ThumbConfirm } from "../ui/ThumbConfirm";
import { isQuizEnabled } from "@/src/config/quiz-flag";
import { AI_TALK_LINES, FINISH_LINES, PORTAL_REACTION, QUIZ_LEAD_LINES, QUIZ_PLACEHOLDER, RECAP_LINES } from "@/src/domain/ending-script";
import "./ending-flow.css";
import "./ending-nui.css";
import { DECISION_TEXT, ENDING_TIMING, strokesToPath, type EndingChoice, type EndingStage, type LevelRecap } from "./ending-types";
import { behaviorText, countText, guessText, NOT_RECORDED, recapTotals, redrawText } from "./recap-summary";

export interface CenterOfPageProps {
  recaps: LevelRecap[];
  /** "finish" = Kembali ke sampul. "again" is kept for older callers; this screen no longer offers it. */
  onChoose: (choice: EndingChoice) => void;
  /** Start at a later stage (tests, video capture). */
  initialStage?: EndingStage;
  /** Quiz toggle from the server, when it gives one. Otherwise the env flag decides (see config/quiz-flag.ts). */
  quizEnabled?: boolean;
}

/** Portal phases, in order. The timings live in ENDING_TIMING; the CSS keys off the same phase names. */
type PortalPhase = "enter" | "inside" | "alive";

// Module-level arrays: MomoChat keys its run on the text, but a stable reference avoids work on every render.
const TALK_LINES = [...AI_TALK_LINES];
const RECAP_TEXT = [...RECAP_LINES];
const QUIZ_TEXT = [...QUIZ_LEAD_LINES];
const FINISH_TEXT = [...FINISH_LINES];
const SILENT: string[] = [];
const REACTION = [PORTAL_REACTION];

/** True when the student asked the system for less motion. Starts false so server and first client render match. */
function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  return reduce;
}

export function CenterOfPage({ recaps, onChoose, initialStage = "portal", quizEnabled }: CenterOfPageProps) {
  const [stage, setStage] = useState<EndingStage>(initialStage);
  const [phase, setPhase] = useState<PortalPhase>("enter");
  const reduce = usePrefersReducedMotion();
  const quizOn = isQuizEnabled(quizEnabled);

  // The portal runs by itself for its full length, also on reduced motion. Only its repeated glints are softened.
  useEffect(() => {
    if (stage !== "portal") return undefined;
    const timers = [
      setTimeout(() => setPhase("inside"), ENDING_TIMING.inside),
      setTimeout(() => setPhase("alive"), ENDING_TIMING.out),
      setTimeout(() => setStage("talk"), ENDING_TIMING.portal),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, [stage]);

  return (
    <section
      className={`center-page center-page--${stage} ending-page${reduce ? " is-reduce" : ""}`}
      data-testid="center-of-page"
      data-stage={stage}
      aria-label="Pusat Halaman"
    >
      <h2 className="visually-hidden">Pusat Halaman</h2>

      {stage === "portal" && (
        <div className={`ending-portal ending-portal--${phase}`} data-testid="ending-portal" data-phase={phase}>
          <div className="ending-portal__gate" aria-hidden="true">
            <span className="ending-portal__glint" />
            <span className="ending-portal__glint" />
            <span className="ending-portal__glint" />
          </div>
          <div className="ending-portal__thinman" data-testid="ending-thinman" aria-hidden="true">
            <ThinmanArt pose={phase === "enter" ? "walkA" : "stand"} />
          </div>
          <div className="ending-portal__momo">
            <MomoChat
              lines={phase === "alive" ? REACTION : SILENT}
              mood={phase === "alive" ? "Senang" : "Penasaran"}
              avatarHeight={160}
            />
          </div>
        </div>
      )}

      {stage === "talk" && (
        <div className="ending-talk" data-testid="ending-talk">
          <MomoChat lines={TALK_LINES} mood="Tenang" avatarHeight={190}>
            <ThumbConfirm holdMs={1000} label="Aku mengerti" testId="ending-understood" onConfirm={() => setStage("recap")} />
          </MomoChat>
        </div>
      )}

      {stage === "recap" && <Recap recaps={recaps} onNext={() => setStage(quizOn ? "quiz" : "finish")} />}

      {stage === "quiz" && (
        <div className="ending-quiz" data-testid="quiz-entry">
          <MomoChat lines={QUIZ_TEXT} mood="Tenang" avatarHeight={150}>
            <ThumbConfirm holdMs={1000} label="Lanjut" testId="ending-quiz-next" onConfirm={() => setStage("finish")} />
          </MomoChat>
          <p className="ending-quiz__placeholder">{QUIZ_PLACEHOLDER}</p>
        </div>
      )}

      {stage === "finish" && (
        <div className="ending-finish" data-testid="ending-finish">
          <MomoChat lines={FINISH_TEXT} mood="Senang" avatarHeight={170}>
            {/* Shown only after Momo's last line. One control; a resting fingertip or a click fires it once. */}
            <div className="center-page__options" role="group" aria-label="Akhir">
              <DwellButton className="ending-option" testId="ending-back-to-cover" onActivate={() => onChoose("finish")}>
                Kembali ke sampul
              </DwellButton>
            </div>
          </MomoChat>
        </div>
      )}
    </section>
  );
}

/** Momo's recap line, the neutral counts, then one card per recorded level. Every value is recorded data or "tidak tercatat". */
function Recap({ recaps, onNext }: { recaps: LevelRecap[]; onNext: () => void }) {
  const totals = recapTotals(recaps);
    return (
    <section className="ending-recap" data-testid="ending-recap" aria-label="Rekap">
      <MomoChat lines={RECAP_TEXT} mood="Tenang" avatarHeight={120}>
        <ThumbConfirm holdMs={1000} label="Lanjut" testId="ending-recap-next" onConfirm={onNext} />
      </MomoChat>

      <ul className="ending-recap__counts" aria-label="Jumlah">
        <li data-testid="recap-count-objects">{countText("Benda yang digambar", totals?.objects ?? null)}</li>
        <li data-testid="recap-count-accept">{countText("Terima", totals ? totals.accept : null)}</li>
        <li data-testid="recap-count-correct">{countText("Pilih lain", totals ? totals.correct : null)}</li>
        <li data-testid="recap-count-override">{countText("Bukan semua", totals ? totals.override : null)}</li>
        <li data-testid="recap-count-redraw">{redrawText(totals ? totals.redraws : null)}</li>
        <li data-testid="recap-count-guess-changed">{countText("Tebakan pertama yang diubah", totals ? totals.guessChanged : null)}</li>
      </ul>

      {totals === null ? (
        <p className="ending-recap__empty" data-testid="recap-empty">{NOT_RECORDED}</p>
      ) : (
        <ol className="ending-recap__cards">
          {recaps.map((r) => (
            <RecapCard key={r.levelId} recap={r} />
          ))}
        </ol>
      )}
    </section>
  );
}

function RecapCard({ recap: r }: { recap: LevelRecap }) {
  const path = r.strokes.length > 0 ? strokesToPath(r.strokes, 120, 80) : "";
  return (
    <li className={`ending-recap__card ending-recap__card--${r.category}`} data-testid={`recap-card-${r.levelId}`}>
      <span className="ending-recap__chapter">{r.title}</span>
      {path !== "" ? (
        <svg className="ending-recap__drawing" viewBox="0 0 120 80" role="img" aria-label={`Gambarmu: ${r.finalLabel}`}>
          <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span className="ending-recap__none">{NOT_RECORDED}</span>
      )}
      <span className="ending-recap__line">{`Label akhir: ${r.finalLabel}`}</span>
      <span className="ending-recap__line">{`Tebakan pertama Momo: ${guessText(r)}`}</span>
      <span className="ending-recap__line">{`Keputusanmu: ${DECISION_TEXT[r.decision]}`}</span>
      <span className="ending-recap__line">{`Perilaku: ${behaviorText(r.category)}`}</span>
    </li>
  );
}


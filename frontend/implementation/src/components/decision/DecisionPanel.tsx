"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LevelContext, PredictionResult } from "@/src/domain/types";
import { actionFor, MODE_TOP3_ALTERNATIVES, MODE_TOP3_PANEL } from "@/src/input/gesture-mode";
import type { HandPose } from "@/src/input/hand-gesture";
import { useHandGesture, useInputMode } from "../../hooks/useHandGesture";
import { Top3Panel } from "../prediction/Top3Panel";
import { FingerGlyph, GestureRing } from "../ui/GestureRing";
import { Icon } from "../ui/Icon";
import "./DecisionPanel.css";

export interface DecisionPanelProps {
  prediction: PredictionResult;
  level: LevelContext;
  onAccept(): void;
  onCorrect(rank: 2 | 3): void;
  onOverride(label: string): void;
  onRedraw(): void;
}

/** "Bukan ini", a label choice and "Gambar lagi": a deliberate hold, not a glance. */
export const OVERRIDE_HOLD_MS = 1500;
/** Committing a label is a real decision, so it takes twice as long (the same as a ThumbConfirm of 2 s). */
export const COMMIT_HOLD_MS = 2000;
/**
 * Labels offered by "Bukan ini", one per finger: 1 to 4. Five fingers is "Bukan ini" itself, and every level's
 * vocabulary has at most four labels, so no paging is needed.
 */
export const MAX_OVERRIDE_CHOICES = 4;

/** Poses that never pick a label: a thumb, a pinch, a fist and an unread hand. */
const NOT_A_COUNT: ReadonlySet<HandPose> = new Set<HandPose>(["thumb-up", "pinch", "fist", "none"]);

/**
 * The label (1..4) the hand shows in the open list, or null. One to three fingers come from the pose through the
 * router: the raw count includes the thumb, so a count of 1 can be a thumbs-up. Four has no pose of its own, so it
 * is read from the count, and only for a pose that no other action claims.
 */
export function listChoiceFor(pose: HandPose, fingerCount: number): 1 | 2 | 3 | 4 | null {
  const picked = actionFor(MODE_TOP3_ALTERNATIVES, pose);
  if (picked === "choose-1") return 1;
  if (picked === "choose-2") return 2;
  if (picked === "choose-3") return 3;
  if (NOT_A_COUNT.has(pose)) return null;
  return fingerCount === 4 ? 4 : null;
}

/**
 * The three HITL decisions, chosen with the hand: 1, 2 or 3 fingers for the candidates, no cursor.
 * - One finger (Terima) accepts. Two and three fingers (Pakai) correct to that rank.
 * - Open palm ("Bukan ini, pilih lainnya") opens the other vocabulary labels; while it is open the candidates are locked,
 *   because one finger means a label in that list. A label is chosen by its finger count; the thumb (Pakai) commits it.
 * - Pinch ("Gambar lagi") is the recovery route, outside the three decisions.
 * A mouse, touch or keyboard holds the same rings. The first committed decision locks the others until the next prediction.
 */
export function DecisionPanel({ prediction, level, onAccept, onCorrect, onOverride, onRedraw }: DecisionPanelProps) {
  const camera = useInputMode() === "camera";
  const gesture = useHandGesture(camera);
  const pose = gesture.pose;

  const committed = useRef(false);
  const [locked, setLocked] = useState(false);
  const [picker, setPicker] = useState<"none" | "override">("none");
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  const pickerOpen = picker === "override";

  useEffect(() => {
    committed.current = false;
    setLocked(false);
    setPicker("none");
    setPickedLabel(null);
  }, [prediction]);

  const overrideOptions = useMemo(() => {
    const top3 = new Set(prediction.candidates.map((c) => c.label));
    return level.vocabulary.filter((v) => !top3.has(v)).slice(0, MAX_OVERRIDE_CHOICES);
  }, [level.vocabulary, prediction]);

  const commit = (run: () => void) => {
    if (committed.current) return;
    committed.current = true;
    setLocked(true);
    run();
  };

  const pickCandidate = (rank: 1 | 2 | 3) => {
    if (rank === 1) commit(onAccept);
    else commit(() => onCorrect(rank));
  };

  const pickOverride = () => {
    if (pickedLabel === null) return;
    const label = pickedLabel;
    commit(() => onOverride(label));
  };

  /** The label the hand shows now; only while the list is open and nothing is committed. */
  const shownChoice = camera && !locked && pickerOpen ? listChoiceFor(pose, gesture.fingerCount) : null;
  // A hand of four fingers reads as open-palm too, so the open-palm ring stays off while the list is open.
  const openPalmNow = camera && actionFor(MODE_TOP3_PANEL, pose) === "not-this";
  const pinchNow = camera && actionFor(MODE_TOP3_PANEL, pose) === "redraw";

  return (
    <aside className="nui-decision">
      <Top3Panel result={prediction} onPick={pickCandidate} disabled={locked || pickerOpen} />

      <GestureRing
        testId="btn-override"
        className="nui-decision__open"
        label="Bukan ini, pilih lainnya"
        active={openPalmNow && !pickerOpen}
        holdMs={OVERRIDE_HOLD_MS}
        locked={locked}
        expanded={pickerOpen}
        icon={<FingerGlyph count={5} size={28} />}
        onConfirm={() => setPicker((p) => (p === "override" ? "none" : "override"))}
      />

      {pickerOpen && (
        <div className="nui-choices" role="group" aria-label="Benda lain di level ini" data-testid="override-picker">
          {overrideOptions.length > 0 ? (
            <div className="nui-choices__grid">
              {overrideOptions.map((v, i) => (
                <GestureRing
                  key={v}
                  testId={`override-option-${v}`}
                  className="nui-choice"
                  label={`Pilih ${v}, ${i + 1} jari`}
                  active={shownChoice === i + 1}
                  holdMs={OVERRIDE_HOLD_MS}
                  locked={locked}
                  pressed={pickedLabel === v}
                  icon={<FingerGlyph count={(i + 1) as 1 | 2 | 3 | 4} size={24} />}
                  onConfirm={() => setPickedLabel(v)}
                >
                  <span className="nui-choice__text">{v}</span>
                </GestureRing>
              ))}
            </div>
          ) : (
            <p className="nui-choices__empty">Tidak ada benda lain di level ini.</p>
          )}
          {pickedLabel !== null && (
            <GestureRing
              testId="override-confirm"
              className="nui-decision__confirm"
              label={`Pakai ${pickedLabel}`}
              active={camera && pose === "thumb-up"}
              holdMs={COMMIT_HOLD_MS}
              locked={locked}
              icon={<Icon name="thumb-up" size={26} />}
              onConfirm={pickOverride}
            />
          )}
        </div>
      )}

      {/* Gambar lagi = recovery route, deliberately outside the three decisions and set apart from them. */}
      <GestureRing
        testId="btn-redraw"
        className="nui-decision__redraw"
        label="Gambar lagi"
        active={pinchNow}
        holdMs={OVERRIDE_HOLD_MS}
        icon={<Icon name="pencil" size={20} />}
        onConfirm={onRedraw}
      />
    </aside>
  );
}

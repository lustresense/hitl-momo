"use client";
/**
 * The two ways out of a prediction error, picked with the hand: one finger = try the prediction again,
 * a pinch = draw again (the same recovery as "Gambar lagi" on the decision screen). Mouse and keyboard hold the rings.
 */
import { useHandGesture, useInputMode } from "../../hooks/useHandGesture";
import { FingerGlyph, GestureRing } from "../ui/GestureRing";
import { Icon } from "../ui/Icon";

export const ERROR_HOLD_MS = 1500;

export interface PredictionErrorActionsProps {
  onRetry: () => void;
  onRedraw: () => void;
  className?: string;
}

export function PredictionErrorActions({ onRetry, onRedraw, className }: PredictionErrorActionsProps) {
  const camera = useInputMode() === "camera";
  const gesture = useHandGesture(camera);
  const pose = gesture.pose;

  return (
    <div className={["momo-guess__row", className ?? ""].filter(Boolean).join(" ")}>
      <GestureRing
        testId="btn-retry-prediction"
        className="gesture-ring--primary momo-guess__action"
        label="Coba lagi"
        active={camera && pose === "one-finger"}
        holdMs={ERROR_HOLD_MS}
        icon={<FingerGlyph count={1} size={26} />}
        onConfirm={onRetry}
      />
      <GestureRing
        testId="btn-redraw-error"
        className="momo-guess__action"
        label="Revisi gambar"
        active={camera && pose === "pinch"}
        holdMs={ERROR_HOLD_MS}
        icon={<Icon name="pencil" size={20} />}
        onConfirm={onRedraw}
      />
    </div>
  );
}

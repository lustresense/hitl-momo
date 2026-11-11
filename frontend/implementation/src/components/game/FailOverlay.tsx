/**
 * The student failed the level: Momo says it kindly in chat and offers three actions, each picked with a finger count:
 * one finger = retry from the checkpoint, two = move the same object, three = draw again. Each action is a ring
 * that fills while the pose is held (1.5 s). A mouse, touch or keyboard holds the same ring in fallback.
 */
import { useHandGesture, useInputMode } from "../../hooks/useHandGesture";
import { actionFor, MODE_FAIL } from "@/src/input/gesture-mode";
import { MomoChat } from "../momo/MomoChat";
import { FingerGlyph, GestureRing } from "../ui/GestureRing";
import "./FailOverlay.css";

export interface FailOverlayProps {
  failReason: string;
  onRetry: () => void;
  onReposition: () => void;
  onRedraw: () => void;
}

/** Holding a finger count this long fills the ring. */
export const FAIL_HOLD_MS = 1500;

export function FailOverlay({ failReason, onRetry, onReposition, onRedraw }: FailOverlayProps) {
  const camera = useInputMode() === "camera";
  const gesture = useHandGesture(camera);
  // The router reads the pose (not the raw finger count, which counts the thumb too).
  const action = camera ? actionFor(MODE_FAIL, gesture.pose) : null;

  return (
    <div className="world-fail" data-testid="outcome-overlay">
      <MomoChat
        lines={["Belum berhasil, tidak apa-apa.", ...(failReason ? [failReason] : [])]}
        mood="Sedih"
        avatarHeight={190}
        extrasFrom="first"
        testId="fail-chat"
      >
        <div className="world-fail__actions nui-fail-actions">
          <GestureRing
            className="gesture-ring--primary nui-fail-action"
            testId="btn-retry-cycle"
            label="Coba lagi"
            active={action === "retry"}
            holdMs={FAIL_HOLD_MS}
            icon={<FingerGlyph count={1} size={26} />}
            onConfirm={onRetry}
          />
          <GestureRing
            className="nui-fail-action"
            testId="btn-reposition"
            label="Geser objek"
            active={action === "move-object"}
            holdMs={FAIL_HOLD_MS}
            icon={<FingerGlyph count={2} size={26} />}
            onConfirm={onReposition}
          />
          <GestureRing
            className="nui-fail-action"
            testId="btn-redraw-gameplay"
            label="Gambar lagi"
            active={action === "redraw"}
            holdMs={FAIL_HOLD_MS}
            icon={<FingerGlyph count={3} size={26} />}
            onConfirm={onRedraw}
          />
        </div>
      </MomoChat>
      <h3 className="overlay-title visually-hidden" data-testid="outcome-title">
        Belum berhasil
      </h3>
      {failReason && (
        <p data-testid="fail-reason" className="visually-hidden">
          {failReason}
        </p>
      )}
    </div>
  );
}

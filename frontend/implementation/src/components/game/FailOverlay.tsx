/**
 * The student failed the level: Momo says it kindly in chat and offers three icon actions
 * (retry from checkpoint, move the same object, draw again). Each action is a NUI button: a resting
 * fingertip picks it in camera mode, a click picks it in fallback.
 */
import { MomoChat } from "../momo/MomoChat";
import { DwellButton } from "../ui/DwellButton";
import { Icon } from "../ui/Icon";
import "../ui/nui-actions.css";

export interface FailOverlayProps {
  failReason: string;
  onRetry: () => void;
  onReposition: () => void;
  onRedraw: () => void;
}

export function FailOverlay({ failReason, onRetry, onReposition, onRedraw }: FailOverlayProps) {
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
          <DwellButton
            className="dwell-btn--primary nui-primary nui-fail-action"
            testId="btn-retry-cycle"
            icon={<Icon name="again" size={20} />}
            onActivate={onRetry}
          >
            Coba lagi
          </DwellButton>
          <DwellButton
            className="nui-fail-action"
            testId="btn-reposition"
            icon={<Icon name="swap" size={20} />}
            onActivate={onReposition}
          >
            Geser objek
          </DwellButton>
          <DwellButton
            className="nui-fail-action"
            testId="btn-redraw-gameplay"
            icon={<Icon name="pencil" size={20} />}
            onActivate={onRedraw}
          >
            Gambar ulang
          </DwellButton>
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

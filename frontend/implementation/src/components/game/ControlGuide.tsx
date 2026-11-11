/**
 * "Cara menjalankan Thinman": three cards (Kiri, Kanan, Lompat). Camera mode shows the real hand
 * gesture, fallback mode the real key or on-screen button. The sentences must match what the code
 * reads (gameplay-gesture.ts): the index finger points level left or right to walk, straight up to
 * jump, up and to the side to jump and walk, down to stop; keyboard/buttons = arrows, A/D, Space/W,
 * and the buttons.
 */
import { Icon, type IconName } from "../ui/Icon";
import type { DirectionKey, InputMode } from "./game-stage-types";
import "./gameplay-guide.css";

const CARDS: ReadonlyArray<{ dir: DirectionKey; label: string; fallbackIcon: IconName }> = [
  { dir: "left", label: "Kiri", fallbackIcon: "arrow-left" },
  { dir: "right", label: "Kanan", fallbackIcon: "arrow-right" },
  { dir: "jump", label: "Lompat", fallbackIcon: "arrow-up" },
];

const COPY: Record<InputMode, { title: string; sentence: Record<DirectionKey, string>; note: string }> = {
  camera: {
    title: "Pakai tanganmu",
    sentence: {
      left: "Telunjuk mendatar ke kiri, Thinman jalan ke kiri.",
      right: "Telunjuk mendatar ke kanan, Thinman jalan ke kanan.",
      jump: "Telunjuk tegak ke atas untuk lompat. Miring ke kiri atau kanan untuk lompat sambil jalan.",
    },
    note: "Telunjuk turun ke bawah, Thinman berhenti.",
  },
  fallback: {
    title: "Pakai keyboard atau tombol",
    sentence: {
      left: "Tekan panah kiri atau A, atau tombol Kiri di layar.",
      right: "Tekan panah kanan atau D, atau tombol Kanan di layar.",
      jump: "Tekan Spasi, panah atas, atau W, atau tombol Lompat di layar.",
    },
    note: "Lepas tombol, Thinman berhenti.",
  },
};

export interface ControlGuideProps {
  mode: InputMode;
  onClose: () => void;
}

export function ControlGuide({ mode, onClose }: ControlGuideProps) {
  const copy = COPY[mode];
  return (
    <section
      className="control-guide"
      data-testid="control-guide"
      data-mode={mode}
      aria-labelledby="control-guide-title"
    >
      <div className="control-guide__head">
        <h3 id="control-guide-title" className="control-guide__title">
          {copy.title}
        </h3>
        <button
          type="button"
          className="control-guide__close"
          data-testid="control-guide-close"
          aria-label="Tutup panduan"
          onClick={onClose}
        >
          <Icon name="close" size={18} stroke={3} />
        </button>
      </div>
      <ul className="control-guide__cards">
        {CARDS.map((card) => (
          <li key={card.dir} className="control-guide__card" data-testid={`guide-card-${card.dir}`}>
            <span className="control-guide__art">
              {mode === "camera" ? (
                <PointingHand flip={card.dir === "right"} up={card.dir === "jump"} />
              ) : (
                <Icon name={card.fallbackIcon} size={30} stroke={3} />
              )}
            </span>
            <span className="control-guide__label">{card.label}</span>
            <span className="control-guide__sentence">{copy.sentence[card.dir]}</span>
          </li>
        ))}
      </ul>
      <p className="control-guide__note">{copy.note}</p>
    </section>
  );
}

/**
 * Simple pointing hand for Kiri (flip = Kanan, up = Lompat): index finger out, palm behind it,
 * arrow above. Outline layer and fill layer share one silhouette, so the joins show no inner lines.
 */
function PointingHand({ flip, up = false }: { flip: boolean; up?: boolean }) {
  const transform = up ? "rotate(90 36 36)" : flip ? "translate(72 0) scale(-1 1)" : undefined;
  const silhouette = (
    <>
      <rect x="6" y="27" width="36" height="12" rx="6" />
      <rect x="34" y="28" width="26" height="31" rx="11" />
    </>
  );
  return (
    <svg className="control-guide__hand" viewBox="0 0 72 72" width={56} height={56} aria-hidden="true" focusable="false">
      <g transform={transform}>
        <g fill="currentColor" stroke="currentColor" strokeWidth={5} strokeLinejoin="round">
          {silhouette}
        </g>
        <g fill="#fffdf8">{silhouette}</g>
        <path
          d="M30 13H9M16 6L9 13L16 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** Help ("bantuan") glyph for the button that reopens the guide. Not in the shared Icon set. */
export function GuideHelpIcon() {
  return (
    <svg
      className="nb-icon"
      viewBox="0 0 24 24"
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5" />
      <path d="M12 17h.01" />
    </svg>
  );
}

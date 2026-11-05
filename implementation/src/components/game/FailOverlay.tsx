/**
 * Overlay shown when the student fails the level: retry, reposition or redraw.
 */
const overlayStyle = {
  position: "absolute",
  top: "45%",
  left: "50%",
  transform: "translate(-50%,-50%)",
  zIndex: 300,
} as const;

const reasonStyle = {
  margin: "4px 0 14px",
  fontSize: 13,
  color: "#666",
  fontWeight: 600,
  textAlign: "center",
} as const;

export interface FailOverlayProps {
  failReason: string;
  onRetry: () => void;
  onReposition: () => void;
  onRedraw: () => void;
}

export function FailOverlay({ failReason, onRetry, onReposition, onRedraw }: FailOverlayProps) {
  return (
    <div className="overlay" data-testid="outcome-overlay" style={overlayStyle}>
      <h3 className="overlay-title" data-testid="outcome-title">
        Gagal. Ulangi dari checkpoint
      </h3>
      {failReason && (
        <p data-testid="fail-reason" style={reasonStyle}>
          {failReason}
        </p>
      )}
      <div className="overlay-actions">
        <button className="btn" data-testid="btn-retry-cycle" onClick={onRetry}>
          Coba dari checkpoint
        </button>
        <button className="btn" data-testid="btn-reposition" onClick={onReposition}>
          Reposisi objek yang sama
        </button>
        <button className="btn" data-testid="btn-redraw-gameplay" onClick={onRedraw}>
          Gambar ulang
        </button>
      </div>
    </div>
  );
}

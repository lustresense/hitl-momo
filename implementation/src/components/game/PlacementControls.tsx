/**
 * Floating placement controls: confirm the object position and show why a position is rejected.
 */
const containerStyle = {
  flexDirection: "column",
  gap: 8,
  alignItems: "center",
  padding: "12px 20px",
} as const;

const errorStyle = { color: "#d94336", fontSize: 12, fontWeight: 600 } as const;

export interface PlacementControlsProps {
  confirmDisabled: boolean;
  placementError: string;
  onConfirm: () => void;
}

export function PlacementControls({ confirmDisabled, placementError, onConfirm }: PlacementControlsProps) {
  return (
    <div className="stage-floating-controls" data-testid="placement-controls" style={containerStyle}>
      <button
        className="btn btn-primary btn-small"
        data-testid="btn-confirm-placement"
        disabled={confirmDisabled}
        onClick={onConfirm}
      >
        Konfirmasi Posisi
      </button>
      {placementError && <span style={errorStyle}>{placementError}</span>}
    </div>
  );
}

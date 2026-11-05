/**
 * Small corner chip that states how the stage is currently controlled (hand tracking status or fallback).
 */
import type { ReactNode } from "react";

const chipStyle = {
  position: "absolute",
  bottom: 12,
  right: 16,
  zIndex: 150,
  fontSize: 11,
  fontWeight: 600,
  padding: "4px 8px",
  borderRadius: 4,
  background: "rgba(255,255,255,0.85)",
  border: "1px solid rgba(0,0,0,0.15)",
  color: "#333",
  pointerEvents: "none",
} as const;

export function InputStatusChip({ children }: { children: ReactNode }) {
  return (
    <div className="stage-input-status-chip" style={chipStyle}>
      <span role="status" data-testid="input-status">
        {children}
      </span>
    </div>
  );
}

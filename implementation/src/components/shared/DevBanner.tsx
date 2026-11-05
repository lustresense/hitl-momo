/**
 * Always-visible, deliberately short provenance mark (NFR-05).
 * Prediction is simulated in this build; never present it as a real model.
 */
export function DevBanner({ mode }: { mode: "mock" | "partner" }) {
  return (
    <span id="dev-banner" className="demo-chip dev-banner" role="note" data-testid="dev-banner">
      {mode === "partner" ? "Uji model mitra" : "Demo / simulasi"}
    </span>
  );
}

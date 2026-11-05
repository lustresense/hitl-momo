/** NFR-05: provenance of the predictions stays visible at all times (never presented as a real model). */
export function DevBanner({ mode }: { mode: "mock" | "partner" }) {
  return (
    <span id="dev-banner" className="dev-banner">
      {mode === "partner" ? "Tebakan dari model partner (uji coba)" : "Mode demo: tebakan masih simulasi"}
    </span>
  );
}

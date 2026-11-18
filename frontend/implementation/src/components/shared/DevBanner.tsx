import { showDemoNotice } from "@/src/config/demo";
import type { PredictionProvenance } from "@/src/prediction/provenance";

/**
 * NFR-05: provenance of the predictions stays visible (never presented as a real model).
 * One tape label for the whole app. `mode` is the provenance mode of the prediction on screen (see SketchbookApp),
 * and the demo tape goes through showDemoNotice, so model output never gets the demo label.
 * Remove with `config/demo.ts` once a real model is in.
 */
export function DevBanner({ mode }: { mode: "mock" | "partner" }) {
  const source: PredictionProvenance["source"] = mode === "partner" ? "model" : "demo";
  if (source === "demo" && !showDemoNotice(source)) return null;
  return (
    <span id="dev-banner" className="dev-banner demo-tape">
      {source === "model" ? "Tebakan dari model partner, uji coba" : "Mode demo: tebakan masih simulasi"}
    </span>
  );
}

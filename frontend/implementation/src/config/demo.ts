import type { PredictionProvenance } from "../prediction/provenance";

/**
 * Demo-only switch. Kill switch for the "Mode demo" notice. The notice itself follows the
 * provenance of each prediction (see showDemoNotice), so it never appears next to model output.
 */
export const SHOW_MOCK_NOTICE = true;

/** True only for demo predictions. Model output never gets the demo notice. */
export function showDemoNotice(source: PredictionProvenance["source"]): boolean {
  return SHOW_MOCK_NOTICE && source === "demo";
}

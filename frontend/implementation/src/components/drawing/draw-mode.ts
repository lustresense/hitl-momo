import type { InputMode } from "@/src/input/input-mode";
import type { InputModeId } from "@/src/input/types";

/** R13: camera mode draws by hand whatever the env default says; fallback mode draws with the pointer. */
export function drawModeFor(app: InputMode, _envDefault: InputModeId): InputModeId {
  return app === "camera" ? "hand" : "pointer";
}

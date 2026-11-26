import type { InputSample, SourceKind } from "../core/types";

export type { InputSample, SourceKind };

/** Kontrak sumber input (PLAN §5.3.1). Hanya satu sumber aktif lewat arbiter. */
export interface InputSource {
  readonly kind: SourceKind;
  start(): void;
  stop(): void;
  subscribe(cb: (s: InputSample) => void): () => void;
}

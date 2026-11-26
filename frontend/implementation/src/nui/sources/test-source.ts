import type { InputSample, Point, SourceKind } from "../core/types";
import type { InputSource } from "./input-source";

export interface TestSampleInput {
  x: number;
  y: number;
  t?: number;
  inFrame?: boolean;
  pinch?: boolean;
  pinchStrength?: number;
  nib?: Point;
  clickPoint?: Point;
  source?: SourceKind;
}

export interface SkbNuiHook {
  push(sample: TestSampleInput): void;
}

type WindowWithSkbNui = Window & { __skbNui?: SkbNuiHook };

/**
 * Sumber input sintetis untuk Vitest & E2E (PLAN §5.3.1).
 * Binding `window.__skbNui` HANYA aktif bila dipanggil saat `NEXT_PUBLIC_TEST_HOOKS=1`.
 */
export class TestSource implements InputSource {
  readonly kind: SourceKind = "test";

  private readonly clock: () => number;
  private readonly listeners = new Set<(s: InputSample) => void>();
  private running = false;

  constructor(clock: () => number = () => performance.now()) {
    this.clock = clock;
  }

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  subscribe(cb: (s: InputSample) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  push(input: TestSampleInput): InputSample | null {
    if (!this.running) return null;
    const pinch = input.pinch ?? false;
    const sample: InputSample = {
      t: input.t ?? this.clock(),
      x: input.x,
      y: input.y,
      inFrame: input.inFrame ?? true,
      pinch,
      pinchStrength: input.pinchStrength ?? (pinch ? 1 : 0),
      nib: input.nib,
      clickPoint: input.clickPoint ?? (pinch ? { x: input.x, y: input.y } : undefined),
      source: input.source ?? "test",
    };
    for (const cb of [...this.listeners]) cb(sample);
    return sample;
  }
}

/**
 * Pasang `window.__skbNui` hanya ketika `enabled` true (default: `NEXT_PUBLIC_TEST_HOOKS === "1"`).
 * Mengembalikan fungsi cleanup yang idempoten.
 */
export function bindSkbNuiHook(
  source: TestSource,
  enabled: boolean = process.env.NEXT_PUBLIC_TEST_HOOKS === "1",
): () => void {
  if (!enabled || typeof window === "undefined") return () => {};
  const w = window as WindowWithSkbNui;
  const hook: SkbNuiHook = {
    push: (sample) => {
      source.push(sample);
    },
  };
  w.__skbNui = hook;
  return () => {
    if (w.__skbNui === hook) delete w.__skbNui;
  };
}

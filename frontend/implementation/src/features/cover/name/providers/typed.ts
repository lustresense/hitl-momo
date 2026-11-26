import { normalizeName } from "../normalize-name";
import type { NameProvider, NameResult } from "../name-provider";

export interface TypedNameProvider extends NameProvider {
  readonly kind: "typed";
  submit(rawName: string): void;
  cancelPending(): void;
}

/**
 * Provider ketik di chrome (`[data-nui-off]`) untuk guru atau fallback tanpa dead-end (O-4, O-15).
 * Privasi anak: nama tidak pernah dicatat ke console atau Web Storage.
 */
export function createTypedNameProvider(): TypedNameProvider {
  let pendingResolve: ((result: NameResult) => void) | null = null;
  let cleanupPending: (() => void) | null = null;

  const finish = (result: NameResult): void => {
    const resolve = pendingResolve;
    const cleanup = cleanupPending;
    pendingResolve = null;
    cleanupPending = null;
    cleanup?.();
    resolve?.(result);
  };

  return {
    kind: "typed",
    submit(rawName: string): void {
      if (!pendingResolve) return;
      const cleaned = normalizeName(rawName);
      finish(cleaned ? { status: "ok", name: cleaned } : { status: "empty" });
    },
    cancelPending(): void {
      if (!pendingResolve) return;
      finish({ status: "cancelled" });
    },
    listen(signal: AbortSignal): Promise<NameResult> {
      if (signal.aborted) {
        return Promise.resolve({ status: "cancelled" });
      }
      if (pendingResolve) {
        finish({ status: "cancelled" });
      }
      return new Promise<NameResult>((resolve) => {
        const onAbort = () => {
          finish({ status: "cancelled" });
        };
        pendingResolve = resolve;
        signal.addEventListener("abort", onAbort, { once: true });
        cleanupPending = () => {
          signal.removeEventListener("abort", onAbort);
        };
      });
    },
  };
}

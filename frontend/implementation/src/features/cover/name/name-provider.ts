import { createSimNameProvider } from "./providers/sim";
import { createSttLabProvider } from "./providers/stt-lab";
import { createTypedNameProvider, type TypedNameProvider } from "./providers/typed";

export type NameProviderKind = "stt-lab" | "typed" | "sim";

export type NameResult =
  | { readonly status: "ok"; readonly name: string; readonly simulated?: boolean }
  | { readonly status: "unavailable"; readonly reason?: string }
  | { readonly status: "cancelled" }
  | { readonly status: "empty" };

export interface NameProvider {
  readonly kind: NameProviderKind;
  readonly label?: string;
  listen(signal: AbortSignal): Promise<NameResult>;
}

export type NameOutcome =
  | { readonly status: "ok"; readonly name: string; readonly provider: NameProviderKind; readonly simulated?: boolean }
  | { readonly status: "unavailable" }
  | { readonly status: "cancelled" }
  | { readonly status: "empty"; readonly provider: NameProviderKind };

export interface DefaultNameProvidersOptions {
  readonly devTools: boolean;
  readonly typed?: TypedNameProvider;
  readonly includeSimInChain?: boolean;
  readonly onInterim?: (text: string) => void;
}

export interface ListenFallbackCallbacks {
  readonly onFallbackToTyped?: () => void;
  readonly onProviderStart?: (provider: NameProvider) => void;
}

/**
 * Rantai provider default:
 * - Produksi (`!devTools`): `["stt-lab", "typed"]` (tanpa `sim` / tanpa "Bima").
 * - Saat `devTools && includeSimInChain`: menyertakan `sim` sebelum `typed`.
 */
export function createDefaultNameProviders(options: DefaultNameProvidersOptions): NameProvider[] {
  const typed = options.typed ?? createTypedNameProvider();
  const list: NameProvider[] = [createSttLabProvider()];
  if (options.devTools && options.includeSimInChain) {
    list.push(createSimNameProvider({ devTools: true, onInterim: options.onInterim }));
  }
  list.push(typed);
  return list;
}

export async function listenWithFallback(
  providers: readonly NameProvider[],
  signal: AbortSignal,
  callbacks?: ListenFallbackCallbacks,
): Promise<NameOutcome> {
  for (const provider of providers) {
    if (signal.aborted) {
      return { status: "cancelled" };
    }
    callbacks?.onProviderStart?.(provider);
    if (provider.kind === "typed") {
      callbacks?.onFallbackToTyped?.();
    }
    const result = await provider.listen(signal);
    if (result.status === "ok") {
      return {
        status: "ok",
        name: result.name,
        provider: provider.kind,
        ...(result.simulated !== undefined ? { simulated: result.simulated } : {}),
      };
    }
    if (result.status === "cancelled") {
      return { status: "cancelled" };
    }
    if (result.status === "empty") {
      return { status: "empty", provider: provider.kind };
    }
  }
  return { status: "unavailable" };
}

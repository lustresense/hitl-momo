import { COVER_NAME_COPY } from "@/src/domain/copy/cover";
import { NAME_LISTEN_MS } from "@/src/nui/core/constants";
import { normalizeName } from "../normalize-name";
import type { NameProvider, NameResult } from "../name-provider";

/** Nama contoh sandbox — HANYA boleh dipakai oleh provider `sim` saat `devTools` aktif (O-15). */
export const SIM_SAMPLE_NAME = "Bima";

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly [index: number]: SpeechRecognitionAlternativeLike | undefined;
}

interface SpeechRecognitionEventLike {
  readonly results: {
    readonly length: number;
    readonly [index: number]: SpeechRecognitionResultLike | undefined;
  };
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

export interface SimNameProviderOptions {
  readonly devTools: boolean;
  readonly fallbackDelayMs?: number;
  readonly listenTimeoutMs?: number;
  readonly onInterim?: (text: string) => void;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

/**
 * Provider simulasi khusus dev (`NEXT_PUBLIC_DEV_TOOLS=1`, berlabel `SIMULASI`, O-4 & O-15).
 * Memakai Web Speech API jika tersedia, atau contoh `SIM_SAMPLE_NAME` setelah jeda bila mik absen.
 * Selalu `unavailable` bila `devTools` tidak aktif.
 */
export function createSimNameProvider(options: SimNameProviderOptions): NameProvider {
  const { devTools, fallbackDelayMs = 1600, listenTimeoutMs = NAME_LISTEN_MS, onInterim } = options;

  return {
    kind: "sim",
    label: COVER_NAME_COPY.simBadgeLabel,
    listen(signal: AbortSignal): Promise<NameResult> {
      if (!devTools) {
        return Promise.resolve({ status: "unavailable", reason: "dev-tools-disabled" });
      }
      if (signal.aborted) {
        return Promise.resolve({ status: "cancelled" });
      }

      return new Promise<NameResult>((resolve) => {
        let settled = false;
        let rec: SpeechRecognitionInstance | null = null;
        let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
        let listenTimer: ReturnType<typeof setTimeout> | null = null;

        const cleanup = () => {
          if (fallbackTimer !== null) clearTimeout(fallbackTimer);
          if (listenTimer !== null) clearTimeout(listenTimer);
          signal.removeEventListener("abort", onAbort);
          if (rec) {
            try {
              rec.onresult = null;
              rec.onerror = null;
              rec.onend = null;
              rec.abort();
            } catch {
              /* ignore abort errors */
            }
            rec = null;
          }
        };

        const finish = (result: NameResult) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(result);
        };

        const resolveSample = () => {
          finish({ status: "ok", name: SIM_SAMPLE_NAME, simulated: true });
        };

        const onAbort = () => finish({ status: "cancelled" });
        signal.addEventListener("abort", onAbort, { once: true });

        const SR = getSpeechRecognitionCtor();
        if (SR) {
          try {
            rec = new SR();
            rec.lang = "id-ID";
            rec.interimResults = true;
            rec.maxAlternatives = 3;
            rec.continuous = false;
            rec.onresult = (e) => {
              const last = e.results[e.results.length - 1];
              const transcript = last?.[0]?.transcript ?? "";
              if (!last) return;
              if (!last.isFinal) {
                onInterim?.(normalizeName(transcript) || transcript);
                return;
              }
              const cleaned = normalizeName(transcript);
              if (cleaned) {
                finish({ status: "ok", name: cleaned, simulated: true });
              } else {
                finish({ status: "empty" });
              }
            };
            rec.onerror = () => {
              if (fallbackTimer === null) {
                fallbackTimer = setTimeout(resolveSample, Math.min(900, fallbackDelayMs));
              }
            };
            rec.onend = () => {
              if (!settled && fallbackTimer === null) {
                fallbackTimer = setTimeout(resolveSample, Math.min(300, fallbackDelayMs));
              }
            };
            rec.start();
          } catch {
            fallbackTimer = setTimeout(resolveSample, fallbackDelayMs);
          }
        } else {
          fallbackTimer = setTimeout(resolveSample, fallbackDelayMs);
        }

        listenTimer = setTimeout(resolveSample, listenTimeoutMs);
      });
    },
  };
}

import type { NameProvider } from "../name-provider";

/**
 * Stub STT Lab (§5.5 & O-4): gagal-tertutup tanpa menyentuh mikrofon atau merekam audio
 * sampai kontrak layanan `/api/stt/*` tersedia.
 */
export function createSttLabProvider(): NameProvider {
  return {
    kind: "stt-lab",
    async listen(signal: AbortSignal) {
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      return { status: "unavailable", reason: "stt-lab-unconfigured" };
    },
  };
}

/**
 * Engine registry for the NUI Lab benchmark. Every engine = one classifier model (R19 C0 baseline, R20 C4, R20 C7
 * distilled) behind the SAME geometry guards, FSM and hand-lock. The detector is always MediaPipe HandLandmarker on CPU.
 *
 * Models are pinned by SHA-256. A byte mismatch fails closed (the lab refuses to run that engine), it is never replaced
 * silently by another model.
 */
import type { EngineConfig, EngineId, PreprocessMode } from "./schema";

export interface EngineSpec {
  engineId: EngineId;
  label: string;
  short: string;
  modelUrl: string;
  sha256: string;
  bytes: number;
  note: string;
}

export const ENGINE_SPECS: Record<EngineId, EngineSpec> = {
  "r19-c0": {
    engineId: "r19-c0",
    label: "R19 C0 (baseline) · MLP 82→96→48→3",
    short: "R19 C0",
    modelUrl: "/models/r19-pistol-model.json",
    sha256: "c6130bd56850534889372a7295d45e7704083cbf60115626cd08b57c6e000293",
    bytes: 122_768,
    note: "Baseline R19 yang dibekukan; pembanding wajib.",
  },
  "r20-c4": {
    engineId: "r20-c4",
    label: "R20 C4 · MLP 82→64→32→3 (fokal, kohort penuh)",
    short: "R20 C4",
    modelUrl: "/models/r20-c4-model.json",
    sha256: "e863ef1afe459a3b0a4cf0b0b2594a1db853b382d669add2d7be234e64710a27",
    bytes: 73_275,
    note: "Student utama R20 (offline teacher tidak dikirim ke browser).",
  },
  "r20-c7": {
    engineId: "r20-c7",
    label: "R20 C7 · distilasi T=4 · MLP 82→64→32→3",
    short: "R20 C7",
    modelUrl: "/models/r20-c7-t4-model.json",
    sha256: "66acbde9f73868f8e6afada647a6d513d7efab6252a937bf88dede933147d730",
    bytes: 73_138,
    note: "Student hasil distilasi teacher ensemble GPU; pembanding C4.",
  },
};

export const ENGINE_IDS: EngineId[] = ["r19-c0", "r20-c4", "r20-c7"];
export const DEFAULT_ENGINE_ID: EngineId = "r20-c4";
export const DEFAULT_PREPROCESS: PreprocessMode = "a4";

export const PREPROCESS_LABELS: Record<PreprocessMode, string> = {
  raw: "RAW (tanpa peningkatan)",
  clahe: "CLAHE 320 permanen",
  a4: "A4 adaptif (RAW + pemulihan saat deteksi gagal)",
};

export function isEngineId(v: unknown): v is EngineId {
  return v === "r19-c0" || v === "r20-c4" || v === "r20-c7";
}

export function isPreprocessMode(v: unknown): v is PreprocessMode {
  return v === "raw" || v === "clahe" || v === "a4";
}

export function buildEngineConfig(
  engineId: EngineId,
  preprocess: PreprocessMode,
  detector: EngineConfig["detector"],
  modelHashVerified: boolean,
): EngineConfig {
  const spec = ENGINE_SPECS[engineId];
  return {
    engineId,
    label: spec.label,
    modelUrl: spec.modelUrl,
    modelSha256: spec.sha256,
    modelBytes: spec.bytes,
    modelHashVerified,
    preprocess,
    detector,
    delegate: "CPU",
    numHandsPolicy: detector === "cpu-worker" ? "owner-lock-guarded" : "main-thread-fixed-2",
  };
}

export function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface LoadedEngineModel {
  json: unknown;
  hashVerified: boolean;
  bytes: number;
}

/**
 * Fetch the pinned model for an engine. When the response exposes raw bytes and WebCrypto is present the SHA-256 is
 * checked and a mismatch throws. Test doubles that only expose `.json()` load without hash verification and report
 * `hashVerified:false`, which is written into every trial so an unverified run is never mistaken for a verified one.
 */
export async function fetchEngineModel(
  engineId: EngineId,
  fetcher: typeof fetch | undefined = typeof fetch === "function" ? fetch : undefined,
): Promise<LoadedEngineModel> {
  const spec = ENGINE_SPECS[engineId];
  if (typeof fetcher !== "function") throw new Error(`Gagal memuat model ${spec.short}: fungsi fetch tidak tersedia`);
  let response: Response;
  try {
    response = await fetcher(spec.modelUrl);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Gagal memuat model ${spec.short} (${spec.modelUrl}): kesalahan jaringan (${detail})`);
  }
  if (!response || !response.ok) {
    const st = response ? `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}` : "respons kosong";
    throw new Error(`Gagal memuat model ${spec.short} (${spec.modelUrl}): ${st}`);
  }
  const canHash =
    typeof (response as { arrayBuffer?: unknown }).arrayBuffer === "function" &&
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.subtle?.digest === "function";
  if (canHash) {
    const buf = await response.arrayBuffer();
    const got = toHex(await globalThis.crypto.subtle.digest("SHA-256", buf));
    if (got !== spec.sha256) {
      throw new Error(
        `Model ${spec.short} ditolak: SHA-256 tidak cocok (harus ${spec.sha256.slice(0, 12)}…, terbaca ${got.slice(0, 12)}…)`,
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(buf));
    } catch (err) {
      throw new Error(`Gagal membaca JSON model ${spec.short}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { json, hashVerified: true, bytes: buf.byteLength };
  }
  try {
    return { json: await response.json(), hashVerified: false, bytes: spec.bytes };
  } catch (err) {
    throw new Error(`Gagal membaca JSON model ${spec.short} (${spec.modelUrl}): ${err instanceof Error ? err.message : String(err)}`);
  }
}

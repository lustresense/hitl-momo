/**
 * Engine registry for the NUI Lab benchmark (Contract K6).
 * Every engine = one classifier model (R19 C0 baseline, R20 C4, R20 C7 distilled) behind the SAME geometry guards,
 * FSM and hand-lock. The detector is always MediaPipe HandLandmarker on CPU.
 *
 * Models are pinned by SHA-256. A byte mismatch fails closed (the lab refuses to run that engine), it is never replaced
 * silently by another model. Primary UI displays `AUTO_RUNTIME_UI_LABEL` ("NUI R22 · CPU · Otomatis") while
 * diagnostics and JSON exports ALWAYS record the true underlying model ID and full SHA-256.
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
  modelFamily: "r19-baseline" | "r20-student" | "r22-candidate";
  isTrainedR22Model: boolean;
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
    modelFamily: "r19-baseline",
    isTrainedR22Model: false,
  },
  "r20-c4": {
    engineId: "r20-c4",
    label: "R20 C4 · MLP 82→64→32→3 (fokal, kohort penuh)",
    short: "R20 C4",
    modelUrl: "/models/r20-c4-model.json",
    sha256: "e863ef1afe459a3b0a4cf0b0b2594a1db853b382d669add2d7be234e64710a27",
    bytes: 73_275,
    note: "Student utama R20 (offline teacher tidak dikirim ke browser).",
    modelFamily: "r20-student",
    isTrainedR22Model: false,
  },
  "r20-c7": {
    engineId: "r20-c7",
    label: "R20 C7 · distilasi T=4 · MLP 82→64→32→3",
    short: "R20 C7",
    modelUrl: "/models/r20-c7-t4-model.json",
    sha256: "66acbde9f73868f8e6afada647a6d513d7efab6252a937bf88dede933147d730",
    bytes: 73_138,
    note: "Student hasil distilasi teacher ensemble GPU; pembanding C4.",
    modelFamily: "r20-student",
    isTrainedR22Model: false,
  },
};

export const ENGINE_IDS: EngineId[] = ["r19-c0", "r20-c4", "r20-c7"];
export const DEFAULT_ENGINE_ID: EngineId = "r20-c4";
/**
 * Owner Decision R22 (2026-11-20): default to RAW until physical webcam low-light recordings exist
 * (offline bxr7 dim: RAW 60.0% > A4v2 40.0% > R22 35.6%). A4 and R22 soft-knee remain candidates.
 */
export const DEFAULT_PREPROCESS: PreprocessMode = "raw";
export const PREPROCESS_CANDIDATES = ["a4", "r22-soft-knee-shadow-clamp"] as const;
export const AUTO_RUNTIME_UI_LABEL = "NUI R22 · CPU · Otomatis" as const;

export const PREPROCESS_LABELS: Record<PreprocessMode, string> = {
  raw: "RAW (default — tanpa peningkatan)",
  clahe: "CLAHE 320 permanen",
  a4: "A4 adaptif (kandidat — RAW + pemulihan saat deteksi gagal)",
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
  opts?: {
    numHandsPolicy?: EngineConfig["numHandsPolicy"];
    numHandsOverride?: string | null;
    displayModeLabel?: string;
  },
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
    numHandsPolicy:
      opts?.numHandsPolicy ?? (detector === "cpu-worker" ? "fixed-2" : "main-thread-fixed-2"),
    numHandsOverride: opts?.numHandsOverride ?? null,
    displayModeLabel: opts?.displayModeLabel ?? AUTO_RUNTIME_UI_LABEL,
    actualModelId: engineId,
    modelFamily: spec.modelFamily,
    isTrainedR22Model: spec.isTrainedR22Model,
  };
}

/** Honest diagnostics summary: keeps primary UI simple while never disguising C4 as a newly trained R22 weight. */
export function formatHonestEngineDiagnostics(cfg: Pick<EngineConfig, "engineId" | "modelSha256" | "modelHashVerified" | "isTrainedR22Model">): {
  uiBadge: string;
  actualModelId: EngineId;
  actualModelLabel: string;
  modelSha256: string;
  modelHashVerified: boolean;
  isTrainedR22Model: boolean;
  honestyNote: string;
} {
  const spec = ENGINE_SPECS[cfg.engineId];
  const isTrainedR22 = cfg.isTrainedR22Model ?? spec.isTrainedR22Model;
  return {
    uiBadge: AUTO_RUNTIME_UI_LABEL,
    actualModelId: cfg.engineId,
    actualModelLabel: spec.label,
    modelSha256: cfg.modelSha256,
    modelHashVerified: cfg.modelHashVerified,
    isTrainedR22Model: isTrainedR22,
    honestyNote: isTrainedR22
      ? `Model terlatih R22 aktif (${cfg.engineId}).`
      : `Memakai classifier ${spec.short} (${spec.modelFamily}) + resolver/FSM R22; bukan bobot R22 baru.`,
  };
}

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Pure-TS SHA-256 fallback (used when WebCrypto subtle.digest is unavailable, e.g. non-secure HTTP LAN contexts).
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256HexSync(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const bitLen = bytes.length * 8;
  const padLen = ((bytes.length + 9 + 63) & ~63);
  const buf = new Uint8Array(padLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padLen - 4, bitLen >>> 0, false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!, f = h[5]!, g = h[6]!, hh = h[7]!;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
}

/** Computes SHA-256 hex digest using WebCrypto SubtleCrypto when present, else deterministic pure-TS SHA-256. */
export async function computeSha256Hex(input: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.subtle?.digest === "function") {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer);
    return toHex(digest);
  }
  return sha256HexSync(bytes);
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

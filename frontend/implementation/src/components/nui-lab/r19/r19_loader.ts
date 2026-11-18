/**
 * Runtime validation and strict fail-closed loader for exported R19 Pistol MLP models.
 * Never falls back to legacy R17/R18 models on network, HTTP, JSON, or dimension errors.
 */
import { R19_FEATURE_COUNT, R19_LABELS } from "./r19_features";
import type { R19ExportedModel } from "./r19_model";

export const DEFAULT_R19_MODEL_URL = "/models/r19-pistol-model.json";

export interface R19FetchResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  json(): Promise<unknown>;
}

export type R19ModelFetcher = (url: string) => Promise<R19FetchResponse>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function readOptionalString(
  obj: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = obj[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string") {
    throw new Error(`Model R19 tidak valid: field "${key}" harus berupa string`);
  }
  return value;
}

/**
 * Validates an unknown parsed JSON value as a complete, dimension-safe `R19ExportedModel`.
 * Throws explicit Indonesian error messages on any missing key, corrupt shape, or invalid value.
 */
export function validateR19Model(raw: unknown): R19ExportedModel {
  if (!isPlainObject(raw)) {
    throw new Error("Model R19 tidak valid: format JSON bukan objek");
  }

  const name = readOptionalString(raw, "name", "r19-pistol-model");
  const version = readOptionalString(raw, "version", "r19");
  const licenseProvenance = readOptionalString(raw, "license_provenance", "");

  if (!Array.isArray(raw.labels) || raw.labels.length !== R19_LABELS.length) {
    throw new Error(
      `Model R19 tidak valid: "labels" harus berisi tepat ${R19_LABELS.length} kelas (${R19_LABELS.join(", ")})`,
    );
  }
  const labels: string[] = [];
  for (let i = 0; i < raw.labels.length; i++) {
    const lbl = raw.labels[i];
    if (typeof lbl !== "string" || lbl.length === 0) {
      throw new Error(`Model R19 tidak valid: labels[${i}] harus berupa string tidak kosong`);
    }
    labels.push(lbl);
  }
  for (const required of R19_LABELS) {
    if (!labels.includes(required)) {
      throw new Error(`Model R19 tidak valid: label wajib "${required}" tidak ditemukan`);
    }
  }

  if (!Array.isArray(raw.feature_names) || raw.feature_names.length !== R19_FEATURE_COUNT) {
    throw new Error(
      `Model R19 tidak valid: "feature_names" harus berpanjang ${R19_FEATURE_COUNT} (ditemukan ${
        Array.isArray(raw.feature_names) ? raw.feature_names.length : "bukan array"
      })`,
    );
  }
  const featureNames: string[] = [];
  for (let i = 0; i < raw.feature_names.length; i++) {
    const fn = raw.feature_names[i];
    if (typeof fn !== "string" || fn.length === 0) {
      throw new Error(`Model R19 tidak valid: feature_names[${i}] harus berupa string tidak kosong`);
    }
    featureNames.push(fn);
  }

  if (!isFiniteNumberArray(raw.mean) || raw.mean.length !== R19_FEATURE_COUNT) {
    throw new Error(
      `Model R19 tidak valid: "mean" harus berupa array ${R19_FEATURE_COUNT} angka valid`,
    );
  }
  if (
    !isFiniteNumberArray(raw.std) ||
    raw.std.length !== R19_FEATURE_COUNT ||
    raw.std.some((v) => v < 0)
  ) {
    throw new Error(
      `Model R19 tidak valid: "std" harus berupa array ${R19_FEATURE_COUNT} angka >= 0`,
    );
  }

  if (typeof raw.temperature !== "number" || !Number.isFinite(raw.temperature) || raw.temperature <= 0) {
    throw new Error('Model R19 tidak valid: "temperature" harus berupa angka > 0');
  }

  if (!Array.isArray(raw.layers) || raw.layers.length === 0) {
    throw new Error('Model R19 tidak valid: "layers" tidak boleh kosong');
  }

  const layers: Array<{ W: number[][]; b: number[] }> = [];
  let expectedIn = R19_FEATURE_COUNT;
  for (let li = 0; li < raw.layers.length; li++) {
    const layer = raw.layers[li];
    if (!isPlainObject(layer)) {
      throw new Error(`Model R19 tidak valid: layers[${li}] bukan objek`);
    }
    if (!isFiniteNumberArray(layer.b) || layer.b.length === 0) {
      throw new Error(`Model R19 tidak valid: layers[${li}].b harus berupa array angka tidak kosong`);
    }
    const outDim = layer.b.length;
    if (!Array.isArray(layer.W) || layer.W.length !== expectedIn) {
      throw new Error(
        `Model R19 tidak valid: layers[${li}].W harus memiliki ${expectedIn} baris (ditemukan ${
          Array.isArray(layer.W) ? layer.W.length : "bukan array"
        })`,
      );
    }
    const W: number[][] = [];
    for (let r = 0; r < layer.W.length; r++) {
      const row = layer.W[r];
      if (!isFiniteNumberArray(row) || row.length !== outDim) {
        throw new Error(
          `Model R19 tidak valid: layers[${li}].W[${r}] harus berupa ${outDim} angka valid`,
        );
      }
      W.push([...row]);
    }
    layers.push({ W, b: [...layer.b] });
    expectedIn = outDim;
  }

  if (expectedIn !== R19_LABELS.length) {
    throw new Error(
      `Model R19 tidak valid: layer terakhir harus menghasilkan ${R19_LABELS.length} output (ditemukan ${expectedIn})`,
    );
  }

  return {
    name,
    version,
    license_provenance: licenseProvenance,
    labels,
    feature_names: featureNames,
    mean: [...raw.mean],
    std: [...raw.std],
    temperature: raw.temperature,
    layers,
  };
}

/**
 * Fetches and validates the exported R19 model JSON.
 * Throws explicit Indonesian error messages on network, HTTP, JSON, or validation failures.
 */
export async function fetchR19Model(
  url: string = DEFAULT_R19_MODEL_URL,
  fetcher: R19ModelFetcher | undefined = typeof fetch === "function" ? fetch : undefined,
): Promise<R19ExportedModel> {
  if (typeof fetcher !== "function") {
    throw new Error("Gagal memuat model R19: fungsi fetch tidak tersedia");
  }

  let response: R19FetchResponse;
  try {
    response = await fetcher(url);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Gagal memuat model R19 (${url}): kesalahan jaringan (${detail})`);
  }

  if (!response || !response.ok) {
    const statusText = response
      ? `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`
      : "respons kosong";
    throw new Error(`Gagal memuat model R19 (${url}): ${statusText}`);
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Gagal membaca JSON model R19 (${url}): ${detail}`);
  }

  return validateR19Model(parsed);
}

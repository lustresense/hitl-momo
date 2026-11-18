import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_R19_MODEL_URL, fetchR19Model, validateR19Model, type R19FetchResponse } from "@/src/components/nui-lab/r19/r19_loader";
import { R19_FEATURE_COUNT, R19_LABELS } from "@/src/components/nui-lab/r19/r19_features";
import type { R19ExportedModel } from "@/src/components/nui-lab/r19/r19_model";

function readRealModelRaw(): R19ExportedModel {
  const modelPath = fileURLToPath(new URL("../../public/models/r19-pistol-model.json", import.meta.url));
  return JSON.parse(readFileSync(modelPath, "utf8")) as R19ExportedModel;
}

function cloneModel(): R19ExportedModel {
  return JSON.parse(JSON.stringify(readRealModelRaw())) as R19ExportedModel;
}

describe("R19 strict fail-closed model loader & validator", () => {
  it("validates the real exported model public/models/r19-pistol-model.json", async () => {
    const raw = readRealModelRaw();
    const validated = validateR19Model(raw);
    expect(validated.feature_names).toHaveLength(R19_FEATURE_COUNT);
    expect(validated.feature_names.length).toBe(82);
    expect(validated.labels).toEqual(["POINT_READY", "POINT_PRESS", "OTHER"]);
    expect(validated.labels).toEqual([...R19_LABELS]);
    expect(validated.mean).toHaveLength(82);
    expect(validated.std).toHaveLength(82);
    expect(validated.temperature).toBeGreaterThan(0);
    expect(validated.layers.length).toBeGreaterThanOrEqual(1);
    expect(validated.layers.at(-1)!.b).toHaveLength(3);

    const fetched = await fetchR19Model(DEFAULT_R19_MODEL_URL, async (): Promise<R19FetchResponse> => ({
      ok: true,
      status: 200,
      json: async () => raw,
    }));
    expect(fetched.name).toBe(validated.name);
    expect(fetched.labels).toEqual(["POINT_READY", "POINT_PRESS", "OTHER"]);
    expect(fetched.feature_names).toHaveLength(82);
  });

  it("throws an explicit Indonesian error on HTTP 404 and HTTP 500 responses", async () => {
    await expect(
      fetchR19Model("/models/r19-pistol-model.json", async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({}),
      })),
    ).rejects.toThrow(/Gagal memuat model R19.*HTTP 404/);

    await expect(
      fetchR19Model("/models/r19-pistol-model.json", async () => ({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({}),
      })),
    ).rejects.toThrow(/Gagal memuat model R19.*HTTP 500/);
  });

  it("throws an explicit Indonesian error on network error or invalid JSON", async () => {
    await expect(
      fetchR19Model("/models/r19-pistol-model.json", async () => {
        throw new Error("ECONNREFUSED");
      }),
    ).rejects.toThrow(/Gagal memuat model R19.*kesalahan jaringan.*ECONNREFUSED/);

    await expect(
      fetchR19Model("/models/r19-pistol-model.json", async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        },
      })),
    ).rejects.toThrow(/Gagal membaca JSON model R19/);
  });

  it("rejects non-object JSON payloads", () => {
    for (const bad of [null, [], "invalid", 123]) {
      expect(() => validateR19Model(bad)).toThrow(/format JSON bukan objek/);
    }
  });

  it("rejects wrong feature_names length (81 instead of 82)", () => {
    const bad = cloneModel();
    bad.feature_names = bad.feature_names.slice(0, 81);
    expect(() => validateR19Model(bad)).toThrow(/feature_names.*82/);
  });

  it("rejects missing, invalid, or duplicate labels", () => {
    const tooFew = cloneModel();
    tooFew.labels = ["POINT_READY", "POINT_PRESS"];
    expect(() => validateR19Model(tooFew)).toThrow(/labels.*3 kelas/);

    const unknownLabel = cloneModel();
    unknownLabel.labels = ["POINT_READY", "POINT_PRESS", "BOGUS"];
    expect(() => validateR19Model(unknownLabel)).toThrow(/label wajib "OTHER" tidak ditemukan/);

    const duplicate = cloneModel();
    duplicate.labels = ["POINT_READY", "POINT_READY", "OTHER"];
    expect(() => validateR19Model(duplicate)).toThrow(/label wajib "POINT_PRESS" tidak ditemukan/);
  });

  it("rejects non-positive or non-finite temperature", () => {
    for (const temp of [0, -0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const bad = cloneModel();
      bad.temperature = temp;
      expect(() => validateR19Model(bad)).toThrow(/temperature.*> 0/);
    }
  });

  it("rejects NaN weights, NaN biases, negative std, and corrupt layer matrix shapes", () => {
    const nanWeight = cloneModel();
    nanWeight.layers[0]!.W[0]![0] = Number.NaN;
    expect(() => validateR19Model(nanWeight)).toThrow(/layers\[0\]\.W\[0\].*angka valid/);

    const nanBias = cloneModel();
    nanBias.layers[0]!.b[0] = Number.NaN;
    expect(() => validateR19Model(nanBias)).toThrow(/layers\[0\]\.b/);

    const negStd = cloneModel();
    negStd.std[0] = -0.1;
    expect(() => validateR19Model(negStd)).toThrow(/std.*>= 0/);

    const wrongRowCount = cloneModel();
    wrongRowCount.layers[0]!.W = wrongRowCount.layers[0]!.W.slice(0, 81);
    expect(() => validateR19Model(wrongRowCount)).toThrow(/layers\[0\]\.W.*82 baris/);

    const wrongColCount = cloneModel();
    wrongColCount.layers[0]!.W[0] = wrongColCount.layers[0]!.W[0]!.slice(0, -1);
    expect(() => validateR19Model(wrongColCount)).toThrow(/layers\[0\]\.W\[0\]/);

    const wrongOutDim = cloneModel();
    const last = wrongOutDim.layers.at(-1)!;
    last.b = [0, 0];
    last.W = last.W.map((row) => row.slice(0, 2));
    expect(() => validateR19Model(wrongOutDim)).toThrow(/layer terakhir.*3 output/);

    const emptyLayers = cloneModel();
    emptyLayers.layers = [];
    expect(() => validateR19Model(emptyLayers)).toThrow(/layers.*tidak boleh kosong/);
  });
});

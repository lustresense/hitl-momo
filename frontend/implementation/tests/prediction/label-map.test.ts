import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODEL_LABEL_MAP, lookupModelLabel } from "@/src/prediction/label-map";

// Single source of truth for the model's classes is the backend config (root config.py).
const CONFIG_PY = new URL("../../../../config.py", import.meta.url);

// Indonesian names shown in the Top-3. Plain words for SMP students: no emoji, no parentheses.
const EXPECTED_DISPLAY: Record<string, string> = {
  apple: "Apel",
  banana: "Pisang",
  bicycle: "Sepeda",
  bird: "Burung",
  book: "Buku",
  car: "Mobil",
  cat: "Kucing",
  cloud: "Awan",
  dog: "Anjing",
  fish: "Ikan",
  flower: "Bunga",
  house: "Rumah",
  moon: "Bulan",
  star: "Bintang",
  sun: "Matahari",
  tree: "Pohon",
  airplane: "Pesawat",
  sailboat: "Perahu layar",
  chair: "Kursi",
  mountain: "Gunung",
};

describe("label map: the 20 model classes", () => {
  it("covers exactly the classes in config.py, with the same spelling", () => {
    const src = readFileSync(CONFIG_PY, "utf-8");
    const block = src.split("CATEGORIES = [")[1]!.split("]")[0]!;
    const fromConfig = [...block.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!);
    expect(fromConfig).toHaveLength(20);
    expect(MODEL_LABEL_MAP.map((e) => e.modelLabel).sort()).toEqual([...fromConfig].sort());
  });

  it.each(Object.entries(EXPECTED_DISPLAY))("model class %s is shown to students as %s", (model, display) => {
    expect(lookupModelLabel(model)?.displayName).toBe(display);
  });

  it("has no honest equivalent for a level object yet, so gameLabel is null for every class", () => {
    // Level objects (papan, balok, tangga, batu, duri, tali, ember) are not model classes.
    // Mapping a class to one of them would be a false equivalent. See contracts/LABEL_MAP_PROPOSAL.md.
    for (const entry of MODEL_LABEL_MAP) expect(entry.gameLabel).toBeNull();
  });
});

describe("lookupModelLabel", () => {
  it("matches a trimmed, case-insensitive model label", () => {
    expect(lookupModelLabel("  CAT ")?.modelLabel).toBe("cat");
  });

  it("returns undefined for labels the model does not emit", () => {
    expect(lookupModelLabel("papan")).toBeUndefined();
    expect(lookupModelLabel("kursi")).toBeUndefined();
    expect(lookupModelLabel("")).toBeUndefined();
  });
});

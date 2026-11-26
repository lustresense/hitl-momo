import { describe, expect, it } from "vitest";
import { normalizeName } from "@/src/features/cover/name/normalize-name";
import { NAME_MAX_CHARS, NAME_MAX_WORDS } from "@/src/nui/core/constants";

describe("normalizeName (port exact clean() sandbox index.html:1125-1130)", () => {
  it("strips Indonesian greetings (halo, hai, hi, oke, ok)", () => {
    expect(normalizeName("halo rani")).toBe("Rani");
    expect(normalizeName("Hai Budi")).toBe("Budi");
    expect(normalizeName("hi siti")).toBe("Siti");
    expect(normalizeName("oke alya")).toBe("Alya");
    expect(normalizeName("ok farhan")).toBe("Farhan");
  });

  it("strips introductory prefixes (nama saya, namaku, panggil aja aku, aku, saya, gue, gw, adalah, itu)", () => {
    expect(normalizeName("nama saya Rani")).toBe("Rani");
    expect(normalizeName("nama aku rani putri")).toBe("Rani Putri");
    expect(normalizeName("nama ku ahmad")).toBe("Ahmad");
    expect(normalizeName("namaku rani putri")).toBe("Rani Putri");
    expect(normalizeName("panggil aja aku dina")).toBe("Dina");
    expect(normalizeName("panggil saja saya rizky")).toBe("Rizky");
    expect(normalizeName("panggil aku nadia")).toBe("Nadia");
    expect(normalizeName("aku salsa")).toBe("Salsa");
    expect(normalizeName("saya bagas")).toBe("Bagas");
    expect(normalizeName("gue dimas")).toBe("Dimas");
    expect(normalizeName("gw tiwi")).toBe("Tiwi");
    expect(normalizeName("nama saya adalah zahra")).toBe("Zahra");
    expect(normalizeName("halo namaku itu citra")).toBe("Citra");
  });

  it("capitalizes every word and caps at NAME_MAX_WORDS (3)", () => {
    const out = normalizeName("muhammad rizky pratama saputra");
    expect(out).toBe("Muhammad Rizky Pratama");
    expect(out.split(" ").length).toBe(NAME_MAX_WORDS);
  });

  it("caps length at NAME_MAX_CHARS (24)", () => {
    const out = normalizeName("alexander christopher bartholomew");
    expect(out.length).toBeLessThanOrEqual(NAME_MAX_CHARS);
    expect(out).toBe("Alexander Christopher Ba");
  });

  it("preserves apostrophes, hyphens, and Latin-extended letters while stripping symbols and digits", () => {
    expect(normalizeName("ma'ruf al-farizi")).toBe("Ma'ruf Al-farizi");
    expect(normalizeName("  rani123!! @#$ putri?? ")).toBe("Rani Putri");
    expect(normalizeName("élodie rené")).toBe("Élodie René");
  });

  it("returns empty string for empty, nullish, or symbol-only input", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   ")).toBe("");
    expect(normalizeName("12345 !@#")).toBe("");
    expect(normalizeName(null)).toBe("");
    expect(normalizeName(undefined)).toBe("");
  });
});

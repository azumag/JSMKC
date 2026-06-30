/**
 * countries.ts — ISO data + lookup helpers.
 *
 * The DB stores `country` as free text and historically held full English names
 * (e.g. "Norway"); the new picker stores ISO alpha-2 codes. resolveCountryCode
 * must map BOTH shapes (and the Japanese name) to a code so a flag can render,
 * and return undefined for anything unknown so the UI shows no flag.
 */
import {
  COUNTRIES,
  getCountry,
  getCountryName,
  resolveCountryCode,
} from "@/lib/countries";

describe("countries data", () => {
  it("has a non-trivial, unique, well-formed code set", () => {
    expect(COUNTRIES.length).toBeGreaterThan(200);
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length); // unique
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.en.length).toBeGreaterThan(0);
      expect(c.ja.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveCountryCode", () => {
  it("accepts an ISO code in any case", () => {
    expect(resolveCountryCode("NO")).toBe("NO");
    expect(resolveCountryCode("no")).toBe("NO");
    expect(resolveCountryCode("  jp ")).toBe("JP");
  });

  it("accepts a legacy full English name", () => {
    expect(resolveCountryCode("Norway")).toBe("NO");
    expect(resolveCountryCode("japan")).toBe("JP");
  });

  it("accepts a Japanese name", () => {
    expect(resolveCountryCode("日本")).toBe("JP");
  });

  it("returns undefined for empty/unknown input", () => {
    expect(resolveCountryCode(null)).toBeUndefined();
    expect(resolveCountryCode("")).toBeUndefined();
    expect(resolveCountryCode("   ")).toBeUndefined();
    expect(resolveCountryCode("Nowhereland")).toBeUndefined();
  });
});

describe("getCountry / getCountryName", () => {
  it("looks up by code case-insensitively", () => {
    expect(getCountry("jp")?.en).toBe("Japan");
    expect(getCountry("JP")?.ja).toBe("日本");
    expect(getCountry("zz")).toBeUndefined();
    expect(getCountry(null)).toBeUndefined();
  });

  it("returns the localized name, falling back to English", () => {
    expect(getCountryName("JP", "ja")).toBe("日本");
    expect(getCountryName("JP", "en")).toBe("Japan");
    expect(getCountryName("JP", "ja-JP")).toBe("日本");
    expect(getCountryName("ZZ", "en")).toBeUndefined();
  });
});

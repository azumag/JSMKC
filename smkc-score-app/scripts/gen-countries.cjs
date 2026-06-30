const countries = require("i18n-iso-countries");
countries.registerLocale(require("i18n-iso-countries/langs/en.json"));
countries.registerLocale(require("i18n-iso-countries/langs/ja.json"));
const { hasFlag } = require("country-flag-icons");
const en = countries.getNames("en");
const ja = countries.getNames("ja");
const rows = [];
for (const code of Object.keys(en)) {
  if (code.length !== 2) continue;
  if (!hasFlag(code)) continue; // only codes that have an SVG flag
  const enName = Array.isArray(en[code]) ? en[code][0] : en[code];
  const jaName = (Array.isArray(ja[code]) ? ja[code][0] : ja[code]) || enName;
  rows.push({ code, en: enName, ja: jaName });
}
rows.sort((a, b) => a.en.localeCompare(b.en));
console.log("country count:", rows.length);
const data = rows.map(r => `  { code: "${r.code}", en: ${JSON.stringify(r.en)}, ja: ${JSON.stringify(r.ja)} },`).join("\n");
const file = `/**
 * ISO 3166-1 alpha-2 country list with English + Japanese names.
 *
 * GENERATED — do not edit the COUNTRIES array by hand. Regenerate with
 * \`node scripts/gen-countries.cjs\` (uses i18n-iso-countries + country-flag-icons).
 * Only codes that have an SVG flag in country-flag-icons are included, so every
 * entry is guaranteed renderable by <CountryFlag/>.
 */

export interface Country {
  /** ISO 3166-1 alpha-2 code, uppercase (e.g. "JP"). */
  code: string;
  /** English country name. */
  en: string;
  /** Japanese country name. */
  ja: string;
}

export const COUNTRIES: readonly Country[] = [
${data}
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
// Lowercased English/Japanese name -> code, so legacy free-text country values
// (the DB historically stored full names like "Norway") still resolve to a flag.
const BY_NAME = new Map<string, string>();
for (const c of COUNTRIES) {
  BY_NAME.set(c.en.toLowerCase(), c.code);
  BY_NAME.set(c.ja.toLowerCase(), c.code);
}

/** Look up a country by its ISO alpha-2 code (case-insensitive). */
export function getCountry(code: string | null | undefined): Country | undefined {
  if (!code) return undefined;
  return BY_CODE.get(code.trim().toUpperCase());
}

/**
 * Resolve an arbitrary stored country value to its ISO alpha-2 code. Accepts an
 * ISO code ("NO", "no") or a full English/Japanese name ("Norway", "ノルウェー"),
 * so both the new picker values and historical free-text values map to a flag.
 * Returns undefined when nothing matches (caller renders no flag).
 */
export function resolveCountryCode(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (!v) return undefined;
  const upper = v.toUpperCase();
  if (BY_CODE.has(upper)) return upper;
  return BY_NAME.get(v.toLowerCase());
}

/** Localized country name for a code, falling back to English then the code. */
export function getCountryName(
  code: string | null | undefined,
  locale: string,
): string | undefined {
  const c = getCountry(code);
  if (!c) return undefined;
  return locale.startsWith("ja") ? c.ja : c.en;
}
`;
const fs = require("fs");
fs.writeFileSync("src/lib/countries.ts", file);
console.log("wrote src/lib/countries.ts");

// Copy each renderable flag SVG into public/flags/<code>.svg (lowercase) so
// <CountryFlag> can serve them as static, lazily-loaded, individually-cached
// <img> assets instead of bundling all ~265 flags into every client page.
const flagsDir = "public/flags";
fs.mkdirSync(flagsDir, { recursive: true });
// The package's exports map hides the raw .svg files, so resolve the package
// root via its package.json and read the 3x2/<CODE>.svg files off disk.
const pkgRoot = require("path").dirname(
  require.resolve("country-flag-icons/package.json"),
);
let copied = 0;
for (const r of rows) {
  const src = `${pkgRoot}/3x2/${r.code}.svg`;
  fs.copyFileSync(src, `${flagsDir}/${r.code.toLowerCase()}.svg`);
  copied++;
}
console.log(`copied ${copied} flag SVGs to ${flagsDir}/`);

/**
 * CountryFlag — a small SVG country flag rendered next to a player name.
 *
 * Renders a static, lazily-loaded <img> from /flags/<code>.svg (the SVGs are
 * copied into public/flags by scripts/gen-countries.cjs). This serves only the
 * handful of flags actually shown — each individually browser-cached — instead
 * of bundling all ~265 country-flag-icons SVGs into every client page. We use an
 * image, NOT a flag emoji: flag emoji do not render on Windows, the primary
 * admin platform here.
 *
 * The `country` prop is the value stored on Player.country — either a new ISO
 * 3166-1 alpha-2 code (from the country picker) or a legacy free-text name
 * ("Norway"), both of which resolveCountryCode() maps to a code. Renders nothing
 * when the country is empty or unrecognized, so it is always safe to drop in
 * beside any name.
 */
import { cn } from "@/lib/utils";
import { resolveCountryCode, getCountryName } from "@/lib/countries";

export interface CountryFlagProps {
  /** Stored country value: ISO alpha-2 code or a legacy full country name. */
  country: string | null | undefined;
  /** Locale used for the accessible name / hover tooltip (e.g. "ja", "en"). */
  locale?: string;
  /** Extra classes; overrides the default inline size when a size is given. */
  className?: string;
}

export function CountryFlag({
  country,
  locale = "en",
  className,
}: CountryFlagProps) {
  const code = resolveCountryCode(country);
  if (!code) return null;
  const name = getCountryName(code, locale) ?? code;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG flag; next/image adds no value and needs a Workers loader
    <img
      src={`/flags/${code.toLowerCase()}.svg`}
      alt={name}
      title={name}
      width={21}
      height={14}
      loading="lazy"
      decoding="async"
      className={cn(
        // Scales with the surrounding text; the ring keeps white-edged flags
        // (e.g. JP) visible on a light background. 3x2 aspect via w-auto.
        "inline-block h-[0.85em] w-auto shrink-0 rounded-[2px] align-[-0.12em] ring-1 ring-black/10",
        className,
      )}
    />
  );
}

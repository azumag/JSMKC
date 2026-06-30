"use client";

/**
 * CountrySelect — type-ahead country picker for the player form.
 *
 * Backed by a native <datalist> so it is searchable, accessible and adds no
 * dependency. The admin types/picks a localized country name; the component
 * resolves it to an ISO 3166-1 alpha-2 code via resolveCountryCode and emits the
 * CODE (so the DB stores "NO", not "Norway"). Editing a player whose country is a
 * legacy free-text name shows that name resolved and, on the next save, migrates
 * it to a code. A live flag preview sits beside the input.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import {
  COUNTRIES,
  getCountryName,
  resolveCountryCode,
} from "@/lib/countries";
import { Input } from "@/components/ui/input";
import { CountryFlag } from "@/components/ui/country-flag";

export interface CountrySelectProps {
  /** Stored country value (ISO code or legacy name); "" / null when unset. */
  value: string | null | undefined;
  /** Emits the resolved ISO code, or the raw text while it does not match. */
  onChange: (next: string) => void;
  locale?: string;
  id?: string;
  placeholder?: string;
  className?: string;
}

export function CountrySelect({
  value,
  onChange,
  locale = "en",
  id,
  placeholder,
  className,
}: CountrySelectProps) {
  const code = resolveCountryCode(value);
  // What the input shows: the localized name of a resolved country, else the
  // raw stored text (lets the admin keep typing a partial entry).
  const display = code ? (getCountryName(code, locale) ?? value ?? "") : value ?? "";

  // Stable datalist id even when no `id` prop is given.
  const reactId = React.useId();
  const listId = `${id ?? reactId}-country-options`;

  const options = React.useMemo(
    () =>
      [...COUNTRIES]
        .map((c) => ({ code: c.code, name: locale.startsWith("ja") ? c.ja : c.en }))
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
    [locale],
  );

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="flex h-9 w-7 shrink-0 items-center justify-center">
        <CountryFlag country={code} locale={locale} className="h-4" />
      </span>
      <Input
        id={id}
        list={listId}
        value={display}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          const text = e.target.value;
          // Emit the ISO code when the text matches a known country (picked from
          // the list or typed in full); otherwise pass the raw text through.
          onChange(resolveCountryCode(text) ?? text);
        }}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.code} value={o.name} />
        ))}
      </datalist>
    </div>
  );
}

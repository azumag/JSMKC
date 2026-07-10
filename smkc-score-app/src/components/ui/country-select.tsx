"use client";

/**
 * CountrySelect — a click-to-open, searchable country pulldown for the player
 * form. A type-ahead <datalist> was hard to discover ("you have to know to
 * type"); this opens a Popover with a search box and a scrollable, flag-decorated
 * list so 250 countries stay manageable. The admin picks a country and the
 * component emits its ISO 3166-1 alpha-2 CODE (so the DB stores "NO", not
 * "Norway"); a legacy free-text value is shown resolved and migrates to a code
 * on the next save. The trigger shows a live flag + the selected name.
 */
import * as React from "react";
import { Popover } from "radix-ui";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  COUNTRIES,
  getCountryName,
  resolveCountryCode,
} from "@/lib/countries";
import { CountryFlag } from "@/components/ui/country-flag";

export interface CountrySelectProps {
  /** Stored country value (ISO code or legacy name); "" / null when unset. */
  value: string | null | undefined;
  /** Emits the chosen ISO code, or "" when cleared. */
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
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const listboxId = `${React.useId()}-country-listbox`;
  const listRef = React.useRef<HTMLUListElement>(null);

  // Drive the list scroll from the wheel explicitly. Inside a portaled Popover
  // the mouse wheel sometimes does not reach this inner scroll container (it
  // scrolls the page, or nothing), so we scroll it ourselves and only let the
  // event through at the top/bottom edges. A non-passive listener is required to
  // call preventDefault, so we attach it imperatively rather than via onWheel.
  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) return;
      e.preventDefault();
      el.scrollTop += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open]);

  const code = resolveCountryCode(value);
  const selectedName = code ? getCountryName(code, locale) : value || "";

  const options = React.useMemo(
    () =>
      [...COUNTRIES]
        .map((c) => ({ code: c.code, name: locale.startsWith("ja") ? c.ja : c.en }))
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
    [locale],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.name.toLowerCase().includes(q) || o.code.toLowerCase().startsWith(q),
    );
  }, [options, query]);

  const activeOption = activeIndex >= 0 ? filtered[activeIndex] : undefined;
  const activeOptionId = activeOption
    ? `${listboxId}-option-${activeOption.code}`
    : undefined;

  React.useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(filtered.length - 1);
  }, [activeIndex, filtered.length]);

  React.useEffect(() => {
    if (!activeOptionId) return;
    document.getElementById(activeOptionId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeOptionId]);

  const select = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (filtered.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => current < 0 ? 0 : (current + 1) % filtered.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => current < 0 ? filtered.length - 1 : (current - 1 + filtered.length) % filtered.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(filtered.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeOption) select(activeOption.code);
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setActiveIndex(-1);
        if (!o) setQuery("");
      }}
    >
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          role={open ? undefined : "combobox"}
          aria-expanded={open}
          aria-controls={listboxId}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-sm border border-foreground/25 bg-transparent px-3 py-1 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:text-sm",
            className,
          )}
        >
          <CountryFlag country={code} locale={locale} />
          <span className={cn("flex-1 truncate text-left", !selectedName && "text-muted-foreground")}>
            {selectedName || placeholder || ""}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-56 rounded-sm border border-foreground/25 bg-popover p-0 text-popover-foreground shadow-md outline-none"
        >
          <div className="flex items-center gap-2 border-b border-foreground/15 px-3">
            <Search className="size-4 shrink-0 opacity-50" />
            <input
              autoFocus
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(-1);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={placeholder || "Search…"}
              aria-label="Search countries"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="max-h-60 overflow-y-auto overscroll-contain py-1"
          >
            {/* Clear option to unset the country. */}
            <li>
              <button
                type="button"
                onClick={() => select("")}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
              >
                <X className="size-4 shrink-0 opacity-60" />
                <span className="flex-1">—</span>
                {!code && <Check className="size-4 shrink-0" />}
              </button>
            </li>
            {filtered.map((o, index) => (
              <li key={o.code}>
                <button
                  id={`${listboxId}-option-${o.code}`}
                  type="button"
                  role="option"
                  aria-selected={o.code === code}
                  tabIndex={-1}
                  onClick={() => select(o.code)}
                  onMouseMove={() => setActiveIndex(index)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent",
                    activeIndex === index && "bg-accent",
                  )}
                >
                  <CountryFlag country={o.code} locale={locale} />
                  <span className="flex-1 truncate">{o.name}</span>
                  {o.code === code && <Check className="size-4 shrink-0" />}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                No match
              </li>
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

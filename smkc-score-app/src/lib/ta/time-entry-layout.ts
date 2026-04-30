export const TA_TIME_ENTRY_CUP_GRID_CLASS = "grid grid-cols-1 gap-4 md:grid-cols-2";

export const TA_TIME_INPUT_BASE_PROPS = {
  inputMode: "decimal",
  pattern: "[0-9:.]*",
  autoComplete: "off",
} as const;

export function getTaTimeInputProps(title: string) {
  return {
    ...TA_TIME_INPUT_BASE_PROPS,
    title,
  } as const;
}

export const TA_TIME_INPUT_HELP_CLASS = "text-xs leading-relaxed text-muted-foreground";

export const TA_FINALS_ROUND_ENTRY_ROW_CLASS =
  "rounded-md border bg-background/60 p-3 space-y-2 sm:flex sm:items-center sm:gap-2 sm:space-y-0 sm:border-0 sm:bg-transparent sm:p-0";

export const TA_FINALS_ROUND_PLAYER_LABEL_CLASS = "min-w-0 sm:flex-1";

export const TA_FINALS_ROUND_PLAYER_NAME_CLASS = "block truncate text-base sm:text-sm";

export const TA_FINALS_ROUND_CONTROLS_CLASS =
  "grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:shrink-0";

export const TA_FINALS_TIME_INPUT_CLASS = "font-mono text-sm w-full sm:w-32";

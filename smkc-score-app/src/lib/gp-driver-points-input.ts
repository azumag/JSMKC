import { MAX_GP_DRIVER_POINTS } from "@/lib/constants";

export const GP_DRIVER_POINTS_INPUT_PROPS = {
  type: "text",
  inputMode: "numeric",
  pattern: "[0-9]*",
  autoComplete: "off",
} as const;

export function parseGpDriverPointsInput(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) return null;
  return value <= MAX_GP_DRIVER_POINTS ? value : null;
}

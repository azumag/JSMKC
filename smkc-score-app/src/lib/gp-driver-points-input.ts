import { MAX_GP_DRIVER_POINTS } from "@/lib/constants";
import { parseManualScore } from "@/lib/parse-manual-score";

export const GP_DRIVER_POINTS_INPUT_PROPS = {
  type: "text",
  inputMode: "numeric",
  pattern: "[0-9]*",
  autoComplete: "off",
} as const;

export function parseGpDriverPointsInput(input: string): number | null {
  const value = parseManualScore(input);
  if (value === null) return null;
  return value <= MAX_GP_DRIVER_POINTS ? value : null;
}

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

/**
 * Validate one side of the participant self-report driver-points form.
 *
 * Unlike parseGpDriverPointsInput (admin/referee manual overrides, which
 * must reject blank input so a mis-typed value never silently decides a
 * match outcome), a blank field here is a legitimate way to report a
 * genuine 0 — the placeholder="0" shown in an empty input is visual only
 * and never becomes part of the field's actual value, so treating blank
 * as invalid left players unable to submit without guessing that they had
 * to type "0" by hand.
 */
function isValidGpParticipantPointsValue(value: string): boolean {
  if (value === "") return true;
  return parseGpDriverPointsInput(value) !== null;
}

/**
 * At least one side must be explicitly filled in before the report can be
 * submitted, so an untouched pair of blank inputs can't be submitted as an
 * accidental 0-0 result. Once that's true, a blank counterpart is read as
 * an implicit 0.
 */
export function canSubmitGpParticipantPoints(points1: string, points2: string): boolean {
  return (
    (points1 !== "" || points2 !== "") &&
    isValidGpParticipantPointsValue(points1) &&
    isValidGpParticipantPointsValue(points2)
  );
}

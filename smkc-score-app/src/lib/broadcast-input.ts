export function isBroadcastIntegerInputValid(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return true;

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0;
}

export function invalidBroadcastIntegerInputLabels(
  fields: Array<{ label: string; value: string }>,
): string[] {
  return fields
    .filter(({ value }) => !isBroadcastIntegerInputValid(value))
    .map(({ label }) => label);
}

export function nullableBroadcastIntegerInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const parsed = Number(trimmed);
  if (!isBroadcastIntegerInputValid(trimmed)) return null;

  return parsed;
}

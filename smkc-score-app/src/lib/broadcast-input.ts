const broadcastIntegerInputPattern = /^\+?\d+$/;

export function isBroadcastIntegerInputValid(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return true;
  if (!broadcastIntegerInputPattern.test(trimmed)) return false;

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= 0;
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
  if (trimmed === '') return null;
  if (!isBroadcastIntegerInputValid(trimmed)) return null;

  return Number(trimmed);
}

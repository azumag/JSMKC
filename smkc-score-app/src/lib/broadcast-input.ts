export function nullableBroadcastIntegerInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;

  return Math.max(0, Math.trunc(parsed));
}

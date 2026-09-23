export function isCanonicalTaPlayerId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value === value.trim();
}

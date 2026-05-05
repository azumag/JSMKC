export function isRemovableCupForm(index: number, lockedCount = 1): boolean {
  return index >= Math.max(1, lockedCount);
}

export function removeCupFormAt<T>(forms: readonly T[], index: number, lockedCount = 1): T[] {
  if (!isRemovableCupForm(index, lockedCount) || index >= forms.length) {
    return [...forms];
  }
  return forms.filter((_, currentIndex) => currentIndex !== index);
}

export function getCupForFormIndex(
  index: number,
  assignedCups: readonly string[] | undefined,
  fallbackCups: readonly string[],
  preferredFirstCup?: string,
): string {
  const assigned = assignedCups?.[index];
  if (assigned) return assigned;
  if (index === 0 && preferredFirstCup) return preferredFirstCup;

  const usedAssigned = new Set((assignedCups ?? []).filter(Boolean));
  const candidate = fallbackCups.find((cup) => !usedAssigned.has(cup));
  return candidate ?? fallbackCups[index % fallbackCups.length] ?? preferredFirstCup ?? "";
}

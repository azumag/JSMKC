export function isRemovableCupForm(index: number): boolean {
  return index > 0;
}

export function removeCupFormAt<T>(forms: readonly T[], index: number): T[] {
  if (!isRemovableCupForm(index) || index >= forms.length) {
    return [...forms];
  }
  return forms.filter((_, currentIndex) => currentIndex !== index);
}

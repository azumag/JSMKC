/**
 * Tests for GP-specific configuration logic.
 *
 * Covers:
 * - isValidCupChoice: §7.4 pre-assigned cup validation + §7.1 substitution rules
 */

import { isValidCupChoice } from '@/lib/event-types/gp-config';

describe('isValidCupChoice', () => {
  // §7.4: Exact match is always valid
  it.each([
    ['Mushroom', 'Mushroom'],
    ['Flower', 'Flower'],
    ['Star', 'Star'],
    ['Special', 'Special'],
  ])('should accept exact match: assigned=%s, submitted=%s', (assigned, submitted) => {
    expect(isValidCupChoice(assigned, submitted)).toBe(true);
  });

  // §7.1: Allowed substitutions (harder → easier)
  it('should accept Star → Mushroom substitution (§7.1)', () => {
    expect(isValidCupChoice('Star', 'Mushroom')).toBe(true);
  });

  it('should accept Special → Flower substitution (§7.1)', () => {
    expect(isValidCupChoice('Special', 'Flower')).toBe(true);
  });

  // §7.1: Reverse direction is NOT allowed (easier → harder)
  it('should reject Mushroom → Star (reverse not allowed)', () => {
    expect(isValidCupChoice('Mushroom', 'Star')).toBe(false);
  });

  it('should reject Flower → Special (reverse not allowed)', () => {
    expect(isValidCupChoice('Flower', 'Special')).toBe(false);
  });

  // Invalid substitutions between unrelated cups
  it.each([
    ['Mushroom', 'Flower'],
    ['Mushroom', 'Special'],
    ['Flower', 'Star'],
    ['Flower', 'Mushroom'],
    ['Star', 'Flower'],
    ['Star', 'Special'],
    ['Special', 'Mushroom'],
    ['Special', 'Star'],
  ])('should reject unrelated substitution: %s → %s', (assigned, submitted) => {
    expect(isValidCupChoice(assigned, submitted)).toBe(false);
  });

  // No pre-assigned cup: any cup is accepted
  it('should accept any cup when assignedCup is null', () => {
    expect(isValidCupChoice(null, 'Star')).toBe(true);
  });

  it('should accept any cup when assignedCup is undefined', () => {
    expect(isValidCupChoice(undefined, 'Flower')).toBe(true);
  });

  it('should accept any cup when assignedCup is empty string', () => {
    expect(isValidCupChoice('', 'Special')).toBe(true);
  });

  // Edge cases: empty/wrong-case submitted cup
  it('should reject empty submitted cup', () => {
    expect(isValidCupChoice('Star', '')).toBe(false);
  });

  it('should reject wrong case (case-sensitive comparison)', () => {
    expect(isValidCupChoice('Star', 'star')).toBe(false);
    expect(isValidCupChoice('Star', 'mushroom')).toBe(false);
  });
});

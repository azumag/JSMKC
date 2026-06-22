/**
 * Unit tests for CDM time encoding utilities (TC-2544–TC-2553).
 *
 * msToCdmTime: encodes milliseconds as MSSCC integer (M*10000 + SS*100 + CC).
 * timeStringToCdmTime: parses a time string via timeToMs then delegates to msToCdmTime,
 *   returning null for missing or unparsable input so callers clear the cell instead of
 *   writing a bogus 0 (which would rank as the fastest time in the CDM template).
 */

import { msToCdmTime, timeStringToCdmTime } from '@/lib/cdm-export/time-format';

describe('msToCdmTime', () => {
  it('TC-2544: encodes 70340ms (1:10.34) as MSSCC 11034', () => {
    // 70340ms → 7034cs → minutes=1, rest=1034 → 1*10000+1034 = 11034
    expect(msToCdmTime(70340)).toBe(11034);
  });

  it('TC-2545: encodes 59790ms (0:59.79) as MSSCC 5979', () => {
    // minutes=0, rest=5979 → 5979
    expect(msToCdmTime(59790)).toBe(5979);
  });

  it('TC-2546: encodes 0ms as 0', () => {
    expect(msToCdmTime(0)).toBe(0);
  });

  it('TC-2547: rounds half-up from ms to cs (155ms → 16)', () => {
    // 155ms / 10 = 15.5cs → Math.round → 16cs
    expect(msToCdmTime(155)).toBe(16);
  });

  it('TC-2548: throws for negative duration', () => {
    expect(() => msToCdmTime(-1)).toThrow();
  });

  it('TC-2549: throws for NaN, +Infinity, and -Infinity', () => {
    expect(() => msToCdmTime(NaN)).toThrow();
    expect(() => msToCdmTime(Infinity)).toThrow();
    expect(() => msToCdmTime(-Infinity)).toThrow();
  });

  it('TC-2554: rounds 59995ms up to 6000cs (MSSCC 10000 = 1:00.00)', () => {
    // 59995ms / 10 = 5999.5cs → Math.round → 6000cs → minutes=1, rest=0 → 10000
    expect(msToCdmTime(59995)).toBe(10000);
  });
});

describe('timeStringToCdmTime', () => {
  it('TC-2550: encodes "1:10.34" as MSSCC 11034', () => {
    expect(timeStringToCdmTime('1:10.34')).toBe(11034);
  });

  it('TC-2551: returns null for non-string input', () => {
    expect(timeStringToCdmTime(123)).toBeNull();
    expect(timeStringToCdmTime(null)).toBeNull();
    expect(timeStringToCdmTime(undefined)).toBeNull();
  });

  it('TC-2552: returns null for empty and whitespace-only strings', () => {
    expect(timeStringToCdmTime('')).toBeNull();
    expect(timeStringToCdmTime('   ')).toBeNull();
  });

  it('TC-2553: returns null for unparsable strings', () => {
    expect(timeStringToCdmTime('not-a-time')).toBeNull();
    expect(timeStringToCdmTime('abc')).toBeNull();
  });
});

import { msToDisplayTime } from '@/lib/ta/time-utils';

describe('msToDisplayTime invalid persisted/display values', () => {
  it('fails closed for non-finite millisecond values', () => {
    expect(msToDisplayTime(Number.NaN)).toBe('-');
    expect(msToDisplayTime(Number.POSITIVE_INFINITY)).toBe('-');
    expect(msToDisplayTime(Number.NEGATIVE_INFINITY)).toBe('-');
  });

  it('fails closed for negative millisecond values', () => {
    expect(msToDisplayTime(-1)).toBe('-');
    expect(msToDisplayTime(-10_000)).toBe('-');
  });

  it('preserves zero and positive finite display formatting', () => {
    expect(msToDisplayTime(0)).toBe('0:00.00');
    expect(msToDisplayTime(60_005)).toBe('1:00.01');
    expect(msToDisplayTime(83_456)).toBe('1:23.46');
  });
});

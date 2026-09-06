import { isTemporaryExceptionExpired } from '../../scripts/security-audit.js';

describe('temporary security audit exception review deadline', () => {
  it('keeps the reviewed exception active before the deadline', () => {
    expect(isTemporaryExceptionExpired(new Date('2026-10-05T23:59:59.999Z'))).toBe(false);
  });

  it('fails closed at the review deadline', () => {
    expect(isTemporaryExceptionExpired(new Date('2026-10-06T00:00:00.000Z'))).toBe(true);
  });

  it('fails closed after the review deadline', () => {
    expect(isTemporaryExceptionExpired(new Date('2026-10-06T00:00:00.001Z'))).toBe(true);
  });

  it('fails closed for an invalid clock value', () => {
    expect(isTemporaryExceptionExpired(new Date(Number.NaN))).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'fails closed when the parsed review deadline is invalid: %p',
    (deadlineMs) => {
      expect(isTemporaryExceptionExpired(new Date('2026-09-06T00:00:00.000Z'), deadlineMs)).toBe(true);
    },
  );
});

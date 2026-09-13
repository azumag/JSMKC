import { getTemporaryExceptionReviewDeadline, isTemporaryExceptionExpired } from '../../scripts/security-audit.js';

describe('temporary security audit exception review deadline', () => {
  const reviewDeadline = getTemporaryExceptionReviewDeadline();
  const reviewDeadlineMs = Date.parse(reviewDeadline);

  it('exposes a valid runtime review deadline', () => {
    expect(Number.isFinite(reviewDeadlineMs)).toBe(true);
    expect(new Date(reviewDeadlineMs).toISOString()).toBe(reviewDeadline);
  });

  it('keeps the reviewed exception active immediately before the deadline', () => {
    expect(isTemporaryExceptionExpired(new Date(reviewDeadlineMs - 1))).toBe(false);
  });

  it('fails closed at the review deadline', () => {
    expect(isTemporaryExceptionExpired(new Date(reviewDeadlineMs))).toBe(true);
  });

  it('fails closed immediately after the review deadline', () => {
    expect(isTemporaryExceptionExpired(new Date(reviewDeadlineMs + 1))).toBe(true);
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

/**
 * Tests for fetchWithRetry.
 *
 * Covers:
 * - Returns immediately on 2xx success
 * - Returns immediately on 4xx client error (no retry)
 * - Retries on 500+ and returns last response after exhausting retries
 * - Retries on network error and re-throws on last attempt
 *
 * We spy on setTimeout to resolve instantly, avoiding real 500ms delays.
 */

import { fetchWithRetry } from '@/lib/fetch-with-retry';

function makeResponse(status: number, ok?: boolean): Response {
  return {
    status,
    ok: ok ?? (status >= 200 && status < 300),
  } as Response;
}

describe('fetchWithRetry', () => {
  let fetchSpy: jest.SpyInstance;
  let setTimeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    // Make setTimeout call callback synchronously to avoid real delays
    setTimeoutSpy = jest
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation((fn: TimerHandler) => {
        if (typeof fn === 'function') fn();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 200 response immediately without retrying', async () => {
    fetchSpy.mockResolvedValue(makeResponse(200));

    const res = await fetchWithRetry('/api/test');

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns 4xx response immediately without retrying', async () => {
    fetchSpy.mockResolvedValue(makeResponse(404, false));

    const res = await fetchWithRetry('/api/test');

    expect(res.status).toBe(404);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 and returns last 500 after MAX_RETRIES attempts', async () => {
    // MAX_RETRIES = 2 in fetch-with-retry.ts
    fetchSpy.mockResolvedValue(makeResponse(500, false));

    const res = await fetchWithRetry('/api/test');

    expect(res.status).toBe(500);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // 2 attempts total
  });

  it('returns success if second attempt succeeds after 500', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(500, false))
      .mockResolvedValueOnce(makeResponse(200));

    const res = await fetchWithRetry('/api/test');

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('passes init options to every fetch call', async () => {
    fetchSpy.mockResolvedValue(makeResponse(200));

    const init = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
    await fetchWithRetry('/api/test', init);

    expect(fetchSpy).toHaveBeenCalledWith('/api/test', init);
  });

  it('re-throws network error after exhausting retries', async () => {
    fetchSpy.mockRejectedValue(new Error('Network failure'));

    await expect(fetchWithRetry('/api/test')).rejects.toThrow('Network failure');
    expect(fetchSpy).toHaveBeenCalledTimes(2); // 2 attempts
  });

  it('succeeds if second attempt resolves after network error', async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(makeResponse(200));

    const res = await fetchWithRetry('/api/test');

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not delay after the final failed attempt', async () => {
    fetchSpy.mockResolvedValue(makeResponse(500, false));

    await fetchWithRetry('/api/test');

    // setTimeout called once: only between attempt 0 and attempt 1 (not after last)
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
  });
});

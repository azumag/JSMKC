/**
 * Tests for createPlayerWithRetry (extracted from players/page.tsx handleSubmit).
 *
 * Regression coverage for the "duplicate nickname 409 fails silently" bug:
 * a 409 on the FIRST POST attempt is a genuine duplicate-nickname collision
 * and must be reported as an error. A 409 on a RETRY attempt (attempt > 0)
 * is a "recovered success" — an earlier attempt's POST actually created the
 * player before a Workers cold-start crash destroyed its response — and
 * must still be reported as success so that regression does not return.
 *
 * We spy on setTimeout to resolve instantly, avoiding the real 800ms
 * inter-retry delay (same technique as __tests__/lib/fetch-with-retry.test.ts).
 */

import { createPlayerWithRetry, type CreatePlayerFormData } from '@/lib/create-player-retry';

const FORM: CreatePlayerFormData = {
  name: 'Duplicate Player',
  nickname: 'dup_nick',
  country: '',
  noCamera: false,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('createPlayerWithRetry', () => {
  let fetchSpy: jest.SpyInstance;
  let setTimeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
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

  it('reports a 409 on the FIRST attempt as a genuine duplicate-nickname error (not success)', async () => {
    // This is the bug under test: a real duplicate collision must surface as
    // an error, not be silently swallowed as a "recovered success".
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(409, { success: false, error: 'A player with this nickname already exists' }),
    );

    const result = await createPlayerWithRetry(FORM);

    expect(result).toEqual({ ok: false, error: 'A player with this nickname already exists' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // A genuine 409 is a client error — must not trigger the retry delay.
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it('treats a 409 returned on a RETRY attempt as a recovered success (Workers 1101 crash)', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(500, { success: false, error: 'worker crashed' }))
      .mockResolvedValueOnce(
        jsonResponse(409, { success: false, error: 'A player with this nickname already exists' }),
      );

    const result = await createPlayerWithRetry(FORM);

    expect(result).toEqual({ ok: true, recovered: true, data: {} });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Triangulation with the first-attempt-409 case above: the transient 500
    // must schedule exactly one 800ms retry delay before the recovering 409,
    // whereas a genuine duplicate 409 never schedules a delay at all.
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 800);
  });

  it('returns the created player and temporary password on a normal 201 success', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(201, {
        success: true,
        data: { player: { id: 'p1', nickname: 'dup_nick' }, temporaryPassword: 'generated-pw' },
      }),
    );

    const result = await createPlayerWithRetry(FORM);

    expect(result).toEqual({
      ok: true,
      recovered: false,
      data: { player: { id: 'p1', nickname: 'dup_nick' }, temporaryPassword: 'generated-pw' },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 and eventually succeeds on the second attempt', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(500, { success: false, error: 'worker crashed' }))
      .mockResolvedValueOnce(
        jsonResponse(201, { success: true, data: { player: { id: 'p2' }, temporaryPassword: 'pw2' } }),
      );

    const result = await createPlayerWithRetry(FORM);

    expect(result).toEqual({
      ok: true,
      recovered: false,
      data: { player: { id: 'p2' }, temporaryPassword: 'pw2' },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns a failure after exhausting all retries on repeated 500s', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(500, { success: false, error: 'still crashed' }));

    const result = await createPlayerWithRetry(FORM);

    expect(result).toEqual({ ok: false, error: 'still crashed' });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('falls back to a null error message when the failure body is not JSON', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('worker crashed (non-JSON)', { status: 400 }));

    const result = await createPlayerWithRetry(FORM);

    expect(result).toEqual({ ok: false, error: null });
  });
});

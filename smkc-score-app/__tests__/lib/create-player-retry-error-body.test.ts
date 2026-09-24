import { createPlayerWithRetry, type CreatePlayerFormData } from '@/lib/create-player-retry';

const FORM: CreatePlayerFormData = {
  name: 'Stream Failure Player',
  nickname: 'stream_failure',
  country: '',
  noCamera: false,
};

describe('createPlayerWithRetry unreadable error bodies', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fails closed when a non-2xx response body stream cannot be read', async () => {
    const text = jest.fn().mockRejectedValue(new TypeError('response body stream reset'));
    const unreadableResponse = {
      ok: false,
      status: 400,
      text,
    } as unknown as Response;
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(unreadableResponse);

    await expect(createPlayerWithRetry(FORM)).resolves.toEqual({ ok: false, error: null, code: null });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(text).toHaveBeenCalledTimes(1);
  });
});

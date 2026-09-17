import { fetchWithRetry } from '@/lib/fetch-with-retry';

function makeFetchResponse(): Response {
  const body = new Uint8Array([123, 125]).buffer;
  return {
    status: 200,
    statusText: 'OK',
    ok: true,
    headers: new Headers({ 'content-type': 'application/json' }),
    arrayBuffer: jest.fn(async () => body),
  } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe('fetchWithRetry browser GET dedupe', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: new URL('http://localhost/') },
      writable: true,
    });
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    jest.spyOn(globalThis, 'setTimeout').mockImplementation((fn: TimerHandler) => {
      if (typeof fn === 'function') fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  });

  it('dedupes concurrent plain same-origin API GETs', async () => {
    const pending = deferred<Response>();
    fetchSpy.mockReturnValue(pending.promise);

    const first = fetchWithRetry('/api/plain-dedupe');
    const second = fetchWithRetry('/api/plain-dedupe');

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    pending.resolve(makeFetchResponse());
    const [firstResponse, secondResponse] = await Promise.all([first, second]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstResponse).not.toBe(secondResponse);
  });

  it('cleans a rejected in-flight GET so a later request starts a fresh fetch', async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error('first network failure'))
      .mockRejectedValueOnce(new Error('second network failure'))
      .mockResolvedValueOnce(makeFetchResponse());

    await expect(fetchWithRetry('/api/rejected-dedupe')).rejects.toThrow('second network failure');

    const recovered = await fetchWithRetry('/api/rejected-dedupe');

    expect(recovered.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('does not dedupe GETs that carry caller-specific AbortSignals', async () => {
    fetchSpy.mockImplementation(async () => makeFetchResponse());
    const firstController = new AbortController();
    const secondController = new AbortController();

    await Promise.all([
      fetchWithRetry('/api/signal-specific', { signal: firstController.signal }),
      fetchWithRetry('/api/signal-specific', { signal: secondController.signal }),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenNthCalledWith(1, '/api/signal-specific', { signal: firstController.signal });
    expect(fetchSpy).toHaveBeenNthCalledWith(2, '/api/signal-specific', { signal: secondController.signal });
  });

  it('does not dedupe GETs that carry caller-specific headers', async () => {
    fetchSpy.mockImplementation(async () => makeFetchResponse());

    await Promise.all([
      fetchWithRetry('/api/header-specific', { headers: { 'x-request-scope': 'first' } }),
      fetchWithRetry('/api/header-specific', { headers: { 'x-request-scope': 'second' } }),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not dedupe Request inputs with their own request semantics', async () => {
    fetchSpy.mockImplementation(async () => makeFetchResponse());
    const firstRequest = new Request('http://localhost/api/request-specific');
    const secondRequest = new Request('http://localhost/api/request-specific');

    await Promise.all([fetchWithRetry(firstRequest), fetchWithRetry(secondRequest)]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

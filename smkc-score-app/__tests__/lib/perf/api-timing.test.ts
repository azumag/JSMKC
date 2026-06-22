/**
 * Unit tests for withApiTiming (TC-2526–TC-2528).
 *
 * `PERF_LOG` and `PERF_SLOW_REQUEST_MS` are module-level constants evaluated
 * at import time. The pattern established in vitals/route.test.ts is used:
 *   1. Mock the logger with a shared spy before all tests.
 *   2. Call jest.resetModules() + dynamic import() to reload api-timing with
 *      different env vars.
 *   3. mockInfo.mockClear() resets the spy between tests.
 */

const mockInfo = jest.fn();
const mockRunWithQueryStats = jest.fn();

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: mockInfo,
    debug: jest.fn(),
  })),
}));

jest.mock('@/lib/perf/query-counter', () => ({
  runWithQueryStats: (...args: unknown[]) => mockRunWithQueryStats(...args),
}));

async function loadWithApiTiming(perfLog: string | undefined, perfSlowMs?: string) {
  jest.resetModules();
  mockInfo.mockClear();
  mockRunWithQueryStats.mockClear();

  if (perfLog === undefined) {
    delete process.env.PERF_LOG;
  } else {
    process.env.PERF_LOG = perfLog;
  }
  if (perfSlowMs === undefined) {
    delete process.env.PERF_SLOW_REQUEST_MS;
  } else {
    process.env.PERF_SLOW_REQUEST_MS = perfSlowMs;
  }

  const mod = await import('@/lib/perf/api-timing');
  return mod.withApiTiming;
}

describe('withApiTiming', () => {
  const savedPerfLog = process.env.PERF_LOG;
  const savedPerfSlowMs = process.env.PERF_SLOW_REQUEST_MS;

  afterAll(() => {
    if (savedPerfLog === undefined) delete process.env.PERF_LOG;
    else process.env.PERF_LOG = savedPerfLog;
    if (savedPerfSlowMs === undefined) delete process.env.PERF_SLOW_REQUEST_MS;
    else process.env.PERF_SLOW_REQUEST_MS = savedPerfSlowMs;
    jest.resetModules();
  });

  it('TC-2526: passes through fn result without logging when PERF_LOG is not set', async () => {
    const withApiTiming = await loadWithApiTiming(undefined);
    const mockResponse = new global.Response('ok', { status: 200 });
    const mockFn = jest.fn().mockResolvedValue(mockResponse);

    const result = await withApiTiming('test.route', mockFn);

    expect(result.status).toBe(200);
    expect(mockFn).toHaveBeenCalledTimes(1);
    // In passthrough mode runWithQueryStats is never called and no log is emitted
    expect(mockRunWithQueryStats).not.toHaveBeenCalled();
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it('TC-2527: logs request stats when PERF_LOG=1', async () => {
    const mockResponse = new global.Response('ok', { status: 201 });
    mockRunWithQueryStats.mockResolvedValue({
      result: mockResponse,
      stats: { count: 2, totalDurationMs: 15 },
    });

    const withApiTiming = await loadWithApiTiming('1');
    await withApiTiming('tournaments.bm.GET', jest.fn().mockResolvedValue(mockResponse));

    expect(mockInfo).toHaveBeenCalledWith(
      'request',
      expect.objectContaining({
        route: 'tournaments.bm.GET',
        status: 201,
        api_request_ms: expect.any(Number),
        db_query_count: 2,
        db_total_ms: 15,
      }),
    );
  });

  it('TC-2528: skips log when request completes below PERF_SLOW_REQUEST_MS threshold', async () => {
    const mockResponse = new global.Response('ok', { status: 200 });
    mockRunWithQueryStats.mockResolvedValue({
      result: mockResponse,
      stats: { count: 0, totalDurationMs: 0 },
    });

    // Set an unreachably high threshold so any real request is considered fast
    const withApiTiming = await loadWithApiTiming('1', '999999');
    await withApiTiming('fast.route', jest.fn().mockResolvedValue(mockResponse));

    expect(mockInfo).not.toHaveBeenCalled();
  });
});

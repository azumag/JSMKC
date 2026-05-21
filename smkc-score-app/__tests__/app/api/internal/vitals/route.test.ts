const mockInfo = jest.fn();

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: mockInfo,
    debug: jest.fn(),
  })),
}));

async function loadRoute(perfLog: string | undefined) {
  jest.resetModules();
  mockInfo.mockClear();
  if (perfLog === undefined) {
    delete process.env.PERF_LOG;
  } else {
    process.env.PERF_LOG = perfLog;
  }
  return import('@/app/api/internal/vitals/route');
}

describe('POST /api/internal/vitals', () => {
  const originalPerfLog = process.env.PERF_LOG;

  afterEach(() => {
    if (originalPerfLog === undefined) {
      delete process.env.PERF_LOG;
    } else {
      process.env.PERF_LOG = originalPerfLog;
    }
  });

  it('returns 204 without parsing or logging when PERF_LOG is disabled', async () => {
    const { POST } = await loadRoute(undefined);

    const response = await POST(new Request('http://localhost/api/internal/vitals', {
      method: 'POST',
      body: 'not json',
    }));

    expect(response.status).toBe(204);
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid json when PERF_LOG is enabled', async () => {
    const { POST } = await loadRoute('1');

    const response = await POST(new Request('http://localhost/api/internal/vitals', {
      method: 'POST',
      body: 'not json',
    }));

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe('invalid json');
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it('logs sanitized metric fields and returns 204 when PERF_LOG is enabled', async () => {
    const { POST } = await loadRoute('1');

    const response = await POST(new Request('http://localhost/api/internal/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'metric-1',
        name: 'LCP',
        value: 123.4,
        rating: 'good',
        navigationType: 'reload',
        path: '/tournaments',
        ignored: 'not logged',
      }),
    }));

    expect(response.status).toBe(204);
    expect(mockInfo).toHaveBeenCalledWith('vital', {
      name: 'LCP',
      value: 123.4,
      rating: 'good',
      path: '/tournaments',
      navigationType: 'reload',
    });
  });
});

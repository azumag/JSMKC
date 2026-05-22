describe('E2E runner suite timeout resolution', () => {
  const originalTimeout = process.env.E2E_SUITE_TIMEOUT_MS;

  afterEach(() => {
    if (originalTimeout === undefined) {
      delete process.env.E2E_SUITE_TIMEOUT_MS;
    } else {
      process.env.E2E_SUITE_TIMEOUT_MS = originalTimeout;
    }
    jest.resetModules();
  });

  it('uses a suite-specific timeout when no environment override is set', async () => {
    delete process.env.E2E_SUITE_TIMEOUT_MS;
    const runner = await import('../../e2e/lib/runner.js') as {
      resolveSuiteTimeoutMs: (explicitTimeoutMs?: number | null) => number;
    };

    expect(runner.resolveSuiteTimeoutMs(75 * 60 * 1000)).toBe(75 * 60 * 1000);
  });

  it('keeps E2E_SUITE_TIMEOUT_MS as the highest-priority override', async () => {
    process.env.E2E_SUITE_TIMEOUT_MS = String(42 * 60 * 1000);
    const runner = await import('../../e2e/lib/runner.js') as {
      resolveSuiteTimeoutMs: (explicitTimeoutMs?: number | null) => number;
    };

    expect(runner.resolveSuiteTimeoutMs(75 * 60 * 1000)).toBe(42 * 60 * 1000);
  });
});

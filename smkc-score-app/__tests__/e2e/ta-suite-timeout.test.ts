describe('TC-2078 TA E2E suite timeout contract', () => {
  it('runs the full TA suite with an explicit preview-sized timeout', async () => {
    const taSuite = await import('../../e2e/tc-ta.js') as {
      TA_SUITE_TIMEOUT_MS: number;
      getSuite: () => {
        suiteTimeoutMs?: number;
        tests: Array<{ name: string }>;
      };
    };

    const suite = taSuite.getSuite();

    expect(taSuite.TA_SUITE_TIMEOUT_MS).toBe(75 * 60 * 1000);
    expect(suite.suiteTimeoutMs).toBe(taSuite.TA_SUITE_TIMEOUT_MS);
    expect(suite.suiteTimeoutMs).toBeGreaterThan(35 * 60 * 1000);
    expect(suite.tests.map((test) => test.name)).toContain('TC-1005');
    expect(suite.tests.map((test) => test.name)).toContain('TC-2293');
    expect(suite.tests.map((test) => test.name)).toContain('TC-2400');
    expect(suite.tests.map((test) => test.name)).toContain('TC-3001');
    expect(suite.tests.map((test) => test.name)).toContain('TC-3002');
    expect(suite.tests).toHaveLength(33);
  });
});

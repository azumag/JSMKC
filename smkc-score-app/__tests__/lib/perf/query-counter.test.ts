/**
 * Unit tests for the per-request D1 query counter (TC-2519–TC-2525).
 *
 * TC-2519/2520/2522/2524 use the module as-is (no globalThis.AsyncLocalStorage
 * in the Jest Node environment → noopStorage path, which is still the public API).
 *
 * TC-2521/2523/2525 require real AsyncLocalStorage scoping. They set
 * globalThis.AsyncLocalStorage = require('async_hooks').AsyncLocalStorage
 * and re-load the module via jest.isolateModulesAsync so the constructor is
 * picked up on import.
 */

import { runWithQueryStats, recordQuery, getCurrentStats } from '@/lib/perf/query-counter';

describe('query-counter (noop-storage path)', () => {
  it('TC-2519: runWithQueryStats returns the result of fn', async () => {
    const result = await runWithQueryStats(() => Promise.resolve('expected-value'));

    expect(result.result).toBe('expected-value');
  });

  it('TC-2520: runWithQueryStats starts with count=0 and totalDurationMs=0', async () => {
    const { stats } = await runWithQueryStats(() => Promise.resolve(null));

    expect(stats.count).toBe(0);
    expect(stats.totalDurationMs).toBe(0);
  });

  it('TC-2522: recordQuery outside a scope is a no-op and does not throw', () => {
    // getStore() returns undefined when there is no active scope, so recordQuery
    // must silently skip accumulation rather than throwing.
    expect(() => recordQuery(50)).not.toThrow();
  });

  it('TC-2524: getCurrentStats returns undefined outside a scope', () => {
    expect(getCurrentStats()).toBeUndefined();
  });
});

describe('query-counter (real AsyncLocalStorage path)', () => {
  // Save and restore globalThis.AsyncLocalStorage around these tests so that
  // the noop-storage tests above (and sibling test files) are not affected.
  const originalALS = (globalThis as Record<string, unknown>).AsyncLocalStorage;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (globalThis as Record<string, unknown>).AsyncLocalStorage =
      require('async_hooks').AsyncLocalStorage;
  });

  afterAll(() => {
    if (originalALS === undefined) {
      delete (globalThis as Record<string, unknown>).AsyncLocalStorage;
    } else {
      (globalThis as Record<string, unknown>).AsyncLocalStorage = originalALS;
    }
  });

  // Runs fn inside a fresh isolated module scope with real AsyncLocalStorage already set.
  // jest.isolateModulesAsync returns Promise<void>, so assertions must live inside the callback.
  async function withIsolatedMod(
    fn: (mod: typeof import('@/lib/perf/query-counter')) => Promise<void>,
  ) {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@/lib/perf/query-counter') as typeof import('@/lib/perf/query-counter');
      await fn(mod);
    });
  }

  it('TC-2521: recordQuery inside runWithQueryStats increments count and totalDurationMs', async () => {
    await withIsolatedMod(async (mod) => {
      const { stats } = await mod.runWithQueryStats(async () => {
        mod.recordQuery(100);
        mod.recordQuery(100);
      });

      expect(stats.count).toBe(2);
      expect(stats.totalDurationMs).toBe(200);
    });
  });

  it('TC-2523: getCurrentStats returns the current stats object inside a scope', async () => {
    await withIsolatedMod(async (mod) => {
      await mod.runWithQueryStats(async () => {
        const stats = mod.getCurrentStats();
        // Inside the scope, stats must be a non-null object with the expected shape.
        expect(stats).toBeDefined();
        expect(typeof stats?.count).toBe('number');
        expect(typeof stats?.totalDurationMs).toBe('number');
      });
    });
  });

  it('TC-2525: multiple recordQuery calls accumulate totalDurationMs correctly', async () => {
    await withIsolatedMod(async (mod) => {
      const { stats } = await mod.runWithQueryStats(async () => {
        mod.recordQuery(10);
        mod.recordQuery(20);
        mod.recordQuery(30);
      });

      expect(stats.count).toBe(3);
      expect(stats.totalDurationMs).toBe(60);
    });
  });
});

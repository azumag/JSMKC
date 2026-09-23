/**
 * Unit tests for retryDbRead utility (TC-2510–TC-2515).
 *
 * retryDbRead wraps a DB read operation and retries on failure,
 * making it resilient to transient D1 errors on Cloudflare Workers.
 */

import { retryDbRead } from '@/lib/db-read-retry';

describe('retryDbRead', () => {
  it('TC-2510: returns result immediately when operation succeeds on first attempt', async () => {
    const operation = jest.fn().mockResolvedValue('result-value');

    const result = await retryDbRead(operation);

    expect(result).toBe('result-value');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('TC-2511: retries after failure and returns result on second attempt', async () => {
    let call = 0;
    const operation = jest.fn().mockImplementation(() => {
      call += 1;
      return call === 1 ? Promise.reject(new Error('transient')) : Promise.resolve('retry-success');
    });

    const result = await retryDbRead(operation, { delayMs: 0 });

    expect(result).toBe('retry-success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('TC-2512: throws last error after exhausting all default attempts', async () => {
    let call = 0;
    const errors = [new Error('error-1'), new Error('error-2')];
    const operation = jest.fn().mockImplementation(() => {
      const err = errors[call];
      call += 1;
      return Promise.reject(err);
    });

    await expect(retryDbRead(operation, { delayMs: 0 })).rejects.toThrow('error-2');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('TC-2513: respects custom attempts option', async () => {
    const operation = jest.fn().mockImplementation(() => Promise.reject(new Error('always fails')));

    await expect(retryDbRead(operation, { attempts: 3, delayMs: 0 })).rejects.toThrow('always fails');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('TC-2514: calls onRetry callback with attempt number and error', async () => {
    const triggerError = new Error('retry-trigger');
    let call = 0;
    const onRetry = jest.fn();
    const operation = jest.fn().mockImplementation(() => {
      call += 1;
      return call === 1 ? Promise.reject(triggerError) : Promise.resolve('ok');
    });

    await retryDbRead(operation, { delayMs: 0, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith({ attempt: 1, error: triggerError });
  });

  it('TC-2515: does not retry when attempts is 1', async () => {
    const operation = jest.fn().mockImplementation(() => Promise.reject(new Error('single-attempt-fail')));

    await expect(retryDbRead(operation, { attempts: 1, delayMs: 0 })).rejects.toThrow('single-attempt-fail');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('TC-2518: onRetry is NOT called on the final failed attempt', async () => {
    // The implementation breaks before calling onRetry when attempt >= attempts,
    // so callers must not expect onRetry to fire on every error, only between attempts.
    const onRetry = jest.fn();
    const operation = jest.fn().mockImplementation(() => Promise.reject(new Error('always-fails')));

    await expect(retryDbRead(operation, { attempts: 2, delayMs: 0, onRetry })).rejects.toThrow('always-fails');
    expect(operation).toHaveBeenCalledTimes(2);
    // onRetry fires after attempt 1 (not the last), but NOT after attempt 2 (the final failure)
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith({ attempt: 1, error: expect.any(Error) });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid attempts value %s before executing the operation',
    async (attempts) => {
      const operation = jest.fn().mockResolvedValue('should-not-run');

      await expect(retryDbRead(operation, { attempts, delayMs: 0 })).rejects.toThrow(
        'retryDbRead attempts must be a positive safe integer',
      );
      expect(operation).not.toHaveBeenCalled();
    },
  );

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid delayMs value %s before executing the operation',
    async (delayMs) => {
      const operation = jest.fn().mockResolvedValue('should-not-run');

      await expect(retryDbRead(operation, { attempts: 1, delayMs })).rejects.toThrow(
        'retryDbRead delayMs must be a non-negative finite number',
      );
      expect(operation).not.toHaveBeenCalled();
    },
  );

  it.each([
    [2, 2_147_483_648],
    [3, 1_073_741_824],
    [Number.MAX_SAFE_INTEGER, 1],
  ])('rejects attempts=%s with delayMs=%s when a retry sleep exceeds the timer range', async (attempts, delayMs) => {
    const operation = jest.fn().mockResolvedValue('should-not-run');

    await expect(retryDbRead(operation, { attempts, delayMs })).rejects.toThrow(
      'retryDbRead delayMs exceeds the supported timer range for configured attempts',
    );
    expect(operation).not.toHaveBeenCalled();
  });

  it.each([
    [1, Number.MAX_VALUE],
    [2, 2_147_483_647],
    [3, 1_073_741_823.5],
  ])('accepts delayMs when every configured retry sleep remains within the timer range', async (attempts, delayMs) => {
    const operation = jest.fn().mockResolvedValue('ok');

    await expect(retryDbRead(operation, { attempts, delayMs })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('schedules each retry with the configured linear backoff', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');

    try {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('retry-1'))
        .mockRejectedValueOnce(new Error('retry-2'))
        .mockResolvedValue('ok');

      const resultPromise = retryDbRead(operation, { attempts: 3, delayMs: 25 });
      await jest.runAllTimersAsync();

      await expect(resultPromise).resolves.toBe('ok');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 25);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 50);
    } finally {
      jest.useRealTimers();
    }
  });
});

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
      return call === 1
        ? Promise.reject(new Error('transient'))
        : Promise.resolve('retry-success');
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
    const operation = jest.fn().mockImplementation(() =>
      Promise.reject(new Error('always fails')),
    );

    await expect(retryDbRead(operation, { attempts: 3, delayMs: 0 })).rejects.toThrow(
      'always fails',
    );
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

    await expect(retryDbRead(operation, { attempts: 1 })).rejects.toThrow('single-attempt-fail');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

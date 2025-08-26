// apps/api/test/retry.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withRetry, type RetryOptions } from '../src/lib/retry';

function flaky<T>(failTimes: number, result: T) {
  let count = 0;
  return async () => {
    if (count < failTimes) {
      count++;
      const err: any = new Error('temporary');
      err.code = 'ETIMEDOUT';
      throw err;
    }
    return result;
  };
}

describe('withRetry', () => {
  it('succeeds after transient failures within retry budget', async () => {
    const onAttempt = vi.fn();
    const fn = flaky(2, 'OK');
    await expect(
      withRetry(fn, { retries: 3, baseDelayMs: 10, maxDelayMs: 30, onAttempt })
    ).resolves.toBe('OK');
    expect(onAttempt).toHaveBeenCalledTimes(2);
  });

  it('throws when exceeds retry budget', async () => {
    const onAttempt = vi.fn();
    const err429: any = new Error('rate limit');
    err429.status = 429;

    let tries = 0;
    const fn = async () => {
      tries++;
      throw err429;
    };

    await expect(
      withRetry(fn, { retries: 2, baseDelayMs: 10, maxDelayMs: 30, onAttempt })
    ).rejects.toBe(err429);

    expect(tries).toBe(3);
    expect(onAttempt).toHaveBeenCalledTimes(2);
  });

  it('does not retry on non-retriable error', async () => {
    const err400: any = new Error('bad request');
    err400.status = 400;

    const fn = async () => { throw err400; };
    await expect(withRetry(fn, { retries: 5, baseDelayMs: 5 })).rejects.toBe(err400);
  });

  it('respects timeout per attempt', async () => {
    const never = async () => new Promise((_r, _j) => {});
    await expect(
      withRetry(never, { retries: 1, timeoutMs: 150, baseDelayMs: 10, maxDelayMs: 20 })
    ).rejects.toBeTruthy();
  });
});
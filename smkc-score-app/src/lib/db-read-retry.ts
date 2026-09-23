type RetryContext = {
  attempt: number;
  error: unknown;
};

type RetryOptions = {
  attempts?: number;
  delayMs?: number;
  onRetry?: (context: RetryContext) => void;
};

const MAX_TIMER_DELAY_MS = 2_147_483_647;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateRetryOptions(attempts: number, delayMs: number): void {
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new RangeError('retryDbRead attempts must be a positive safe integer');
  }
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new RangeError('retryDbRead delayMs must be a non-negative finite number');
  }

  const maxSleepAttempt = attempts - 1;
  if (maxSleepAttempt > 0 && delayMs > MAX_TIMER_DELAY_MS / maxSleepAttempt) {
    throw new RangeError('retryDbRead delayMs exceeds the supported timer range for configured attempts');
  }
}

export async function retryDbRead<T>(operation: () => Promise<T>, options?: RetryOptions): Promise<T>;
export async function retryDbRead<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 2;
  const delayMs = options.delayMs ?? 75;
  validateRetryOptions(attempts, delayMs);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      options.onRetry?.({ attempt, error });
      if (delayMs > 0) await sleep(delayMs * attempt);
    }
  }

  throw lastError;
}

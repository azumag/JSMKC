type RetryContext = {
  attempt: number;
  error: unknown;
};

type RetryOptions = {
  attempts?: number;
  delayMs?: number;
  onRetry?: (context: RetryContext) => void;
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retryDbRead<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 2;
  const delayMs = options.delayMs ?? 75;
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

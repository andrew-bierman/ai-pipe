/**
 * Retry with exponential backoff for transient errors and rate limits.
 *
 * Provides automatic retry logic for API calls that may fail due to
 * rate limiting (429), server errors (5xx), or network issues.
 */

/** Configuration options for retry behavior. */
export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/** Sensible defaults: 3 retries, 1s initial delay, 30s max, 2x backoff. */
export const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
} as const;

/**
 * Check if an error is retryable (rate limit or transient server error).
 *
 * Retryable conditions:
 * - HTTP 429 (rate limit)
 * - HTTP 500, 502, 503, 504 (server errors)
 * - Network errors: ECONNRESET, ETIMEDOUT, ECONNREFUSED, ENOTFOUND, EAI_AGAIN
 *
 * @param error - The error to check.
 * @returns `true` if the error is likely transient and worth retrying.
 */
export function isRetryableError(error: unknown): boolean {
  if (error == null || typeof error !== "object") {
    return false;
  }

  const err = error as Record<string, unknown>;

  // Check HTTP status codes (error.status or error.statusCode)
  const status = (err.status ?? err.statusCode) as number | undefined;
  if (typeof status === "number") {
    // 429 = rate limit
    if (status === 429) return true;
    // 5xx server errors
    if (status >= 500 && status <= 504) return true;
  }

  // Check network error codes
  const code = err.code as string | undefined;
  if (typeof code === "string") {
    const retryableCodes = new Set([
      "ECONNRESET",
      "ETIMEDOUT",
      "ECONNREFUSED",
      "ENOTFOUND",
      "EAI_AGAIN",
    ]);
    if (retryableCodes.has(code)) return true;
  }

  return false;
}

/**
 * Calculate delay for a given retry attempt with exponential backoff and jitter.
 *
 * The base delay doubles each attempt (by default), capped at `maxDelayMs`.
 * Jitter of +/-25% is applied to avoid thundering herd.
 *
 * @param attempt - Zero-based attempt index (0 = first retry).
 * @param options - Retry configuration.
 * @returns Delay in milliseconds.
 */
export function calculateDelay(attempt: number, options: RetryOptions): number {
  const delay = Math.min(
    options.initialDelayMs * options.backoffMultiplier ** attempt,
    options.maxDelayMs,
  );
  // Add jitter (+-25%)
  return delay * (0.75 + Math.random() * 0.5);
}

/**
 * Execute a function with retry logic.
 *
 * On retryable errors, waits with exponential backoff before retrying.
 * Non-retryable errors are thrown immediately. A progress message is
 * written to stderr before each retry.
 *
 * @param fn - The async function to execute.
 * @param options - Partial retry configuration (merged with defaults).
 * @returns The result of the function on success.
 * @throws The last error if all retries are exhausted, or immediately for non-retryable errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < opts.maxRetries && isRetryableError(error)) {
        const delay = calculateDelay(attempt, opts);
        process.stderr.write(
          `Retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 2}/${opts.maxRetries + 1})...\n`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

import { describe, expect, mock, test } from "bun:test";
import {
  calculateDelay,
  DEFAULT_RETRY,
  isRetryableError,
  type RetryOptions,
  withRetry,
} from "../retry.ts";

// ── isRetryableError ────────────────────────────────────────────────

describe("isRetryableError", () => {
  test("identifies rate limit errors (status 429)", () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ statusCode: 429 })).toBe(true);
  });

  test("identifies server errors (500, 502, 503, 504)", () => {
    expect(isRetryableError({ status: 500 })).toBe(true);
    expect(isRetryableError({ status: 502 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ status: 504 })).toBe(true);
    expect(isRetryableError({ statusCode: 500 })).toBe(true);
  });

  test("identifies network errors", () => {
    expect(isRetryableError({ code: "ECONNRESET" })).toBe(true);
    expect(isRetryableError({ code: "ETIMEDOUT" })).toBe(true);
    expect(isRetryableError({ code: "ECONNREFUSED" })).toBe(true);
    expect(isRetryableError({ code: "ENOTFOUND" })).toBe(true);
    expect(isRetryableError({ code: "EAI_AGAIN" })).toBe(true);
  });

  test("returns false for client errors (400, 401, 403, 404)", () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 401 })).toBe(false);
    expect(isRetryableError({ status: 403 })).toBe(false);
    expect(isRetryableError({ status: 404 })).toBe(false);
  });

  test("returns false for non-retryable error codes", () => {
    expect(isRetryableError({ code: "ENOENT" })).toBe(false);
    expect(isRetryableError({ code: "EACCES" })).toBe(false);
  });

  test("returns false for null/undefined/primitive values", () => {
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
    expect(isRetryableError("error")).toBe(false);
    expect(isRetryableError(42)).toBe(false);
  });

  test("returns false for plain Error without status/code", () => {
    expect(isRetryableError(new Error("something went wrong"))).toBe(false);
  });

  test("returns false for status codes outside retryable range", () => {
    expect(isRetryableError({ status: 505 })).toBe(false);
    expect(isRetryableError({ status: 200 })).toBe(false);
    expect(isRetryableError({ status: 301 })).toBe(false);
  });
});

// ── calculateDelay ──────────────────────────────────────────────────

describe("calculateDelay", () => {
  const opts: RetryOptions = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  };

  test("returns increasing delays for successive attempts", () => {
    // Run multiple samples to account for jitter and check the trend
    const samples = 100;
    let avgDelay0 = 0;
    let avgDelay1 = 0;
    let avgDelay2 = 0;

    for (let i = 0; i < samples; i++) {
      avgDelay0 += calculateDelay(0, opts);
      avgDelay1 += calculateDelay(1, opts);
      avgDelay2 += calculateDelay(2, opts);
    }
    avgDelay0 /= samples;
    avgDelay1 /= samples;
    avgDelay2 /= samples;

    expect(avgDelay1).toBeGreaterThan(avgDelay0);
    expect(avgDelay2).toBeGreaterThan(avgDelay1);
  });

  test("caps at maxDelayMs", () => {
    const smallMax: RetryOptions = {
      maxRetries: 10,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 2,
    };
    // attempt 10 would be 1000 * 2^10 = 1024000 without cap
    for (let i = 0; i < 50; i++) {
      const delay = calculateDelay(10, smallMax);
      // With jitter (0.75 to 1.25), max delay is 5000 * 1.25 = 6250
      expect(delay).toBeLessThanOrEqual(smallMax.maxDelayMs * 1.25);
    }
  });

  test("adds jitter (not always the same value)", () => {
    const delays = new Set<number>();
    for (let i = 0; i < 20; i++) {
      delays.add(calculateDelay(0, opts));
    }
    // With jitter, we should get multiple distinct values
    expect(delays.size).toBeGreaterThan(1);
  });

  test("jitter stays within +-25% of base delay", () => {
    for (let i = 0; i < 100; i++) {
      const delay = calculateDelay(0, opts);
      // Base delay for attempt 0 is 1000ms
      // With jitter: 1000 * 0.75 = 750, 1000 * 1.25 = 1250
      expect(delay).toBeGreaterThanOrEqual(750);
      expect(delay).toBeLessThanOrEqual(1250);
    }
  });
});

// ── DEFAULT_RETRY ───────────────────────────────────────────────────

describe("DEFAULT_RETRY", () => {
  test("has expected default values", () => {
    expect(DEFAULT_RETRY.maxRetries).toBe(3);
    expect(DEFAULT_RETRY.initialDelayMs).toBe(1000);
    expect(DEFAULT_RETRY.maxDelayMs).toBe(30000);
    expect(DEFAULT_RETRY.backoffMultiplier).toBe(2);
  });
});

// ── withRetry ───────────────────────────────────────────────────────

describe("withRetry", () => {
  // Use fast options for tests to avoid waiting
  const fastOpts = {
    maxRetries: 3,
    initialDelayMs: 1,
    maxDelayMs: 10,
    backoffMultiplier: 2,
  };

  test("succeeds on first attempt", async () => {
    const fn = mock(() => Promise.resolve("ok"));
    const result = await withRetry(fn, fastOpts);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries on retryable error and eventually succeeds", async () => {
    let calls = 0;
    const fn = mock(() => {
      calls++;
      if (calls < 3) {
        return Promise.reject({ status: 429, message: "rate limited" });
      }
      return Promise.resolve("success after retries");
    });

    const result = await withRetry(fn, fastOpts);
    expect(result).toBe("success after retries");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("throws immediately on non-retryable error", async () => {
    const fn = mock(() =>
      Promise.reject({ status: 401, message: "unauthorized" }),
    );

    await expect(withRetry(fn, fastOpts)).rejects.toEqual({
      status: 401,
      message: "unauthorized",
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("throws after max retries exhausted", async () => {
    const fn = mock(() =>
      Promise.reject({ status: 503, message: "service unavailable" }),
    );

    await expect(withRetry(fn, fastOpts)).rejects.toEqual({
      status: 503,
      message: "service unavailable",
    });
    // 1 initial + 3 retries = 4 total calls
    expect(fn).toHaveBeenCalledTimes(4);
  });

  test("writes retry progress to stderr", async () => {
    const originalWrite = process.stderr.write;
    const stderrOutput: string[] = [];
    process.stderr.write = ((chunk: string) => {
      stderrOutput.push(chunk);
      return true;
    }) as typeof process.stderr.write;

    let calls = 0;
    const fn = mock(() => {
      calls++;
      if (calls < 2) {
        return Promise.reject({ status: 429, message: "rate limited" });
      }
      return Promise.resolve("ok");
    });

    try {
      await withRetry(fn, fastOpts);
      expect(stderrOutput.length).toBeGreaterThan(0);
      expect(stderrOutput[0]).toContain("Retrying in");
      expect(stderrOutput[0]).toContain("attempt 2/4");
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  test("uses default options when none provided", async () => {
    const fn = mock(() => Promise.resolve("ok"));
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("merges partial options with defaults", async () => {
    let calls = 0;
    const fn = mock(() => {
      calls++;
      if (calls < 2) {
        return Promise.reject({ status: 429, message: "rate limited" });
      }
      return Promise.resolve("ok");
    });

    // Only override maxRetries and timing, rest comes from DEFAULT_RETRY
    const result = await withRetry(fn, {
      maxRetries: 1,
      initialDelayMs: 1,
      maxDelayMs: 5,
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("with maxRetries 0, does not retry", async () => {
    const fn = mock(() =>
      Promise.reject({ status: 503, message: "service unavailable" }),
    );

    await expect(withRetry(fn, { ...fastOpts, maxRetries: 0 })).rejects.toEqual(
      {
        status: 503,
        message: "service unavailable",
      },
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

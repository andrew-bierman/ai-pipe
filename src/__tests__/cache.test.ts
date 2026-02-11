import { afterAll, describe, expect, test } from "bun:test";
import {
  buildCacheKey,
  CachedResponseSchema,
  type CacheKeyParams,
  clearCache,
  getCachedResponse,
  setCachedResponse,
} from "../cache.ts";
import { APP } from "../constants.ts";

// NOTE: These tests use the real cache directory (~/.ai-pipe/cache/) because
// cache.ts uses a module-level constant for CACHE_DIR that is not injectable.
// Making it injectable would be a larger refactor. All tests that write to the
// cache directory clean up after themselves in afterAll hooks.

// ── buildCacheKey ─────────────────────────────────────────────────────

describe("buildCacheKey", () => {
  const baseParams: CacheKeyParams = {
    model: "openai/gpt-4o",
    system: "You are helpful",
    prompt: "Hello world",
    temperature: 0.7,
    maxOutputTokens: 1000,
  };

  test("produces a consistent hash for identical inputs", () => {
    const key1 = buildCacheKey(baseParams);
    const key2 = buildCacheKey(baseParams);
    expect(key1).toBe(key2);
  });

  test("produces a 64-character hex string (SHA-256)", () => {
    const key = buildCacheKey(baseParams);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  test("different models produce different keys", () => {
    const key1 = buildCacheKey(baseParams);
    const key2 = buildCacheKey({
      ...baseParams,
      model: "anthropic/claude-sonnet-4",
    });
    expect(key1).not.toBe(key2);
  });

  test("different prompts produce different keys", () => {
    const key1 = buildCacheKey(baseParams);
    const key2 = buildCacheKey({ ...baseParams, prompt: "Goodbye world" });
    expect(key1).not.toBe(key2);
  });

  test("different system prompts produce different keys", () => {
    const key1 = buildCacheKey(baseParams);
    const key2 = buildCacheKey({ ...baseParams, system: "You are a pirate" });
    expect(key1).not.toBe(key2);
  });

  test("different temperatures produce different keys", () => {
    const key1 = buildCacheKey(baseParams);
    const key2 = buildCacheKey({ ...baseParams, temperature: 0.0 });
    expect(key1).not.toBe(key2);
  });

  test("different maxOutputTokens produce different keys", () => {
    const key1 = buildCacheKey(baseParams);
    const key2 = buildCacheKey({ ...baseParams, maxOutputTokens: 500 });
    expect(key1).not.toBe(key2);
  });

  test("handles undefined system prompt", () => {
    const key1 = buildCacheKey({ ...baseParams, system: undefined });
    const key2 = buildCacheKey({ ...baseParams, system: undefined });
    expect(key1).toBe(key2);
    // Should be different from one with a system prompt
    const key3 = buildCacheKey(baseParams);
    expect(key1).not.toBe(key3);
  });

  test("handles undefined temperature and maxOutputTokens", () => {
    const key = buildCacheKey({
      ...baseParams,
      temperature: undefined,
      maxOutputTokens: undefined,
    });
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ── CachedResponseSchema ──────────────────────────────────────────────

describe("CachedResponseSchema", () => {
  test("validates a correct cached response", () => {
    const data = {
      text: "Hello!",
      usage: { inputTokens: 10, outputTokens: 20 },
      finishReason: "stop",
      timestamp: Date.now(),
      model: "openai/gpt-4o",
    };
    const result = CachedResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("rejects missing required fields", () => {
    const data = {
      text: "Hello!",
      // missing usage, finishReason, timestamp, model
    };
    const result = CachedResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("accepts minimal usage object", () => {
    const data = {
      text: "Hello!",
      usage: {},
      finishReason: "stop",
      timestamp: Date.now(),
      model: "openai/gpt-4o",
    };
    const result = CachedResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ── getCachedResponse ────────────────────────────────────────────────

describe("getCachedResponse", () => {
  test("returns null for a missing cache entry", async () => {
    const result = await getCachedResponse("nonexistent-key-12345");
    expect(result).toBeNull();
  });
});

// ── setCachedResponse + getCachedResponse roundtrip ──────────────────

describe("setCachedResponse + getCachedResponse roundtrip", () => {
  const testKey = `test-roundtrip-${Date.now()}`;

  afterAll(async () => {
    // Clean up the test file
    const { homedir } = await import("node:os");
    const { join } = await import("node:path");
    const { unlink } = await import("node:fs/promises");
    const filePath = join(
      homedir(),
      APP.configDirName,
      "cache",
      `${testKey}.json`,
    );
    try {
      await unlink(filePath);
    } catch {
      // ignore
    }
  });

  test("stores and retrieves a cached response", async () => {
    const responseData = {
      text: "This is a test response",
      usage: { inputTokens: 15, outputTokens: 25, totalTokens: 40 },
      finishReason: "stop",
      model: "openai/gpt-4o",
    };

    await setCachedResponse(testKey, responseData);
    const cached = await getCachedResponse(testKey);

    expect(cached).not.toBeNull();
    expect(cached?.text).toBe(responseData.text);
    expect(cached?.usage.inputTokens).toBe(15);
    expect(cached?.usage.outputTokens).toBe(25);
    expect(cached?.finishReason).toBe("stop");
    expect(cached?.model).toBe("openai/gpt-4o");
    expect(cached?.timestamp).toBeGreaterThan(0);
  });
});

// ── TTL expiration ───────────────────────────────────────────────────

describe("TTL expiration", () => {
  const testKey = `test-ttl-${Date.now()}`;

  afterAll(async () => {
    const { homedir } = await import("node:os");
    const { join } = await import("node:path");
    const { unlink } = await import("node:fs/promises");
    const filePath = join(
      homedir(),
      APP.configDirName,
      "cache",
      `${testKey}.json`,
    );
    try {
      await unlink(filePath);
    } catch {
      // ignore
    }
  });

  test("returns null when TTL has expired", async () => {
    const responseData = {
      text: "Expired response",
      usage: { inputTokens: 5, outputTokens: 10 },
      finishReason: "stop",
      model: "openai/gpt-4o",
    };

    await setCachedResponse(testKey, responseData);

    // With a TTL of 0ms, the entry should immediately be considered expired
    const cached = await getCachedResponse(testKey, 0);
    expect(cached).toBeNull();
  });

  test("returns entry when within TTL", async () => {
    const responseData = {
      text: "Fresh response",
      usage: { inputTokens: 5, outputTokens: 10 },
      finishReason: "stop",
      model: "openai/gpt-4o",
    };

    await setCachedResponse(testKey, responseData);

    // With a large TTL, the entry should still be valid
    const cached = await getCachedResponse(testKey, 60 * 60 * 1000);
    expect(cached).not.toBeNull();
    expect(cached?.text).toBe("Fresh response");
  });
});

// ── clearCache ───────────────────────────────────────────────────────

describe("clearCache", () => {
  const testKeys = [`test-clear-1-${Date.now()}`, `test-clear-2-${Date.now()}`];

  test("removes cached files and returns count", async () => {
    // Write some test entries
    for (const key of testKeys) {
      await setCachedResponse(key, {
        text: `Response for ${key}`,
        usage: { inputTokens: 1, outputTokens: 1 },
        finishReason: "stop",
        model: "test/model",
      });
    }

    // Verify they exist
    for (const key of testKeys) {
      const cached = await getCachedResponse(key);
      expect(cached).not.toBeNull();
    }

    // Clear all cache
    const removed = await clearCache();
    expect(removed).toBeGreaterThanOrEqual(testKeys.length);

    // Verify they are gone
    for (const key of testKeys) {
      const cached = await getCachedResponse(key);
      expect(cached).toBeNull();
    }
  });

  test("returns 0 when cache directory is empty or missing", async () => {
    // After clearing, calling again should return 0
    const removed = await clearCache();
    expect(removed).toBe(0);
  });
});

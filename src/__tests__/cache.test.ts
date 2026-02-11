import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearCache,
  generateCacheKey,
  getCachedResponse,
  setCachedResponse,
} from "../cache.ts";

const tmpDir = tmpdir();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function makeTestCacheDir(): string {
  const dir = join(tmpDir, `ai-pipe-cache-test-${uid()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ── generateCacheKey ─────────────────────────────────────────────────────

describe("generateCacheKey", () => {
  test("generates consistent hash for same inputs", () => {
    const key1 = generateCacheKey("openai", "gpt-4o", "hello");
    const key2 = generateCacheKey("openai", "gpt-4o", "hello");
    expect(key1).toBe(key2);
  });

  test("generates different hash for different prompts", () => {
    const key1 = generateCacheKey("openai", "gpt-4o", "hello");
    const key2 = generateCacheKey("openai", "gpt-4o", "world");
    expect(key1).not.toBe(key2);
  });

  test("generates different hash for different models", () => {
    const key1 = generateCacheKey("openai", "gpt-4o", "hello");
    const key2 = generateCacheKey("openai", "gpt-3.5-turbo", "hello");
    expect(key1).not.toBe(key2);
  });

  test("generates different hash for different providers", () => {
    const key1 = generateCacheKey("openai", "gpt-4o", "hello");
    const key2 = generateCacheKey("anthropic", "claude-sonnet-4-5", "hello");
    expect(key1).not.toBe(key2);
  });

  test("returns 64-character hex string (SHA-256)", () => {
    const key = generateCacheKey("openai", "gpt-4o", "test");
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ── cache get/set ─────────────────────────────────

describe("cache get/set", () => {
  test("returns null for cache miss", async () => {
    const testCacheDir = makeTestCacheDir();
    process.env.AI_PIPE_CACHE_DIR = testCacheDir;
    try {
      const result = await getCachedResponse(
        "openai",
        "gpt-4o",
        `nonexistent-prompt-${uid()}`,
      );
      expect(result).toBeNull();
    } finally {
      cleanup(testCacheDir);
      delete process.env.AI_PIPE_CACHE_DIR;
    }
  });

  test("returns cached response on cache hit", async () => {
    const testCacheDir = makeTestCacheDir();
    process.env.AI_PIPE_CACHE_DIR = testCacheDir;
    try {
      const provider = "openai";
      const model = "gpt-4o";
      const prompt = `test-prompt-${uid()}`;
      const response = "Hello, cached world!";

      await setCachedResponse(provider, model, prompt, response);
      const cached = await getCachedResponse(provider, model, prompt);

      expect(cached).toBe(response);
    } finally {
      cleanup(testCacheDir);
      delete process.env.AI_PIPE_CACHE_DIR;
    }
  });

  test("stores and retrieves different entries", async () => {
    const testCacheDir = makeTestCacheDir();
    process.env.AI_PIPE_CACHE_DIR = testCacheDir;
    try {
      const provider = "anthropic";
      const model = "claude-sonnet-4-5";

      const prompt1 = `prompt1-${uid()}`;
      const response1 = "Response 1";
      await setCachedResponse(provider, model, prompt1, response1);

      const prompt2 = `prompt2-${uid()}`;
      const response2 = "Response 2";
      await setCachedResponse(provider, model, prompt2, response2);

      expect(await getCachedResponse(provider, model, prompt1)).toBe(response1);
      expect(await getCachedResponse(provider, model, prompt2)).toBe(response2);
    } finally {
      cleanup(testCacheDir);
      delete process.env.AI_PIPE_CACHE_DIR;
    }
  });

  test("different providers have separate caches", async () => {
    const testCacheDir = makeTestCacheDir();
    process.env.AI_PIPE_CACHE_DIR = testCacheDir;
    try {
      const model = "gpt-4o";
      const prompt = `prompt-${uid()}`;

      await setCachedResponse("openai", model, prompt, "OpenAI response");
      await setCachedResponse("anthropic", model, prompt, "Anthropic response");

      expect(await getCachedResponse("openai", model, prompt)).toBe(
        "OpenAI response",
      );
      expect(await getCachedResponse("anthropic", model, prompt)).toBe(
        "Anthropic response",
      );
    } finally {
      cleanup(testCacheDir);
      delete process.env.AI_PIPE_CACHE_DIR;
    }
  });

  test("different models have separate caches", async () => {
    const testCacheDir = makeTestCacheDir();
    process.env.AI_PIPE_CACHE_DIR = testCacheDir;
    try {
      const provider = "openai";
      const prompt = `prompt-${uid()}`;

      await setCachedResponse(provider, "gpt-4o", prompt, "GPT-4o response");
      await setCachedResponse(
        provider,
        "gpt-3.5-turbo",
        prompt,
        "GPT-3.5 response",
      );

      expect(await getCachedResponse(provider, "gpt-4o", prompt)).toBe(
        "GPT-4o response",
      );
      expect(await getCachedResponse(provider, "gpt-3.5-turbo", prompt)).toBe(
        "GPT-3.5 response",
      );
    } finally {
      cleanup(testCacheDir);
      delete process.env.AI_PIPE_CACHE_DIR;
    }
  });

  test("handles special characters in prompt", async () => {
    const testCacheDir = makeTestCacheDir();
    process.env.AI_PIPE_CACHE_DIR = testCacheDir;
    try {
      const provider = "openai";
      const model = "gpt-4o";
      const prompt = `Special chars: ${uid()} !@#$%^&*()_+{}|:"<>?`;
      const response = "Response with special chars";

      await setCachedResponse(provider, model, prompt, response);
      const cached = await getCachedResponse(provider, model, prompt);

      expect(cached).toBe(response);
    } finally {
      cleanup(testCacheDir);
      delete process.env.AI_PIPE_CACHE_DIR;
    }
  });

  test("handles multiline prompts", async () => {
    const testCacheDir = makeTestCacheDir();
    process.env.AI_PIPE_CACHE_DIR = testCacheDir;
    try {
      const provider = "openai";
      const model = "gpt-4o";
      const prompt = `Line 1\nLine 2\nLine 3\n${uid()}`;
      const response = "Multiline response";

      await setCachedResponse(provider, model, prompt, response);
      const cached = await getCachedResponse(provider, model, prompt);

      expect(cached).toBe(response);
    } finally {
      cleanup(testCacheDir);
      delete process.env.AI_PIPE_CACHE_DIR;
    }
  });

  test("handles empty response", async () => {
    const testCacheDir = makeTestCacheDir();
    process.env.AI_PIPE_CACHE_DIR = testCacheDir;
    try {
      const provider = "openai";
      const model = "gpt-4o";
      const prompt = `empty-prompt-${uid()}`;

      await setCachedResponse(provider, model, prompt, "");
      const cached = await getCachedResponse(provider, model, prompt);

      expect(cached).toBe("");
    } finally {
      cleanup(testCacheDir);
      delete process.env.AI_PIPE_CACHE_DIR;
    }
  });
});

// ── clearCache ───────────────────────────────────────────────────────

describe("clearCache", () => {
  test("clears all cache entries", async () => {
    const testCacheDir = makeTestCacheDir();
    process.env.AI_PIPE_CACHE_DIR = testCacheDir;
    try {
      const provider = "openai";
      const model = "gpt-4o";

      // Add some entries
      await setCachedResponse(
        provider,
        model,
        `clear-test-1-${uid()}`,
        "value1",
      );
      await setCachedResponse(
        provider,
        model,
        `clear-test-2-${uid()}`,
        "value2",
      );

      // Clear
      await clearCache();

      // Verify cleared
      expect(
        await getCachedResponse(provider, model, `clear-test-1-${uid()}`),
      ).toBeNull();
      expect(
        await getCachedResponse(provider, model, `clear-test-2-${uid()}`),
      ).toBeNull();
    } finally {
      cleanup(testCacheDir);
      delete process.env.AI_PIPE_CACHE_DIR;
    }
  });

  test("handles empty cache directory", async () => {
    const testCacheDir = makeTestCacheDir();
    process.env.AI_PIPE_CACHE_DIR = testCacheDir;
    try {
      // Should not throw - just call it and ensure no error
      await clearCache();
    } finally {
      cleanup(testCacheDir);
      delete process.env.AI_PIPE_CACHE_DIR;
    }
  });
});

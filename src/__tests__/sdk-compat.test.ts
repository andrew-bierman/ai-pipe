import { test, expect, describe } from "bun:test";
import type { LanguageModelUsage, FinishReason } from "ai";
import { streamText, generateText } from "ai";
import { JsonOutputSchema, type JsonOutput } from "../index.ts";
import { registry, SUPPORTED_PROVIDERS, PROVIDER_ENV_VARS, type ProviderId } from "../provider.ts";

// ── AI SDK type alignment ─────────────────────────────────────────────
//
// These tests ensure our zod schemas stay in sync with the AI SDK's
// actual types.  If the SDK renames a field or adds a required one,
// these will break at compile-time *and* at runtime.

describe("AI SDK type compatibility", () => {
  // Compile-time check: LanguageModelUsage must be assignable to our
  // JsonOutput["usage"].  If the SDK renames inputTokens → promptTokens
  // (or similar), TypeScript will error here.
  test("JsonOutput.usage aligns with LanguageModelUsage", () => {
    const sdkUsage: LanguageModelUsage = {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      inputTokenDetails: { noCacheTokens: 2, cacheReadTokens: 5, cacheWriteTokens: 3 },
      outputTokenDetails: { textTokens: 12, reasoningTokens: 8 },
    };

    // Parse through our schema — if fields don't match, this throws
    const parsed = JsonOutputSchema.parse({
      text: "hello",
      model: "openai/gpt-4o",
      usage: sdkUsage,
      finishReason: "stop",
    });

    expect(parsed.usage.inputTokens).toBe(10);
    expect(parsed.usage.outputTokens).toBe(20);
    expect(parsed.usage.totalTokens).toBe(30);
    expect(parsed.usage.inputTokenDetails?.cacheReadTokens).toBe(5);
    expect(parsed.usage.outputTokenDetails?.reasoningTokens).toBe(8);
    expect(parsed.usage.outputTokenDetails?.textTokens).toBe(12);
  });

  test("FinishReason values are accepted by JsonOutputSchema", () => {
    // These are the known FinishReason values from the AI SDK.
    // If a value is removed or renamed, this compile-time assignment fails.
    const reasons: FinishReason[] = [
      "stop",
      "length",
      "content-filter",
      "tool-calls",
      "error",
      "other",
    ];

    for (const reason of reasons) {
      const parsed = JsonOutputSchema.parse({
        text: "",
        model: "openai/gpt-4o",
        usage: {},
        finishReason: reason,
      });
      expect(parsed.finishReason).toBe(reason);
    }
  });

  // Compile-time check: our JsonOutput type should be assignable from
  // a real SDK response shape.
  test("JsonOutput type accepts SDK-shaped data", () => {
    // Simulate what generateText returns
    const sdkResult = {
      text: "Hello, world!",
      usage: {
        inputTokens: 5,
        outputTokens: 3,
        totalTokens: 8,
        inputTokenDetails: { noCacheTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        outputTokenDetails: { textTokens: 3, reasoningTokens: 0 },
      } satisfies LanguageModelUsage,
      finishReason: "stop" as FinishReason,
    };

    const output: JsonOutput = {
      text: sdkResult.text,
      model: "openai/gpt-4o",
      usage: sdkResult.usage,
      finishReason: sdkResult.finishReason,
    };

    const parsed = JsonOutputSchema.parse(output);
    expect(parsed.text).toBe("Hello, world!");
    expect(parsed.finishReason).toBe("stop");
  });

  test("LanguageModelUsage fields are all optional in our schema", () => {
    // The SDK may return partial usage (e.g. streaming chunks).
    // Our schema should handle that gracefully.
    const minimalUsage: Partial<LanguageModelUsage> = {};

    const parsed = JsonOutputSchema.parse({
      text: "",
      model: "test/model",
      usage: minimalUsage,
      finishReason: "stop",
    });

    expect(parsed.usage.inputTokens).toBeUndefined();
    expect(parsed.usage.outputTokens).toBeUndefined();
    expect(parsed.usage.totalTokens).toBeUndefined();
  });
});

// ── Provider registry alignment ───────────────────────────────────────

describe("AI SDK registry compatibility", () => {
  test("registry.languageModel is callable for all providers", () => {
    // Verify the registry actually has all our providers registered.
    // We can't make a real API call, but we can verify the registry
    // doesn't throw when resolving a provider/model pair.
    for (const provider of SUPPORTED_PROVIDERS) {
      expect(() => {
        registry.languageModel(`${provider}/test-model` as `${ProviderId}/${string}`);
      }).not.toThrow();
    }
  });

  test("every SUPPORTED_PROVIDER has a corresponding env var", () => {
    for (const provider of SUPPORTED_PROVIDERS) {
      const envVar = PROVIDER_ENV_VARS[provider];
      expect(envVar).toBeDefined();
      expect(envVar).toMatch(/^[A-Z_]+$/);
    }
  });

  test("streamText and generateText are importable functions", () => {
    // If the AI SDK ever removes or renames these, this breaks immediately
    expect(typeof streamText).toBe("function");
    expect(typeof generateText).toBe("function");
  });
});

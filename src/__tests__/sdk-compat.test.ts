import { describe, expect, test } from "bun:test";
import type { FinishReason, LanguageModelUsage } from "ai";
import { generateText, streamText } from "ai";
import {
  type AnySource,
  buildJsonOutput,
  extractSources,
  formatSourcesText,
  type JsonOutput,
  JsonOutputSchema,
} from "../index.ts";
import {
  PROVIDER_ENV_VARS,
  type ProviderId,
  registry,
  SUPPORTED_PROVIDERS,
} from "../provider.ts";

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
      inputTokenDetails: {
        noCacheTokens: 2,
        cacheReadTokens: 5,
        cacheWriteTokens: 3,
      },
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
        inputTokenDetails: {
          noCacheTokens: 5,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
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

  test("JsonOutputSchema accepts sources array", () => {
    const parsed = JsonOutputSchema.parse({
      text: "hello",
      model: "perplexity/sonar",
      usage: {},
      finishReason: "stop",
      sources: [
        { url: "https://example.com", title: "Example" },
        { url: "https://other.com" },
      ],
    });

    expect(parsed.sources).toHaveLength(2);
    expect(parsed.sources?.[0]?.url).toBe("https://example.com");
    expect(parsed.sources?.[0]?.title).toBe("Example");
    expect(parsed.sources?.[1]?.title).toBeUndefined();
  });

  test("JsonOutputSchema accepts reasoning field", () => {
    const parsed = JsonOutputSchema.parse({
      text: "answer",
      model: "anthropic/claude-sonnet-4-5",
      usage: {},
      finishReason: "stop",
      reasoning: "Let me think about this...",
    });

    expect(parsed.reasoning).toBe("Let me think about this...");
  });

  test("JsonOutputSchema accepts providerMetadata", () => {
    const parsed = JsonOutputSchema.parse({
      text: "hello",
      model: "openai/gpt-4o",
      usage: {},
      finishReason: "stop",
      providerMetadata: { openai: { logprobs: [0.1, 0.2] } },
    });

    expect(parsed.providerMetadata).toEqual({
      openai: { logprobs: [0.1, 0.2] },
    });
  });

  test("JsonOutputSchema accepts usage.raw", () => {
    const parsed = JsonOutputSchema.parse({
      text: "hello",
      model: "openai/gpt-4o",
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        raw: { prompt_tokens: 10, completion_tokens: 20 },
      },
      finishReason: "stop",
    });

    expect(parsed.usage.raw).toEqual({
      prompt_tokens: 10,
      completion_tokens: 20,
    });
  });

  test("new optional fields default to undefined", () => {
    const parsed = JsonOutputSchema.parse({
      text: "hello",
      model: "openai/gpt-4o",
      usage: {},
      finishReason: "stop",
    });

    expect(parsed.sources).toBeUndefined();
    expect(parsed.reasoning).toBeUndefined();
    expect(parsed.providerMetadata).toBeUndefined();
  });
});

// ── Provider registry alignment ───────────────────────────────────────

describe("AI SDK registry compatibility", () => {
  test("registry.languageModel is callable for all providers", () => {
    // Verify the registry actually has all our providers registered.
    // We can't make a real API call, but we can verify the registry
    // doesn't throw when resolving a provider/model pair.
    // Note: some providers (vertex) require env vars at model creation time,
    // so we skip providers that throw LoadSettingError.
    for (const provider of SUPPORTED_PROVIDERS) {
      try {
        registry.languageModel(
          `${provider}/test-model` as `${ProviderId}/${string}`,
        );
      } catch (e: unknown) {
        // Allow LoadSettingError (missing env config), but fail on other errors
        expect((e as Error).name).toBe("AI_LoadSettingError");
      }
    }
  });

  test("every SUPPORTED_PROVIDER has corresponding env var(s)", () => {
    for (const provider of SUPPORTED_PROVIDERS) {
      const envVars = PROVIDER_ENV_VARS[provider];
      expect(envVars).toBeDefined();
      expect(Array.isArray(envVars)).toBe(true);
      expect(envVars.length).toBeGreaterThan(0);
      for (const v of envVars) {
        expect(v).toMatch(/^[A-Z_]+$/);
      }
    }
  });

  test("streamText and generateText are importable functions", () => {
    // If the AI SDK ever removes or renames these, this breaks immediately
    expect(typeof streamText).toBe("function");
    expect(typeof generateText).toBe("function");
  });
});

// ── Source extraction helpers ────────────────────────────────────────

const urlSource = (url: string, title?: string): AnySource => ({
  type: "source",
  sourceType: "url",
  url,
  ...(title ? { title } : {}),
});

const docSource = (id: string): AnySource => ({
  type: "source",
  sourceType: "document",
  id,
  mediaType: "text/plain",
  title: "doc",
});

describe("extractSources", () => {
  test("extracts URL-type sources", () => {
    const sources = extractSources([
      urlSource("https://a.com", "A"),
      urlSource("https://b.com"),
    ]);
    expect(sources).toEqual([
      { url: "https://a.com", title: "A" },
      { url: "https://b.com" },
    ]);
  });

  test("filters out document-type sources", () => {
    const sources = extractSources([
      urlSource("https://a.com"),
      docSource("doc-1"),
      urlSource("https://b.com"),
    ]);
    expect(sources).toHaveLength(2);
    expect(sources?.[0]?.url).toBe("https://a.com");
    expect(sources?.[1]?.url).toBe("https://b.com");
  });

  test("returns undefined for empty array", () => {
    expect(extractSources([])).toBeUndefined();
  });

  test("returns undefined when all sources are non-URL", () => {
    expect(extractSources([docSource("doc-1")])).toBeUndefined();
  });
});

describe("buildJsonOutput", () => {
  const baseResult = {
    text: "Hello",
    usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
    finishReason: "stop" as const,
  };

  test("builds minimal output", () => {
    const output = buildJsonOutput(baseResult, {
      modelString: "openai/gpt-4o",
    });
    expect(output.text).toBe("Hello");
    expect(output.model).toBe("openai/gpt-4o");
    expect(output.finishReason).toBe("stop");
    expect(output.sources).toBeUndefined();
    expect(output.reasoning).toBeUndefined();
    expect(output.providerMetadata).toBeUndefined();
  });

  test("uses opts.text override", () => {
    const output = buildJsonOutput(baseResult, {
      modelString: "openai/gpt-4o",
      text: "Overridden",
    });
    expect(output.text).toBe("Overridden");
  });

  test("includes sources when present", () => {
    const output = buildJsonOutput(
      { ...baseResult, sources: [urlSource("https://a.com", "A")] },
      { modelString: "perplexity/sonar" },
    );
    expect(output.sources).toEqual([{ url: "https://a.com", title: "A" }]);
  });

  test("omits sources when only document-type", () => {
    const output = buildJsonOutput(
      { ...baseResult, sources: [docSource("doc-1")] },
      { modelString: "test/model" },
    );
    expect(output.sources).toBeUndefined();
  });

  test("includes reasoning when present", () => {
    const output = buildJsonOutput(
      { ...baseResult, reasoningText: "Thinking..." },
      { modelString: "anthropic/claude-sonnet-4-5" },
    );
    expect(output.reasoning).toBe("Thinking...");
  });

  test("omits reasoning when null or empty", () => {
    const output1 = buildJsonOutput(
      { ...baseResult, reasoningText: null },
      { modelString: "test/model" },
    );
    expect(output1.reasoning).toBeUndefined();

    const output2 = buildJsonOutput(
      { ...baseResult, reasoningText: "" },
      { modelString: "test/model" },
    );
    expect(output2.reasoning).toBeUndefined();
  });

  test("includes providerMetadata when non-empty", () => {
    const output = buildJsonOutput(
      { ...baseResult, providerMetadata: { openai: { logprobs: [] } } },
      { modelString: "openai/gpt-4o" },
    );
    expect(output.providerMetadata).toEqual({ openai: { logprobs: [] } });
  });

  test("omits providerMetadata when empty object", () => {
    const output = buildJsonOutput(
      { ...baseResult, providerMetadata: {} },
      { modelString: "test/model" },
    );
    expect(output.providerMetadata).toBeUndefined();
  });
});

describe("formatSourcesText", () => {
  test("formats numbered source list", () => {
    const result = formatSourcesText([
      urlSource("https://a.com", "Page A"),
      urlSource("https://b.com"),
    ]);
    expect(result).toContain("Sources:");
    expect(result).toContain("[1] Page A — https://a.com");
    expect(result).toContain("[2] https://b.com");
  });

  test("returns empty string for no sources", () => {
    expect(formatSourcesText([])).toBe("");
  });

  test("returns empty string for only document sources", () => {
    expect(formatSourcesText([docSource("doc-1")])).toBe("");
  });

  test("starts with double newline for appending", () => {
    const result = formatSourcesText([urlSource("https://a.com")]);
    expect(result.startsWith("\n\n")).toBe(true);
  });
});

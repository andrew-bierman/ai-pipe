import { test, expect, describe, afterEach } from "bun:test";
import {
  parseModel,
  resolveModel,
  SUPPORTED_PROVIDERS,
  PROVIDER_ENV_VARS,
  registry,
  ModelStringSchema,
  ProviderIdSchema,
  type ProviderId,
} from "../provider.ts";

// ── ModelStringSchema ──────────────────────────────────────────────────

describe("ModelStringSchema", () => {
  test("transforms provider/model string", () => {
    const result = ModelStringSchema.parse("anthropic/claude-sonnet-4-5");
    expect(result.provider).toBe("anthropic");
    expect(result.modelId).toBe("claude-sonnet-4-5");
    expect(result.fullId).toBe("anthropic/claude-sonnet-4-5");
  });

  test("defaults to openai when no slash", () => {
    const result = ModelStringSchema.parse("gpt-4o-mini");
    expect(result.provider).toBe("openai");
    expect(result.modelId).toBe("gpt-4o-mini");
    expect(result.fullId).toBe("openai/gpt-4o-mini");
  });

  test("rejects empty string", () => {
    const result = ModelStringSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  test("handles model with multiple slashes", () => {
    const result = ModelStringSchema.parse("openai/o1/variant");
    expect(result.provider).toBe("openai");
    expect(result.modelId).toBe("o1/variant");
  });

  test("handles provider with empty model after slash", () => {
    const result = ModelStringSchema.parse("openai/");
    expect(result.provider).toBe("openai");
    expect(result.modelId).toBe("");
  });
});

// ── ProviderIdSchema ───────────────────────────────────────────────────

describe("ProviderIdSchema", () => {
  for (const p of SUPPORTED_PROVIDERS) {
    test(`accepts "${p}"`, () => {
      expect(ProviderIdSchema.parse(p)).toBe(p);
    });
  }

  test("rejects unknown provider", () => {
    expect(ProviderIdSchema.safeParse("llama").success).toBe(false);
  });

  test("rejects empty string", () => {
    expect(ProviderIdSchema.safeParse("").success).toBe(false);
  });

  test("is case-sensitive", () => {
    expect(ProviderIdSchema.safeParse("OpenAI").success).toBe(false);
  });
});

// ── parseModel ─────────────────────────────────────────────────────────

describe("parseModel", () => {
  const cases: Array<[string, string, string, string]> = [
    ["openai/gpt-4o", "openai", "gpt-4o", "openai/gpt-4o"],
    ["anthropic/claude-sonnet-4-5", "anthropic", "claude-sonnet-4-5", "anthropic/claude-sonnet-4-5"],
    ["google/gemini-2.5-flash", "google", "gemini-2.5-flash", "google/gemini-2.5-flash"],
    ["perplexity/sonar", "perplexity", "sonar", "perplexity/sonar"],
    ["xai/grok-3", "xai", "grok-3", "xai/grok-3"],
    ["mistral/mistral-large-latest", "mistral", "mistral-large-latest", "mistral/mistral-large-latest"],
    ["groq/llama-3.3-70b-versatile", "groq", "llama-3.3-70b-versatile", "groq/llama-3.3-70b-versatile"],
    ["deepseek/deepseek-chat", "deepseek", "deepseek-chat", "deepseek/deepseek-chat"],
    ["cohere/command-r-plus", "cohere", "command-r-plus", "cohere/command-r-plus"],
  ];

  for (const [input, provider, modelId, fullId] of cases) {
    test(`parses "${input}"`, () => {
      const result = parseModel(input);
      expect(result.provider).toBe(provider);
      expect(result.modelId).toBe(modelId);
      expect(result.fullId).toBe(fullId);
    });
  }

  test("defaults to openai when no provider prefix", () => {
    const result = parseModel("gpt-4o-mini");
    expect(result.provider).toBe("openai");
    expect(result.modelId).toBe("gpt-4o-mini");
    expect(result.fullId).toBe("openai/gpt-4o-mini");
  });

  test("handles model with multiple slashes", () => {
    const result = parseModel("openai/gpt-4o/some-variant");
    expect(result.provider).toBe("openai");
    expect(result.modelId).toBe("gpt-4o/some-variant");
  });

  test("throws on empty string (zod min length)", () => {
    expect(() => parseModel("")).toThrow();
  });
});

// ── SUPPORTED_PROVIDERS ────────────────────────────────────────────────

describe("SUPPORTED_PROVIDERS", () => {
  test("has exactly 10 providers", () => {
    expect(SUPPORTED_PROVIDERS).toHaveLength(10);
  });

  test("includes all expected providers", () => {
    const expected: ProviderId[] = ["openai", "anthropic", "google", "perplexity", "xai", "mistral", "groq", "deepseek", "cohere", "openrouter"];
    for (const p of expected) {
      expect(SUPPORTED_PROVIDERS).toContain(p);
    }
  });

  test("is a readonly tuple", () => {
    // @ts-expect-error -- should not allow push on readonly
    expect(() => (SUPPORTED_PROVIDERS as string[]).push("test")).toThrow();
  });
});

// ── PROVIDER_ENV_VARS ──────────────────────────────────────────────────

describe("PROVIDER_ENV_VARS", () => {
  test("maps every provider to an env var", () => {
    for (const provider of SUPPORTED_PROVIDERS) {
      expect(PROVIDER_ENV_VARS[provider]).toBeDefined();
      expect(typeof PROVIDER_ENV_VARS[provider]).toBe("string");
      expect(PROVIDER_ENV_VARS[provider].length).toBeGreaterThan(0);
    }
  });

  const expected: Record<ProviderId, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_GENERATIVE_AI_API_KEY",
    perplexity: "PERPLEXITY_API_KEY",
    xai: "XAI_API_KEY",
    mistral: "MISTRAL_API_KEY",
    groq: "GROQ_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    cohere: "COHERE_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };

  for (const [provider, envVar] of Object.entries(expected)) {
    test(`${provider} → ${envVar}`, () => {
      expect(PROVIDER_ENV_VARS[provider as ProviderId]).toBe(envVar);
    });
  }
});

// ── registry ───────────────────────────────────────────────────────────

describe("registry", () => {
  test("is defined", () => {
    expect(registry).toBeDefined();
  });

  test("has languageModel method", () => {
    expect(typeof registry.languageModel).toBe("function");
  });
});

// ── resolveModel ───────────────────────────────────────────────────────

describe("resolveModel", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const providerCases: Array<{ provider: ProviderId; model: string; envVar: string; expectedModelId: string }> = [
    { provider: "openai", model: "openai/gpt-4o", envVar: "OPENAI_API_KEY", expectedModelId: "gpt-4o" },
    { provider: "anthropic", model: "anthropic/claude-sonnet-4-5", envVar: "ANTHROPIC_API_KEY", expectedModelId: "claude-sonnet-4-5" },
    { provider: "google", model: "google/gemini-2.5-flash", envVar: "GOOGLE_GENERATIVE_AI_API_KEY", expectedModelId: "gemini-2.5-flash" },
    { provider: "perplexity", model: "perplexity/sonar", envVar: "PERPLEXITY_API_KEY", expectedModelId: "sonar" },
    { provider: "xai", model: "xai/grok-3", envVar: "XAI_API_KEY", expectedModelId: "grok-3" },
    { provider: "mistral", model: "mistral/mistral-large-latest", envVar: "MISTRAL_API_KEY", expectedModelId: "mistral-large-latest" },
    { provider: "groq", model: "groq/llama-3.3-70b-versatile", envVar: "GROQ_API_KEY", expectedModelId: "llama-3.3-70b-versatile" },
    { provider: "deepseek", model: "deepseek/deepseek-chat", envVar: "DEEPSEEK_API_KEY", expectedModelId: "deepseek-chat" },
    { provider: "cohere", model: "cohere/command-r-plus", envVar: "COHERE_API_KEY", expectedModelId: "command-r-plus" },
  ];

  for (const { provider, model, envVar, expectedModelId } of providerCases) {
    test(`resolves ${provider} model when API key is set`, () => {
      process.env[envVar] = "test-key";
      const m = resolveModel(model);
      expect(m).toBeDefined();
      expect(m.modelId).toBe(expectedModelId);
    });
  }

  test("resolves model without prefix using openai as default", () => {
    process.env.OPENAI_API_KEY = "test-key";
    const m = resolveModel("gpt-4o-mini");
    expect(m).toBeDefined();
    expect(m.modelId).toBe("gpt-4o-mini");
  });
});

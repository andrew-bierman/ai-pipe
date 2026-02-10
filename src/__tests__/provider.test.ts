import { test, expect, describe, afterEach } from "bun:test";
import {
  parseModel,
  resolveModel,
  SUPPORTED_PROVIDERS,
  PROVIDER_ENV_VARS,
  registry,
} from "../provider.ts";

describe("parseModel", () => {
  test("parses provider/model format", () => {
    const result = parseModel("anthropic/claude-sonnet-4-5");
    expect(result.provider).toBe("anthropic");
    expect(result.modelId).toBe("claude-sonnet-4-5");
    expect(result.fullId).toBe("anthropic/claude-sonnet-4-5");
  });

  test("parses openai/gpt-4o", () => {
    const result = parseModel("openai/gpt-4o");
    expect(result.provider).toBe("openai");
    expect(result.modelId).toBe("gpt-4o");
  });

  test("parses google/gemini-2.5-flash", () => {
    const result = parseModel("google/gemini-2.5-flash");
    expect(result.provider).toBe("google");
    expect(result.modelId).toBe("gemini-2.5-flash");
  });

  test("parses perplexity/sonar", () => {
    const result = parseModel("perplexity/sonar");
    expect(result.provider).toBe("perplexity");
    expect(result.modelId).toBe("sonar");
  });

  test("parses xai/grok-3", () => {
    const result = parseModel("xai/grok-3");
    expect(result.provider).toBe("xai");
    expect(result.modelId).toBe("grok-3");
  });

  test("parses mistral/mistral-large-latest", () => {
    const result = parseModel("mistral/mistral-large-latest");
    expect(result.provider).toBe("mistral");
    expect(result.modelId).toBe("mistral-large-latest");
  });

  test("parses groq/llama-3.3-70b-versatile", () => {
    const result = parseModel("groq/llama-3.3-70b-versatile");
    expect(result.provider).toBe("groq");
    expect(result.modelId).toBe("llama-3.3-70b-versatile");
  });

  test("parses deepseek/deepseek-chat", () => {
    const result = parseModel("deepseek/deepseek-chat");
    expect(result.provider).toBe("deepseek");
    expect(result.modelId).toBe("deepseek-chat");
  });

  test("parses cohere/command-r-plus", () => {
    const result = parseModel("cohere/command-r-plus");
    expect(result.provider).toBe("cohere");
    expect(result.modelId).toBe("command-r-plus");
  });

  test("defaults to openai when no provider prefix", () => {
    const result = parseModel("gpt-4o-mini");
    expect(result.provider).toBe("openai");
    expect(result.modelId).toBe("gpt-4o-mini");
    expect(result.fullId).toBe("openai/gpt-4o-mini");
  });

  test("handles model IDs with multiple slashes", () => {
    const result = parseModel("openai/gpt-4o/some-variant");
    expect(result.provider).toBe("openai");
    expect(result.modelId).toBe("gpt-4o/some-variant");
  });
});

describe("SUPPORTED_PROVIDERS", () => {
  test("includes all expected providers", () => {
    expect(SUPPORTED_PROVIDERS).toContain("openai");
    expect(SUPPORTED_PROVIDERS).toContain("anthropic");
    expect(SUPPORTED_PROVIDERS).toContain("google");
    expect(SUPPORTED_PROVIDERS).toContain("perplexity");
    expect(SUPPORTED_PROVIDERS).toContain("xai");
    expect(SUPPORTED_PROVIDERS).toContain("mistral");
    expect(SUPPORTED_PROVIDERS).toContain("groq");
    expect(SUPPORTED_PROVIDERS).toContain("deepseek");
    expect(SUPPORTED_PROVIDERS).toContain("cohere");
  });

  test("has 9 providers", () => {
    expect(SUPPORTED_PROVIDERS).toHaveLength(9);
  });
});

describe("PROVIDER_ENV_VARS", () => {
  test("maps every provider to an env var", () => {
    for (const provider of SUPPORTED_PROVIDERS) {
      expect(PROVIDER_ENV_VARS[provider]).toBeDefined();
      expect(typeof PROVIDER_ENV_VARS[provider]).toBe("string");
    }
  });

  test("has correct env var for each provider", () => {
    expect(PROVIDER_ENV_VARS.openai).toBe("OPENAI_API_KEY");
    expect(PROVIDER_ENV_VARS.anthropic).toBe("ANTHROPIC_API_KEY");
    expect(PROVIDER_ENV_VARS.google).toBe("GOOGLE_GENERATIVE_AI_API_KEY");
    expect(PROVIDER_ENV_VARS.perplexity).toBe("PERPLEXITY_API_KEY");
    expect(PROVIDER_ENV_VARS.xai).toBe("XAI_API_KEY");
    expect(PROVIDER_ENV_VARS.mistral).toBe("MISTRAL_API_KEY");
    expect(PROVIDER_ENV_VARS.groq).toBe("GROQ_API_KEY");
    expect(PROVIDER_ENV_VARS.deepseek).toBe("DEEPSEEK_API_KEY");
    expect(PROVIDER_ENV_VARS.cohere).toBe("COHERE_API_KEY");
  });
});

describe("registry", () => {
  test("is defined", () => {
    expect(registry).toBeDefined();
  });

  test("has languageModel method", () => {
    expect(typeof registry.languageModel).toBe("function");
  });
});

describe("resolveModel", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("resolves openai model when API key is set", () => {
    process.env.OPENAI_API_KEY = "test-key";
    const model = resolveModel("openai/gpt-4o");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("gpt-4o");
  });

  test("resolves anthropic model when API key is set", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const model = resolveModel("anthropic/claude-sonnet-4-5");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("claude-sonnet-4-5");
  });

  test("resolves google model when API key is set", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    const model = resolveModel("google/gemini-2.5-flash");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("gemini-2.5-flash");
  });

  test("resolves perplexity model when API key is set", () => {
    process.env.PERPLEXITY_API_KEY = "test-key";
    const model = resolveModel("perplexity/sonar");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("sonar");
  });

  test("resolves xai model when API key is set", () => {
    process.env.XAI_API_KEY = "test-key";
    const model = resolveModel("xai/grok-3");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("grok-3");
  });

  test("resolves model without prefix using openai as default", () => {
    process.env.OPENAI_API_KEY = "test-key";
    const model = resolveModel("gpt-4o-mini");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("gpt-4o-mini");
  });
});

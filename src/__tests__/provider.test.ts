import { afterEach, describe, expect, test } from "bun:test";
import { generateText } from "ai";
import {
  getModelEndpoint,
  getProviderConfigEnvVar,
  ModelStringSchema,
  PROVIDER_ENV_VARS,
  PROVIDER_OPTIONAL_ENV_VARS,
  type ProviderId,
  ProviderIdSchema,
  parseModel,
  registry,
  resolveModel,
  SUPPORTED_PROVIDERS,
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
    [
      "anthropic/claude-sonnet-4-5",
      "anthropic",
      "claude-sonnet-4-5",
      "anthropic/claude-sonnet-4-5",
    ],
    [
      "google/gemini-2.5-flash",
      "google",
      "gemini-2.5-flash",
      "google/gemini-2.5-flash",
    ],
    ["perplexity/sonar", "perplexity", "sonar", "perplexity/sonar"],
    ["xai/grok-3", "xai", "grok-3", "xai/grok-3"],
    [
      "mistral/mistral-large-latest",
      "mistral",
      "mistral-large-latest",
      "mistral/mistral-large-latest",
    ],
    [
      "groq/llama-3.3-70b-versatile",
      "groq",
      "llama-3.3-70b-versatile",
      "groq/llama-3.3-70b-versatile",
    ],
    [
      "deepseek/deepseek-chat",
      "deepseek",
      "deepseek-chat",
      "deepseek/deepseek-chat",
    ],
    [
      "cohere/command-r-plus",
      "cohere",
      "command-r-plus",
      "cohere/command-r-plus",
    ],
    [
      "openrouter/openrouter",
      "openrouter",
      "openrouter",
      "openrouter/openrouter",
    ],
    ["azure/azure-model-id", "azure", "azure-model-id", "azure/azure-model-id"],
    [
      "togetherai/meta-llama/Llama-3.3-70b-Instruct",
      "togetherai",
      "meta-llama/Llama-3.3-70b-Instruct",
      "togetherai/meta-llama/Llama-3.3-70b-Instruct",
    ],
    [
      "bedrock/anthropic.claude-sonnet-4-2025-02-19",
      "bedrock",
      "anthropic.claude-sonnet-4-2025-02-19",
      "bedrock/anthropic.claude-sonnet-4-2025-02-19",
    ],
    [
      "vertex/google/cloud/llama-3.1",
      "vertex",
      "google/cloud/llama-3.1",
      "vertex/google/cloud/llama-3.1",
    ],
    ["ollama/llama3", "ollama", "llama3", "ollama/llama3"],
    [
      "huggingface/meta-llama/Llama-3.3-70b-Instruct",
      "huggingface",
      "meta-llama/Llama-3.3-70b-Instruct",
      "huggingface/meta-llama/Llama-3.3-70b-Instruct",
    ],
    ["cerebras/llama3.1-8b", "cerebras", "llama3.1-8b", "cerebras/llama3.1-8b"],
    [
      "gateway/openai/gpt-4o",
      "gateway",
      "openai/gpt-4o",
      "gateway/openai/gpt-4o",
    ],
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
  test("includes all expected providers", () => {
    const expected: ProviderId[] = [
      "openai",
      "anthropic",
      "google",
      "perplexity",
      "xai",
      "mistral",
      "groq",
      "deepseek",
      "cohere",
      "deepinfra",
      "fireworks",
      "openrouter",
      "azure",
      "togetherai",
      "bedrock",
      "vertex",
      "ollama",
      "lmstudio",
      "local",
      "huggingface",
      "cerebras",
      "gateway",
      "luma",
      "fal",
      "replicate",
    ];
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
  test("maps every provider to its required env vars", () => {
    for (const provider of SUPPORTED_PROVIDERS) {
      expect(Array.isArray(PROVIDER_ENV_VARS[provider])).toBe(true);
    }
  });

  const expected: Record<ProviderId, string[]> = {
    openai: ["OPENAI_API_KEY"],
    anthropic: ["ANTHROPIC_API_KEY"],
    google: ["GOOGLE_GENERATIVE_AI_API_KEY"],
    perplexity: ["PERPLEXITY_API_KEY"],
    xai: ["XAI_API_KEY"],
    mistral: ["MISTRAL_API_KEY"],
    groq: ["GROQ_API_KEY"],
    deepseek: ["DEEPSEEK_API_KEY"],
    cohere: ["COHERE_API_KEY"],
    fireworks: ["FIREWORKS_API_KEY"],
    openrouter: ["OPENROUTER_API_KEY"],
    azure: ["AZURE_AI_API_KEY"],
    togetherai: ["TOGETHERAI_API_KEY"],
    bedrock: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    vertex: ["GOOGLE_VERTEX_PROJECT", "GOOGLE_VERTEX_LOCATION"],
    ollama: [],
    lmstudio: [],
    local: ["AI_PIPE_LOCAL_BASE_URL"],
    huggingface: ["HF_TOKEN"],
    deepinfra: ["DEEPINFRA_API_KEY"],
    cerebras: ["CEREBRAS_API_KEY"],
    gateway: ["AI_GATEWAY_API_KEY"],
    luma: ["LUMA_API_KEY"],
    fal: ["FAL_API_KEY"],
    replicate: ["REPLICATE_API_TOKEN"],
  };

  for (const [provider, envVars] of Object.entries(expected)) {
    test(`${provider} → ${envVars.join(", ")}`, () => {
      expect(PROVIDER_ENV_VARS[provider as ProviderId]).toEqual(envVars);
    });
  }

  test("maps OpenAI-compatible config entries to tokens and preserves legacy Ollama host settings", () => {
    expect(PROVIDER_OPTIONAL_ENV_VARS.ollama).toEqual(["OLLAMA_HOST"]);
    expect(getProviderConfigEnvVar("ollama")).toBe("OLLAMA_HOST");
    expect(PROVIDER_OPTIONAL_ENV_VARS.lmstudio).toEqual([
      "LM_STUDIO_BASE_URL",
      "LM_STUDIO_API_KEY",
    ]);
    expect(getProviderConfigEnvVar("lmstudio")).toBe("LM_STUDIO_API_KEY");
    expect(getProviderConfigEnvVar("local")).toBe("AI_PIPE_LOCAL_API_KEY");
  });
});

// ── ModelStringSchema edge cases ──────────────────────────────────────

describe("ModelStringSchema edge cases", () => {
  test("rejects null", () => {
    const result = ModelStringSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  test("rejects undefined", () => {
    const result = ModelStringSchema.safeParse(undefined);
    expect(result.success).toBe(false);
  });

  test("rejects number", () => {
    const result = ModelStringSchema.safeParse(123);
    expect(result.success).toBe(false);
  });

  test("rejects boolean", () => {
    const result = ModelStringSchema.safeParse(true);
    expect(result.success).toBe(false);
  });

  test("accepts single character model name", () => {
    const result = ModelStringSchema.parse("x");
    expect(result.provider).toBe("openai");
    expect(result.modelId).toBe("x");
  });

  test("handles whitespace in model string", () => {
    const result = ModelStringSchema.parse(" openai / gpt-4o ");
    expect(result.provider).toBe(" openai ");
    expect(result.modelId).toBe(" gpt-4o ");
  });

  test("handles very long model string", () => {
    const longModel = `provider/${"a".repeat(1000)}`;
    const result = ModelStringSchema.parse(longModel);
    expect(result.provider).toBe("provider");
    expect(result.modelId.length).toBe(1000);
  });
});

// ── ProviderIdSchema edge cases ──────────────────────────────────────────

describe("ProviderIdSchema edge cases", () => {
  test("rejects null", () => {
    expect(ProviderIdSchema.safeParse(null).success).toBe(false);
  });

  test("rejects number", () => {
    expect(ProviderIdSchema.safeParse(42).success).toBe(false);
  });

  test("rejects provider with trailing space", () => {
    expect(ProviderIdSchema.safeParse("openai ").success).toBe(false);
  });

  test("rejects provider with leading space", () => {
    expect(ProviderIdSchema.safeParse(" openai").success).toBe(false);
  });
});

// ── parseModel edge cases ────────────────────────────────────────────────

describe("parseModel edge cases", () => {
  test("handles slash at start", () => {
    const result = parseModel("/model");
    expect(result.provider).toBe("");
    expect(result.modelId).toBe("model");
  });

  test("handles slash at end", () => {
    const result = parseModel("openai/");
    expect(result.provider).toBe("openai");
    expect(result.modelId).toBe("");
  });

  test("handles just a slash", () => {
    const result = parseModel("/");
    expect(result.provider).toBe("");
    expect(result.modelId).toBe("");
  });
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

  const providerCases: Array<{
    provider: ProviderId;
    model: string;
    envVars: string[];
    expectedModelId: string;
  }> = [
    {
      provider: "openai",
      model: "openai/gpt-4o",
      envVars: ["OPENAI_API_KEY"],
      expectedModelId: "gpt-4o",
    },
    {
      provider: "anthropic",
      model: "anthropic/claude-sonnet-4-5",
      envVars: ["ANTHROPIC_API_KEY"],
      expectedModelId: "claude-sonnet-4-5",
    },
    {
      provider: "google",
      model: "google/gemini-2.5-flash",
      envVars: ["GOOGLE_GENERATIVE_AI_API_KEY"],
      expectedModelId: "gemini-2.5-flash",
    },
    {
      provider: "perplexity",
      model: "perplexity/sonar",
      envVars: ["PERPLEXITY_API_KEY"],
      expectedModelId: "sonar",
    },
    {
      provider: "xai",
      model: "xai/grok-3",
      envVars: ["XAI_API_KEY"],
      expectedModelId: "grok-3",
    },
    {
      provider: "mistral",
      model: "mistral/mistral-large-latest",
      envVars: ["MISTRAL_API_KEY"],
      expectedModelId: "mistral-large-latest",
    },
    {
      provider: "groq",
      model: "groq/llama-3.3-70b-versatile",
      envVars: ["GROQ_API_KEY"],
      expectedModelId: "llama-3.3-70b-versatile",
    },
    {
      provider: "deepseek",
      model: "deepseek/deepseek-chat",
      envVars: ["DEEPSEEK_API_KEY"],
      expectedModelId: "deepseek-chat",
    },
    {
      provider: "cohere",
      model: "cohere/command-r-plus",
      envVars: ["COHERE_API_KEY"],
      expectedModelId: "command-r-plus",
    },
    {
      provider: "fireworks",
      model: "fireworks/accounts/fireworks/models/deepseek-v3",
      envVars: ["FIREWORKS_API_KEY"],
      expectedModelId: "accounts/fireworks/models/deepseek-v3",
    },
    {
      provider: "openrouter",
      model: "openrouter/openrouter",
      envVars: ["OPENROUTER_API_KEY"],
      expectedModelId: "openrouter",
    },
    {
      provider: "azure",
      model: "azure/azure-model-id",
      envVars: ["AZURE_AI_API_KEY"],
      expectedModelId: "azure-model-id",
    },
    {
      provider: "togetherai",
      model: "togetherai/meta-llama/Llama-3.3-70b-Instruct",
      envVars: ["TOGETHERAI_API_KEY"],
      expectedModelId: "meta-llama/Llama-3.3-70b-Instruct",
    },
    {
      provider: "bedrock",
      model: "bedrock/anthropic.claude-sonnet-4-2025-02-19",
      envVars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
      expectedModelId: "anthropic.claude-sonnet-4-2025-02-19",
    },
    {
      provider: "vertex",
      model: "vertex/google/cloud/llama-3.1",
      envVars: ["GOOGLE_VERTEX_PROJECT", "GOOGLE_VERTEX_LOCATION"],
      expectedModelId: "google/cloud/llama-3.1",
    },
    {
      provider: "ollama",
      model: "ollama/llama3",
      envVars: [],
      expectedModelId: "llama3",
    },
    {
      provider: "huggingface",
      model: "huggingface/meta-llama/Llama-3.3-70b-Instruct",
      envVars: ["HF_TOKEN"],
      expectedModelId: "meta-llama/Llama-3.3-70b-Instruct",
    },
  ];

  for (const { provider, model, envVars, expectedModelId } of providerCases) {
    test(`resolves ${provider} model when required env vars are set`, () => {
      for (const envVar of envVars) {
        process.env[envVar] = "test-value";
      }
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

describe("local model endpoints", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("uses loopback defaults without API keys or cloud endpoint settings", () => {
    delete process.env.LM_STUDIO_BASE_URL;
    delete process.env.OLLAMA_HOST;
    expect(getModelEndpoint("lmstudio")).toBe("http://127.0.0.1:1234/v1");
    expect(getModelEndpoint("ollama")).toBe("http://127.0.0.1:11434");
    expect(getModelEndpoint("openai")).toBeUndefined();
    expect(resolveModel("lmstudio/owner/model").modelId).toBe("owner/model");
  });

  test("preserves bare Ollama host and port syntax", () => {
    process.env.OLLAMA_HOST = "localhost";
    expect(getModelEndpoint("ollama")).toBe("http://localhost:11434");
    process.env.OLLAMA_HOST = ":8080";
    expect(getModelEndpoint("ollama")).toBe("http://127.0.0.1:8080");
    process.env.OLLAMA_HOST = "localhost/proxy:123/ollama";
    expect(getModelEndpoint("ollama")).toBe(
      "http://localhost:11434/proxy:123/ollama",
    );
  });

  test("rejects invalid or credential-bearing endpoints without exposing the value", () => {
    delete process.env.AI_PIPE_LOCAL_BASE_URL;
    expect(() => registry.languageModel("local/model")).toThrow(
      "Set AI_PIPE_LOCAL_BASE_URL",
    );
    process.env.AI_PIPE_LOCAL_BASE_URL = "http://user:secret@localhost:8080/v1";
    expect(() => resolveModel("local/model")).toThrow(
      "AI_PIPE_LOCAL_BASE_URL must be an HTTP(S) base URL",
    );
  });

  test("routes configured local models to the matching endpoint and sends only its own token", async () => {
    const requests: Array<{
      path: string;
      auth: string | null;
      model: string;
    }> = [];
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const path = new URL(request.url).pathname;
        const { model } = (await request.json()) as { model: string };
        requests.push({
          path,
          auth: request.headers.get("authorization"),
          model,
        });
        if (path === "/api/chat") {
          return Response.json({
            model,
            message: { role: "assistant", content: "works" },
            done: true,
            done_reason: "stop",
          });
        }
        return Response.json({
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "works" },
              finish_reason: "stop",
            },
          ],
        });
      },
    });
    try {
      process.env.LM_STUDIO_BASE_URL = new URL("lm/v1/", server.url).href;
      process.env.AI_PIPE_LOCAL_BASE_URL = new URL(
        "custom/v1",
        server.url,
      ).href;
      process.env.OLLAMA_HOST = server.url.host;
      process.env.OPENAI_API_KEY = "cloud-only";
      process.env.LM_STUDIO_API_KEY = "lm-studio-only";
      delete process.env.AI_PIPE_LOCAL_API_KEY;
      for (const model of [
        "lmstudio/owner/model",
        "local/private-model",
        "ollama/native-model",
      ]) {
        const result = await generateText({
          model: resolveModel(model),
          prompt: "Smoke test",
          maxRetries: 0,
        });
        expect(result.text).toBe("works");
      }
      expect(requests).toEqual([
        {
          path: "/lm/v1/chat/completions",
          auth: "Bearer lm-studio-only",
          model: "owner/model",
        },
        {
          path: "/custom/v1/chat/completions",
          auth: null,
          model: "private-model",
        },
        { path: "/api/chat", auth: null, model: "native-model" },
      ]);
    } finally {
      await server.stop(true);
    }
  });
});

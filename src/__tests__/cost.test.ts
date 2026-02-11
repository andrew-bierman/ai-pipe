import { describe, expect, test } from "bun:test";
import {
  type CostInfo,
  calculateCost,
  formatCost,
  getPricing,
  type ModelPricing,
  PRICING,
  parseModelString,
} from "../cost.ts";

// ── getPricing ────────────────────────────────────────────────────────

describe("getPricing", () => {
  test("returns exact model pricing for OpenAI", () => {
    const pricing = getPricing("openai", "gpt-4o");
    expect(pricing.inputPrice).toBe(2.5);
    expect(pricing.outputPrice).toBe(10.0);
  });

  test("returns exact model pricing for Anthropic", () => {
    const pricing = getPricing("anthropic", "claude-sonnet-4-5");
    expect(pricing.inputPrice).toBe(3.0);
    expect(pricing.outputPrice).toBe(15.0);
  });

  test("returns default pricing for unknown model", () => {
    const pricing = getPricing("openai", "unknown-model");
    expect(pricing).toEqual({ inputPrice: 2.5, outputPrice: 10.0 });
  });

  test("returns zero pricing for unknown provider", () => {
    const pricing = getPricing("unknown-provider", "some-model");
    expect(pricing).toEqual({ inputPrice: 0, outputPrice: 0 });
  });

  test("returns Ollama as free (local)", () => {
    const pricing = getPricing("ollama", "llama3");
    expect(pricing.inputPrice).toBe(0);
    expect(pricing.outputPrice).toBe(0);
  });

  test("handles prefix matching", () => {
    const pricing = getPricing("openai", "gpt-4o-2024-11-20");
    expect(pricing).toEqual({ inputPrice: 2.5, outputPrice: 10.0 });
  });

  test("prefix matching is case-insensitive", () => {
    const pricing = getPricing("openai", "GPT-4O-2024-11-20");
    expect(pricing).toEqual({ inputPrice: 2.5, outputPrice: 10.0 });
  });

  test("returns default pricing when model partially matches no key", () => {
    const pricing = getPricing("anthropic", "some-new-model-v2");
    expect(pricing).toEqual({ inputPrice: 3.0, outputPrice: 15.0 });
  });

  test("returns exact model pricing for Google Gemini", () => {
    const pricing = getPricing("google", "gemini-2.5-pro");
    expect(pricing.inputPrice).toBe(1.25);
    expect(pricing.outputPrice).toBe(10.0);
  });

  test("returns exact model pricing for xAI Grok", () => {
    const pricing = getPricing("xai", "grok-3");
    expect(pricing.inputPrice).toBe(3.0);
    expect(pricing.outputPrice).toBe(15.0);
  });

  test("returns exact model pricing for Mistral", () => {
    const pricing = getPricing("mistral", "mistral-small");
    expect(pricing.inputPrice).toBe(0.1);
    expect(pricing.outputPrice).toBe(0.5);
  });

  test("returns free pricing for Mistral open-mistral-7b", () => {
    const pricing = getPricing("mistral", "open-mistral-7b");
    expect(pricing.inputPrice).toBe(0.0);
    expect(pricing.outputPrice).toBe(0.0);
  });

  test("returns exact model pricing for Groq", () => {
    const pricing = getPricing("groq", "llama-3.1-8b-instant");
    expect(pricing.inputPrice).toBe(0.04);
    expect(pricing.outputPrice).toBe(0.04);
  });

  test("returns exact model pricing for DeepSeek reasoner", () => {
    const pricing = getPricing("deepseek", "deepseek-reasoner");
    expect(pricing.inputPrice).toBe(0.55);
    expect(pricing.outputPrice).toBe(2.19);
  });

  test("returns exact model pricing for Cohere command-r-plus", () => {
    const pricing = getPricing("cohere", "command-r-plus");
    expect(pricing.inputPrice).toBe(3.0);
    expect(pricing.outputPrice).toBe(15.0);
  });

  test("returns exact model pricing for Perplexity sonar-pro", () => {
    const pricing = getPricing("perplexity", "sonar-pro");
    expect(pricing.inputPrice).toBe(5.0);
    expect(pricing.outputPrice).toBe(20.0);
  });

  test("returns exact model pricing for TogetherAI Llama", () => {
    const pricing = getPricing(
      "togetherai",
      "meta-llama/Llama-3.3-70b-Instruct",
    );
    expect(pricing.inputPrice).toBe(0.9);
    expect(pricing.outputPrice).toBe(0.9);
  });

  test("returns zero pricing for OpenRouter default (routing-dependent)", () => {
    const pricing = getPricing("openrouter", "some-model");
    expect(pricing.inputPrice).toBe(0.0);
    expect(pricing.outputPrice).toBe(0.0);
  });

  test("returns zero pricing for HuggingFace", () => {
    const pricing = getPricing("huggingface", "some-model");
    expect(pricing.inputPrice).toBe(0.0);
    expect(pricing.outputPrice).toBe(0.0);
  });

  test("returns default pricing for DeepInfra unknown model", () => {
    const pricing = getPricing("deepinfra", "some-model");
    expect(pricing.inputPrice).toBe(0.3);
    expect(pricing.outputPrice).toBe(0.6);
  });

  test("returns empty string provider as zero pricing", () => {
    const pricing = getPricing("", "model");
    expect(pricing).toEqual({ inputPrice: 0, outputPrice: 0 });
  });

  for (const provider of [
    "google",
    "perplexity",
    "xai",
    "mistral",
    "groq",
    "deepseek",
    "cohere",
    "fireworks",
    "openrouter",
    "azure",
    "togetherai",
    "bedrock",
    "vertex",
    "huggingface",
    "deepinfra",
  ]) {
    test(`has pricing for ${provider}`, () => {
      expect(PRICING[provider]).toBeDefined();
    });
  }
});

// ── calculateCost ───────────────────────────────────────────────────────

describe("calculateCost", () => {
  test("calculates cost for OpenAI GPT-4o", () => {
    const cost = calculateCost({ provider: "openai", modelId: "gpt-4o", usage: {
      inputTokens: 1000,
      outputTokens: 2000,
    }});
    expect(cost.inputCost).toBe(0.0025); // 1000/1M * $2.50
    expect(cost.outputCost).toBe(0.02); // 2000/1M * $10.00
    expect(cost.totalCost).toBe(0.0225);
  });

  test("calculates cost for Anthropic Claude", () => {
    const cost = calculateCost({ provider: "anthropic", modelId: "claude-sonnet-4-5", usage: {
      inputTokens: 5000,
      outputTokens: 10000,
    }});
    expect(cost.inputCost).toBeCloseTo(0.015, 5);
    expect(cost.outputCost).toBeCloseTo(0.15, 5);
    expect(cost.totalCost).toBeCloseTo(0.165, 5);
  });

  test("handles zero tokens", () => {
    const cost = calculateCost({ provider: "openai", modelId: "gpt-4o", usage: {
      inputTokens: 0,
      outputTokens: 0,
    }});
    expect(cost.totalCost).toBe(0);
  });

  test("handles missing usage gracefully", () => {
    const cost = calculateCost({ provider: "openai", modelId: "gpt-4o", usage: {} });
    expect(cost.totalCost).toBe(0);
    expect(cost.inputTokens).toBe(0);
    expect(cost.outputTokens).toBe(0);
  });

  test("handles Ollama (free) correctly", () => {
    const cost = calculateCost({ provider: "ollama", modelId: "llama3", usage: {
      inputTokens: 100000,
      outputTokens: 100000,
    }});
    expect(cost.totalCost).toBe(0);
  });

  test("returns correct token counts", () => {
    const cost = calculateCost({ provider: "groq", modelId: "llama-3.3-70b-versatile", usage: {
      inputTokens: 5000,
      outputTokens: 7500,
    }});
    expect(cost.inputTokens).toBe(5000);
    expect(cost.outputTokens).toBe(7500);
  });

  test("handles unknown provider with tokens", () => {
    const cost = calculateCost({ provider: "nonexistent", modelId: "model", usage: {
      inputTokens: 1000,
      outputTokens: 1000,
    }});
    expect(cost.inputCost).toBe(0);
    expect(cost.outputCost).toBe(0);
    expect(cost.totalCost).toBe(0);
    expect(cost.inputTokens).toBe(1000);
    expect(cost.outputTokens).toBe(1000);
  });

  test("handles undefined inputTokens but defined outputTokens", () => {
    const cost = calculateCost({ provider: "openai", modelId: "gpt-4o", usage: {
      outputTokens: 500,
    }});
    expect(cost.inputTokens).toBe(0);
    expect(cost.inputCost).toBe(0);
    expect(cost.outputTokens).toBe(500);
    expect(cost.outputCost).toBeGreaterThan(0);
  });

  test("handles defined inputTokens but undefined outputTokens", () => {
    const cost = calculateCost({ provider: "openai", modelId: "gpt-4o", usage: {
      inputTokens: 500,
    }});
    expect(cost.inputTokens).toBe(500);
    expect(cost.inputCost).toBeGreaterThan(0);
    expect(cost.outputTokens).toBe(0);
    expect(cost.outputCost).toBe(0);
  });

  test("calculates cost for Google Gemini Flash (cheap model)", () => {
    const cost = calculateCost({ provider: "google", modelId: "gemini-2.5-flash", usage: {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    }});
    expect(cost.inputCost).toBeCloseTo(0.075, 5);
    expect(cost.outputCost).toBeCloseTo(0.3, 5);
  });

  test("calculates cost for 1M tokens exactly", () => {
    const cost = calculateCost({ provider: "openai", modelId: "gpt-4o", usage: {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    }});
    expect(cost.inputCost).toBe(2.5);
    expect(cost.outputCost).toBe(10.0);
    expect(cost.totalCost).toBe(12.5);
  });

  test("handles very small token counts", () => {
    const cost = calculateCost({ provider: "openai", modelId: "gpt-4o", usage: {
      inputTokens: 1,
      outputTokens: 1,
    }});
    expect(cost.inputCost).toBeGreaterThan(0);
    expect(cost.outputCost).toBeGreaterThan(0);
    expect(cost.totalCost).toBeGreaterThan(0);
  });

  test("handles very large token counts", () => {
    const cost = calculateCost({ provider: "openai", modelId: "gpt-4o", usage: {
      inputTokens: 100_000_000,
      outputTokens: 100_000_000,
    }});
    expect(cost.inputCost).toBe(250);
    expect(cost.outputCost).toBe(1000);
    expect(cost.totalCost).toBe(1250);
  });
});

// ── formatCost ─────────────────────────────────────────────────────────

describe("formatCost", () => {
  test("formats simple cost", () => {
    const costInfo: CostInfo = {
      inputTokens: 1000,
      outputTokens: 2000,
      inputCost: 0.0025,
      outputCost: 0.02,
      totalCost: 0.0225,
    };
    const formatted = formatCost(costInfo);
    expect(formatted).toContain("$0.0025");
    expect(formatted).toContain("$0.0200");
    expect(formatted).toContain("$0.0225");
    expect(formatted).toContain("1,000");
    expect(formatted).toContain("2,000");
  });

  test("formats zero cost", () => {
    const costInfo: CostInfo = {
      inputTokens: 0,
      outputTokens: 0,
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
    };
    expect(formatCost(costInfo)).toBe("$0.0000 (0 tokens)");
  });

  test("formats cost with only input tokens", () => {
    const costInfo: CostInfo = {
      inputTokens: 1000,
      outputTokens: 0,
      inputCost: 0.0025,
      outputCost: 0,
      totalCost: 0.0025,
    };
    const formatted = formatCost(costInfo);
    expect(formatted).toContain("$0.0025");
    expect(formatted).toContain("1,000 in");
  });

  test("formats cost with only output tokens", () => {
    const costInfo: CostInfo = {
      inputTokens: 0,
      outputTokens: 2000,
      inputCost: 0,
      outputCost: 0.02,
      totalCost: 0.02,
    };
    const formatted = formatCost(costInfo);
    expect(formatted).toContain("$0.0200");
    expect(formatted).toContain("2,000 out");
  });

  test("handles large token counts", () => {
    const costInfo: CostInfo = {
      inputTokens: 1000000,
      outputTokens: 2000000,
      inputCost: 2.5,
      outputCost: 20.0,
      totalCost: 22.5,
    };
    const formatted = formatCost(costInfo);
    expect(formatted).toContain("1,000,000");
    expect(formatted).toContain("2,000,000");
  });

  test("formats cost with very small amounts", () => {
    const costInfo: CostInfo = {
      inputTokens: 1,
      outputTokens: 1,
      inputCost: 0.0000025,
      outputCost: 0.00001,
      totalCost: 0.0000125,
    };
    const formatted = formatCost(costInfo);
    expect(formatted).toContain("$");
    expect(formatted).toContain("1 in");
    expect(formatted).toContain("1 out");
  });

  test("format includes = sign with total cost", () => {
    const costInfo: CostInfo = {
      inputTokens: 500,
      outputTokens: 500,
      inputCost: 0.001,
      outputCost: 0.005,
      totalCost: 0.006,
    };
    const formatted = formatCost(costInfo);
    expect(formatted).toContain("=");
    expect(formatted).toContain("$0.0060");
  });

  test("format with only input does not contain + sign", () => {
    const costInfo: CostInfo = {
      inputTokens: 1000,
      outputTokens: 0,
      inputCost: 0.0025,
      outputCost: 0,
      totalCost: 0.0025,
    };
    const formatted = formatCost(costInfo);
    expect(formatted).not.toContain("+");
  });

  test("format with only output does not contain + sign", () => {
    const costInfo: CostInfo = {
      inputTokens: 0,
      outputTokens: 2000,
      inputCost: 0,
      outputCost: 0.02,
      totalCost: 0.02,
    };
    const formatted = formatCost(costInfo);
    expect(formatted).not.toContain("+");
  });
});

// ── parseModelString ───────────────────────────────────────────────────

describe("parseModelString", () => {
  test("parses provider/model format", () => {
    expect(parseModelString("openai/gpt-4o")).toEqual({
      provider: "openai",
      modelId: "gpt-4o",
    });
  });

  test("defaults to openai when no slash", () => {
    expect(parseModelString("gpt-4o-mini")).toEqual({
      provider: "openai",
      modelId: "gpt-4o-mini",
    });
  });

  test("handles model with multiple slashes", () => {
    expect(parseModelString("togetherai/meta-llama/Llama-3.3-70b")).toEqual({
      provider: "togetherai",
      modelId: "meta-llama/Llama-3.3-70b",
    });
  });

  test("handles vertex provider with slashes", () => {
    expect(parseModelString("vertex/google/cloud/llama-3.1")).toEqual({
      provider: "vertex",
      modelId: "google/cloud/llama-3.1",
    });
  });

  test("handles bedrock provider with slashes", () => {
    expect(
      parseModelString("bedrock/anthropic.claude-sonnet-4-20250514"),
    ).toEqual({
      provider: "bedrock",
      modelId: "anthropic.claude-sonnet-4-20250514",
    });
  });

  test("handles empty string (no slash)", () => {
    const result = parseModelString("");
    expect(result.provider).toBe("openai");
    expect(result.modelId).toBe("");
  });

  test("handles just a slash", () => {
    const result = parseModelString("/");
    expect(result.provider).toBe("");
    expect(result.modelId).toBe("");
  });

  test("handles slash at the end", () => {
    const result = parseModelString("openai/");
    expect(result.provider).toBe("openai");
    expect(result.modelId).toBe("");
  });

  test("handles slash at the beginning", () => {
    const result = parseModelString("/gpt-4o");
    expect(result.provider).toBe("");
    expect(result.modelId).toBe("gpt-4o");
  });

  test("handles string with only spaces (no slash)", () => {
    const result = parseModelString("   ");
    expect(result.provider).toBe("openai");
    expect(result.modelId).toBe("   ");
  });

  test("handles deeply nested model paths", () => {
    const result = parseModelString("provider/a/b/c/d/e");
    expect(result.provider).toBe("provider");
    expect(result.modelId).toBe("a/b/c/d/e");
  });
});

// ── PRICING ───────────────────────────────────────────────────────────

describe("PRICING", () => {
  test("has all supported providers", () => {
    const expectedProviders = [
      "openai",
      "anthropic",
      "google",
      "perplexity",
      "xai",
      "mistral",
      "groq",
      "deepseek",
      "cohere",
      "fireworks",
      "openrouter",
      "azure",
      "togetherai",
      "bedrock",
      "vertex",
      "ollama",
      "huggingface",
      "deepinfra",
    ];

    for (const provider of expectedProviders) {
      expect(PRICING[provider]).toBeDefined();
    }
  });

  test("each provider has default pricing", () => {
    for (const provider of Object.keys(PRICING)) {
      if (provider !== "openrouter") {
        // openrouter doesn't have default as it routes to other providers
        expect(PRICING[provider]!.default).toBeDefined();
      }
    }
  });

  test("all prices are non-negative", () => {
    for (const provider of Object.keys(PRICING)) {
      for (const model of Object.keys(PRICING[provider]!)) {
        const pricing = PRICING[provider]![model] as ModelPricing;
        expect(pricing.inputPrice).toBeGreaterThanOrEqual(0);
        expect(pricing.outputPrice).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ── Integration Tests ─────────────────────────────────────────────────

describe("Cost Calculation Integration", () => {
  test("end-to-end cost calculation for common models", () => {
    const testCases: Array<{
      provider: string;
      modelId: string;
      inputTokens: number;
      outputTokens: number;
      maxTotalCost: number;
    }> = [
      {
        provider: "openai",
        modelId: "gpt-4o",
        inputTokens: 100000,
        outputTokens: 100000,
        maxTotalCost: 1.25,
      },
      {
        provider: "anthropic",
        modelId: "claude-sonnet-4-5",
        inputTokens: 100000,
        outputTokens: 100000,
        maxTotalCost: 1.8,
      },
      {
        provider: "groq",
        modelId: "llama-3.3-70b-versatile",
        inputTokens: 1000000,
        outputTokens: 1000000,
        maxTotalCost: 1.4,
      },
    ];

    for (const {
      provider,
      modelId,
      inputTokens,
      outputTokens,
      maxTotalCost,
    } of testCases) {
      const cost = calculateCost({ provider, modelId, usage: {
        inputTokens,
        outputTokens,
      }});
      expect(cost.totalCost).toBeLessThanOrEqual(maxTotalCost);
    }
  });

  test("cost is proportional to token count", () => {
    const cost1 = calculateCost({ provider: "openai", modelId: "gpt-4o", usage: {
      inputTokens: 1000,
      outputTokens: 1000,
    }});

    const cost2 = calculateCost({ provider: "openai", modelId: "gpt-4o", usage: {
      inputTokens: 2000,
      outputTokens: 2000,
    }});

    expect(cost2.totalCost).toBe(cost1.totalCost * 2);
  });

  test("Anthropic is more expensive than Groq for same token count", () => {
    const anthropicCost = calculateCost({ provider: "anthropic", modelId: "claude-sonnet-4-5", usage: {
      inputTokens: 10000,
      outputTokens: 10000,
    }});
    const groqCost = calculateCost({ provider: "groq", modelId: "llama-3.3-70b-versatile", usage: {
      inputTokens: 10000,
      outputTokens: 10000,
    }});
    expect(anthropicCost.totalCost).toBeGreaterThan(groqCost.totalCost);
  });

  test("Ollama is always free regardless of token count", () => {
    const cost = calculateCost({ provider: "ollama", modelId: "any-model", usage: {
      inputTokens: 10_000_000,
      outputTokens: 10_000_000,
    }});
    expect(cost.totalCost).toBe(0);
  });

  test("output cost is typically higher than input cost per token", () => {
    // For most providers, output is more expensive than input
    const cost = calculateCost({ provider: "openai", modelId: "gpt-4o", usage: {
      inputTokens: 1000,
      outputTokens: 1000,
    }});
    expect(cost.outputCost).toBeGreaterThan(cost.inputCost);
  });

  test("parseModelString + calculateCost integration", () => {
    const { provider, modelId } = parseModelString("anthropic/claude-sonnet-4-5");
    const cost = calculateCost({ provider, modelId, usage: {
      inputTokens: 1000,
      outputTokens: 500,
    }});
    expect(cost.inputCost).toBeGreaterThan(0);
    expect(cost.outputCost).toBeGreaterThan(0);
    expect(cost.totalCost).toBe(cost.inputCost + cost.outputCost);
  });

  test("formatCost + calculateCost integration for zero usage", () => {
    const cost = calculateCost({ provider: "openai", modelId: "gpt-4o", usage: {} });
    const formatted = formatCost(cost);
    expect(formatted).toBe("$0.0000 (0 tokens)");
  });
});

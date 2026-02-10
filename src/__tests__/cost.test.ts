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
    const cost = calculateCost("openai", "gpt-4o", {
      inputTokens: 1000,
      outputTokens: 2000,
    });
    expect(cost.inputCost).toBe(0.0025); // 1000/1M * $2.50
    expect(cost.outputCost).toBe(0.02); // 2000/1M * $10.00
    expect(cost.totalCost).toBe(0.0225);
  });

  test("calculates cost for Anthropic Claude", () => {
    const cost = calculateCost("anthropic", "claude-sonnet-4-5", {
      inputTokens: 5000,
      outputTokens: 10000,
    });
    expect(cost.inputCost).toBeCloseTo(0.015, 5);
    expect(cost.outputCost).toBeCloseTo(0.15, 5);
    expect(cost.totalCost).toBeCloseTo(0.165, 5);
  });

  test("handles zero tokens", () => {
    const cost = calculateCost("openai", "gpt-4o", {
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(cost.totalCost).toBe(0);
  });

  test("handles missing usage gracefully", () => {
    const cost = calculateCost("openai", "gpt-4o", {});
    expect(cost.totalCost).toBe(0);
    expect(cost.inputTokens).toBe(0);
    expect(cost.outputTokens).toBe(0);
  });

  test("handles Ollama (free) correctly", () => {
    const cost = calculateCost("ollama", "llama3", {
      inputTokens: 100000,
      outputTokens: 100000,
    });
    expect(cost.totalCost).toBe(0);
  });

  test("returns correct token counts", () => {
    const cost = calculateCost("groq", "llama-3.3-70b-versatile", {
      inputTokens: 5000,
      outputTokens: 7500,
    });
    expect(cost.inputTokens).toBe(5000);
    expect(cost.outputTokens).toBe(7500);
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
      const cost = calculateCost(provider, modelId, {
        inputTokens,
        outputTokens,
      });
      expect(cost.totalCost).toBeLessThanOrEqual(maxTotalCost);
    }
  });

  test("cost is proportional to token count", () => {
    const cost1 = calculateCost("openai", "gpt-4o", {
      inputTokens: 1000,
      outputTokens: 1000,
    });

    const cost2 = calculateCost("openai", "gpt-4o", {
      inputTokens: 2000,
      outputTokens: 2000,
    });

    expect(cost2.totalCost).toBe(cost1.totalCost * 2);
  });
});

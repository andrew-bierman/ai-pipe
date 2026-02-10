// Pricing per 1M tokens (as of Feb 2025)
// Format: { inputPrice: number; outputPrice: number }
export type ModelPricing = {
  inputPrice: number; // per 1M tokens
  outputPrice: number; // per 1M tokens
};

export type ProviderPricing = Record<string, ModelPricing>;

// Provider pricing registry
export const PRICING: Record<string, ProviderPricing> = {
  openai: {
    "gpt-4o": { inputPrice: 2.5, outputPrice: 10.0 },
    "gpt-4o-mini": { inputPrice: 0.15, outputPrice: 0.6 },
    "gpt-4.5-preview": { inputPrice: 10.0, outputPrice: 30.0 },
    o1: { inputPrice: 15.0, outputPrice: 60.0 },
    "o1-mini": { inputPrice: 1.1, outputPrice: 4.4 },
    "o3-mini": { inputPrice: 1.1, outputPrice: 4.4 },
    "gpt-4o-2024-11-20": { inputPrice: 2.5, outputPrice: 10.0 },
    default: { inputPrice: 2.5, outputPrice: 10.0 },
  },
  anthropic: {
    "claude-sonnet-4-5": { inputPrice: 3.0, outputPrice: 15.0 },
    "claude-sonnet-4-20250514": { inputPrice: 3.0, outputPrice: 15.0 },
    "claude-opus-4-20250514": { inputPrice: 15.0, outputPrice: 75.0 },
    "claude-haiku-3-20250514": { inputPrice: 0.25, outputPrice: 1.25 },
    "claude-sonnet-4": { inputPrice: 3.0, outputPrice: 15.0 },
    default: { inputPrice: 3.0, outputPrice: 15.0 },
  },
  google: {
    "gemini-2.5-pro": { inputPrice: 1.25, outputPrice: 10.0 },
    "gemini-2.5-flash": { inputPrice: 0.075, outputPrice: 0.3 },
    "gemini-1.5-pro": { inputPrice: 1.25, outputPrice: 5.0 },
    "gemini-1.5-flash": { inputPrice: 0.075, outputPrice: 0.3 },
    "gemini-pro": { inputPrice: 0.5, outputPrice: 1.5 },
    default: { inputPrice: 0.5, outputPrice: 1.5 },
  },
  perplexity: {
    sonar: { inputPrice: 1.0, outputPrice: 5.0 },
    "sonar-pro": { inputPrice: 5.0, outputPrice: 20.0 },
    "sonar-deep-research": { inputPrice: 30.0, outputPrice: 40.0 },
    default: { inputPrice: 1.0, outputPrice: 5.0 },
  },
  xai: {
    "grok-3": { inputPrice: 3.0, outputPrice: 15.0 },
    "grok-3-mini": { inputPrice: 0.5, outputPrice: 0.5 },
    "grok-2": { inputPrice: 2.0, outputPrice: 10.0 },
    default: { inputPrice: 3.0, outputPrice: 15.0 },
  },
  mistral: {
    "mistral-large-latest": { inputPrice: 2.0, outputPrice: 6.0 },
    "mistral-medium": { inputPrice: 0.5, outputPrice: 1.5 },
    "mistral-small": { inputPrice: 0.1, outputPrice: 0.5 },
    "open-mistral-7b": { inputPrice: 0.0, outputPrice: 0.0 }, // Free
    default: { inputPrice: 2.0, outputPrice: 6.0 },
  },
  groq: {
    "llama-3.3-70b-versatile": { inputPrice: 0.59, outputPrice: 0.79 },
    "llama-3.1-8b-instant": { inputPrice: 0.04, outputPrice: 0.04 },
    "llama-3.3-70b-specdec": { inputPrice: 0.59, outputPrice: 0.79 },
    "mixtral-8x7b-32768": { inputPrice: 0.24, outputPrice: 0.24 },
    default: { inputPrice: 0.59, outputPrice: 0.79 },
  },
  deepseek: {
    "deepseek-chat": { inputPrice: 0.14, outputPrice: 0.28 },
    "deepseek-reasoner": { inputPrice: 0.55, outputPrice: 2.19 },
    default: { inputPrice: 0.14, outputPrice: 0.28 },
  },
  cohere: {
    "command-r-plus": { inputPrice: 3.0, outputPrice: 15.0 },
    "command-r": { inputPrice: 0.5, outputPrice: 1.5 },
    default: { inputPrice: 0.5, outputPrice: 1.5 },
  },
  fireworks: {
    default: { inputPrice: 0.3, outputPrice: 1.0 },
  },
  openrouter: {
    // OpenRouter routes to various providers, use provider-specific pricing
    default: { inputPrice: 0.0, outputPrice: 0.0 }, // Requires routing info
  },
  azure: {
    // Azure pricing varies by deployment
    default: { inputPrice: 2.5, outputPrice: 10.0 },
  },
  togetherai: {
    "meta-llama/Llama-3.3-70b-Instruct": { inputPrice: 0.9, outputPrice: 0.9 },
    "meta-llama/Llama-3.1-405b-instruct": { inputPrice: 5.0, outputPrice: 5.0 },
    default: { inputPrice: 0.9, outputPrice: 0.9 },
  },
  bedrock: {
    // Bedrock pricing varies by region and deployment
    default: { inputPrice: 2.5, outputPrice: 10.0 },
  },
  vertex: {
    default: { inputPrice: 2.5, outputPrice: 10.0 },
  },
  ollama: {
    // Ollama runs locally
    default: { inputPrice: 0.0, outputPrice: 0.0 },
  },
  huggingface: {
    // HuggingFace inference pricing varies
    default: { inputPrice: 0.0, outputPrice: 0.0 },
  },
  deepinfra: {
    default: { inputPrice: 0.3, outputPrice: 0.6 },
  },
};

export interface CostInfo {
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

export interface UsageInfo {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputTokenDetails?: {
    noCacheTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  outputTokenDetails?: {
    textTokens?: number;
    reasoningTokens?: number;
  };
}

/**
 * Get pricing for a specific provider and model
 */
export function getPricing(provider: string, modelId: string): ModelPricing {
  const providerPricing = PRICING[provider];

  if (!providerPricing) {
    return { inputPrice: 0, outputPrice: 0 };
  }

  // Try exact model match first
  if (providerPricing[modelId]) {
    return providerPricing[modelId];
  }

  // Try prefix match (e.g., "gpt-4o-2024-11-20" matches "gpt-4o")
  for (const [key, pricing] of Object.entries(providerPricing)) {
    if (
      key !== "default" &&
      modelId.toLowerCase().startsWith(key.toLowerCase())
    ) {
      return pricing;
    }
  }

  // Return default pricing if available
  if (providerPricing.default) {
    return providerPricing.default;
  }

  return { inputPrice: 0, outputPrice: 0 };
}

/**
 * Calculate cost from token usage
 */
export function calculateCost(
  provider: string,
  modelId: string,
  usage: UsageInfo,
): CostInfo {
  const pricing = getPricing(provider, modelId);
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPrice;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPrice;
  const totalCost = inputCost + outputCost;

  return {
    inputTokens,
    outputTokens,
    inputCost,
    outputCost,
    totalCost,
  };
}

/**
 * Format cost for display
 */
export function formatCost(costInfo: CostInfo): string {
  const parts: string[] = [];

  if (costInfo.inputTokens > 0) {
    parts.push(
      `$${costInfo.inputCost.toFixed(4)} (${costInfo.inputTokens.toLocaleString()} in)`,
    );
  }

  if (costInfo.outputTokens > 0) {
    parts.push(
      `$${costInfo.outputCost.toFixed(4)} (${costInfo.outputTokens.toLocaleString()} out)`,
    );
  }

  if (parts.length === 0) {
    return "$0.0000 (0 tokens)";
  }

  return `${parts.join(" + ")} = $${costInfo.totalCost.toFixed(4)}`;
}

/**
 * Parse model string to extract provider and model ID
 */
export function parseModelString(modelString: string): {
  provider: string;
  modelId: string;
} {
  const slashIndex = modelString.indexOf("/");
  if (slashIndex === -1) {
    return { provider: "openai", modelId: modelString };
  }
  return {
    provider: modelString.slice(0, slashIndex),
    modelId: modelString.slice(slashIndex + 1),
  };
}

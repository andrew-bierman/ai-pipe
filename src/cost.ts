/** Number of tokens per pricing unit (pricing is per 1M tokens) */
const TOKENS_PER_UNIT = 1_000_000;

/** Default pricing for unknown providers/models */
const ZERO_PRICING: ModelPricing = Object.freeze({ inputPrice: 0, outputPrice: 0 });

/** Cost decimal precision for formatting */
const COST_DECIMAL_PLACES = 4;

/**
 * Pricing per 1M tokens for a single model.
 * Prices are in USD.
 */
export interface ModelPricing {
  /** Cost in USD per 1M input tokens. */
  readonly inputPrice: number;
  /** Cost in USD per 1M output tokens. */
  readonly outputPrice: number;
}

/** Map of model IDs to their pricing. Each provider should include a "default" entry. */
export type ProviderPricing = Record<string, ModelPricing>;

/**
 * Provider pricing registry.
 *
 * Maps provider IDs to per-model pricing. Each provider should include a
 * "default" entry used as a fallback when an exact or prefix model match
 * is not found. Prices are in USD per 1M tokens (as of Feb 2025).
 */
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

/** Calculated cost breakdown for a single LLM request. */
export interface CostInfo {
  /** Number of input (prompt) tokens consumed. */
  readonly inputTokens: number;
  /** Number of output (completion) tokens generated. */
  readonly outputTokens: number;
  /** Cost in USD for input tokens. */
  readonly inputCost: number;
  /** Cost in USD for output tokens. */
  readonly outputCost: number;
  /** Total cost in USD (inputCost + outputCost). */
  readonly totalCost: number;
}

/** Token usage information returned by the AI SDK. */
export interface UsageInfo {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly inputTokenDetails?: {
    readonly noCacheTokens?: number;
    readonly cacheReadTokens?: number;
    readonly cacheWriteTokens?: number;
  };
  readonly outputTokenDetails?: {
    readonly textTokens?: number;
    readonly reasoningTokens?: number;
  };
}

/**
 * Look up pricing for a specific provider and model.
 *
 * Resolution order: exact model ID match, then prefix match (e.g.,
 * "gpt-4o-2024-11-20" matches the "gpt-4o" entry), then the provider's
 * "default" entry, then zero pricing as a final fallback.
 *
 * @param provider - Provider ID (e.g., "openai", "anthropic").
 * @param modelId - Model identifier within the provider (e.g., "gpt-4o").
 * @returns The resolved pricing for the model.
 */
export function getPricing(provider: string, modelId: string): ModelPricing {
  const providerPricing = PRICING[provider];

  if (!providerPricing) {
    return ZERO_PRICING;
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

  return ZERO_PRICING;
}

export interface CalculateCostOptions {
  provider: string;
  modelId: string;
  usage: UsageInfo;
}

/**
 * Calculate the USD cost of an LLM request from token usage.
 * Breaking change (pre-1.0): signature changed from positional args to object param.
 *
 * @param options - Object containing provider, modelId, and usage.
 * @returns A breakdown of input cost, output cost, and total cost.
 */
export function calculateCost({
  provider,
  modelId,
  usage,
}: CalculateCostOptions): CostInfo {
  const pricing = getPricing(provider, modelId);
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;

  const inputCost = (inputTokens / TOKENS_PER_UNIT) * pricing.inputPrice;
  const outputCost = (outputTokens / TOKENS_PER_UNIT) * pricing.outputPrice;
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
 * Format a cost breakdown into a human-readable string for terminal display.
 *
 * Examples:
 * - `"$0.0025 (1,000 in) + $0.0200 (2,000 out) = $0.0225"`
 * - `"$0.0000 (0 tokens)"`
 *
 * @param costInfo - The calculated cost breakdown to format.
 * @returns A formatted cost string suitable for display on stderr.
 */
export function formatCost(costInfo: CostInfo): string {
  const parts: string[] = [];

  if (costInfo.inputTokens > 0) {
    parts.push(
      `$${costInfo.inputCost.toFixed(COST_DECIMAL_PLACES)} (${costInfo.inputTokens.toLocaleString()} in)`,
    );
  }

  if (costInfo.outputTokens > 0) {
    parts.push(
      `$${costInfo.outputCost.toFixed(COST_DECIMAL_PLACES)} (${costInfo.outputTokens.toLocaleString()} out)`,
    );
  }

  if (parts.length === 0) {
    return "$0.0000 (0 tokens)";
  }

  return `${parts.join(" + ")} = $${costInfo.totalCost.toFixed(COST_DECIMAL_PLACES)}`;
}

/**
 * Parse a "provider/model-id" string into its component parts.
 *
 * If no slash is present, defaults to "openai" as the provider.
 * Only the first slash is used as a delimiter, so model IDs containing
 * slashes (e.g., "togetherai/meta-llama/Llama-3.3-70b") are handled correctly.
 *
 * @param modelString - The model string to parse (e.g., "openai/gpt-4o").
 * @returns An object with `provider` and `modelId` fields.
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

import { bedrock } from "@ai-sdk/amazon-bedrock";
import { anthropic } from "@ai-sdk/anthropic";
import { azure } from "@ai-sdk/azure";
import { cohere } from "@ai-sdk/cohere";
import { deepinfra } from "@ai-sdk/deepinfra";
import { deepseek } from "@ai-sdk/deepseek";
import { fireworks } from "@ai-sdk/fireworks";
import { google } from "@ai-sdk/google";
import { vertex } from "@ai-sdk/google-vertex";
import { groq } from "@ai-sdk/groq";
import { huggingface } from "@ai-sdk/huggingface";
import { mistral } from "@ai-sdk/mistral";
import { openai } from "@ai-sdk/openai";
import { perplexity } from "@ai-sdk/perplexity";
import type { ProviderV3 } from "@ai-sdk/provider";
import { togetherai } from "@ai-sdk/togetherai";
import { xai } from "@ai-sdk/xai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { createProviderRegistry } from "ai";
import { ollama } from "ai-sdk-ollama";
import { z } from "zod";

import { APP } from "./constants.ts";

const openrouterProvider = openrouter as unknown as ProviderV3;

/**
 * Central AI SDK provider registry.
 *
 * All supported LLM providers are registered here using the Vercel AI SDK's
 * `createProviderRegistry`. Models are resolved via "provider/model-id" strings
 * with "/" as the separator.
 */
export const registry = createProviderRegistry(
  {
    openai,
    anthropic,
    google,
    perplexity,
    xai,
    mistral,
    groq,
    deepseek,
    cohere,
    fireworks,
    openrouter: openrouterProvider,
    azure,
    togetherai,
    bedrock,
    vertex,
    ollama,
    huggingface,
    deepinfra,
  },
  { separator: "/" },
);

/** Frozen tuple of all supported provider IDs. Used for validation and iteration. */
export const SUPPORTED_PROVIDERS = Object.freeze([
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
] as const);

/** Zod schema for validating a provider ID against the supported providers list. */
export const ProviderIdSchema = z.enum(SUPPORTED_PROVIDERS);

/** Union type of all valid provider identifiers. */
export type ProviderId = z.infer<typeof ProviderIdSchema>;

/**
 * Map of provider IDs to their required environment variable names.
 *
 * Most providers require a single API key, but some (e.g., bedrock, vertex)
 * require multiple environment variables. All variables must be set for the
 * provider to be usable.
 */
export const PROVIDER_ENV_VARS: Record<ProviderId, readonly string[]> = {
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
  ollama: ["OLLAMA_HOST"],
  huggingface: ["HF_TOKEN"],
  deepinfra: ["DEEPINFRA_API_KEY"],
} as const satisfies Record<ProviderId, readonly string[]>;

/**
 * Zod schema that parses a "provider/model-id" string into structured components.
 *
 * If no "/" is present, the provider defaults to the APP default provider (openai).
 * Only the first "/" is used as a delimiter, so model IDs containing slashes
 * (e.g., "togetherai/meta-llama/Llama-3.3-70b") are handled correctly.
 */
export const ModelStringSchema = z
  .string()
  .min(1, "Model string cannot be empty")
  .transform((val) => {
    const slashIndex = val.indexOf("/");
    if (slashIndex === -1) {
      return {
        provider: APP.defaultProvider,
        modelId: val,
        fullId: `${APP.defaultProvider}/${val}`,
      };
    }
    return {
      provider: val.slice(0, slashIndex),
      modelId: val.slice(slashIndex + 1),
      fullId: val,
    };
  });

/** Parsed model string with provider, model ID, and full ID components. */
export type ParsedModel = z.infer<typeof ModelStringSchema>;

/**
 * Parse a model string into its provider, model ID, and full ID components.
 *
 * @param modelString - A string in "provider/model-id" format (e.g., "openai/gpt-4o").
 * @returns A parsed model object.
 * @throws If the model string is empty.
 */
export function parseModel(modelString: string): ParsedModel {
  return ModelStringSchema.parse(modelString);
}

/**
 * Resolve a model string to an AI SDK LanguageModel instance.
 *
 * Validates the provider ID, checks that all required environment variables
 * are set, and returns a model instance from the provider registry.
 *
 * @param modelString - A string in "provider/model-id" format (e.g., "openai/gpt-4o").
 * @returns An AI SDK LanguageModel ready for use with `generateText`/`streamText`.
 *
 * @remarks
 * Exits the process with code 1 if the provider is unknown or required
 * environment variables are missing. Error messages are written to stderr
 * with actionable guidance.
 */
export function resolveModel(modelString: string) {
  const { provider, fullId } = parseModel(modelString);

  const result = ProviderIdSchema.safeParse(provider);
  if (!result.success) {
    const supported = SUPPORTED_PROVIDERS.join(", ");
    console.error(
      `Error: Unknown provider "${provider}". Supported providers: ${supported}. Run "ai-pipe --providers" to see full list with API key status.`,
    );
    process.exit(1);
  }

  const envVars = PROVIDER_ENV_VARS[result.data];
  const missingVars = envVars.filter((v) => !process.env[v]);

  if (missingVars.length > 0) {
    console.error(
      `Error: Missing required environment variable(s): ${missingVars.join(", ")}. Set them with: export ${missingVars[0]}=<your-key>. Or add the key to ~/.ai-pipe/apiKeys.json.`,
    );
    process.exit(1);
  }

  return registry.languageModel(fullId as `${ProviderId}/${string}`);
}

/**
 * Print a formatted table of all supported providers, their required
 * environment variables, and whether those variables are currently set.
 *
 * Output is written to stdout and intended for the `--providers` CLI flag.
 */
export function printProviders(): void {
  const maxName = Math.max(...SUPPORTED_PROVIDERS.map((p) => p.length));
  const maxVar = Math.max(
    ...Object.values(PROVIDER_ENV_VARS).map((vars) => vars.join(", ").length),
  );

  console.log(
    `${"Provider".padEnd(maxName)}  ${"Env Variable(s)".padEnd(maxVar)}  Status`,
  );
  console.log(
    `${"─".repeat(maxName)}  ${"─".repeat(maxVar)}  ${"─".repeat(6)}`,
  );

  for (const provider of SUPPORTED_PROVIDERS) {
    const envVars = PROVIDER_ENV_VARS[provider];
    const envVarStr = envVars.join(", ");
    const allSet = envVars.every((v) => !!process.env[v]);
    const status = allSet ? "✓ set" : "✗ missing";
    console.log(
      `${provider.padEnd(maxName)}  ${envVarStr.padEnd(maxVar)}  ${status}`,
    );
  }
}

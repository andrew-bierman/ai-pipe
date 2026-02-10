import { bedrock } from "@ai-sdk/amazon-bedrock";
import { anthropic } from "@ai-sdk/anthropic";
import { azure } from "@ai-sdk/azure";
import { cohere } from "@ai-sdk/cohere";
import { deepinfra } from "@ai-sdk/deepinfra";
import { deepseek } from "@ai-sdk/deepseek";
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
  "openrouter",
  "azure",
  "togetherai",
  "bedrock",
  "vertex",
  "ollama",
  "huggingface",
  "deepinfra",
] as const);

export const ProviderIdSchema = z.enum(SUPPORTED_PROVIDERS);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

// Provider env vars - some providers require multiple env vars
export const PROVIDER_ENV_VARS: Record<ProviderId, string[]> = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  google: ["GOOGLE_GENERATIVE_AI_API_KEY"],
  perplexity: ["PERPLEXITY_API_KEY"],
  xai: ["XAI_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  groq: ["GROQ_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  cohere: ["COHERE_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  azure: ["AZURE_AI_API_KEY"],
  togetherai: ["TOGETHERAI_API_KEY"],
  bedrock: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
  vertex: ["GOOGLE_VERTEX_PROJECT", "GOOGLE_VERTEX_LOCATION"],
  ollama: ["OLLAMA_HOST"],
  huggingface: ["HF_TOKEN"],
  deepinfra: ["DEEPINFRA_API_KEY"],
};

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

export type ParsedModel = z.infer<typeof ModelStringSchema>;

export function parseModel(modelString: string): ParsedModel {
  return ModelStringSchema.parse(modelString);
}

export function resolveModel(modelString: string) {
  const { provider, fullId } = parseModel(modelString);

  const result = ProviderIdSchema.safeParse(provider);
  if (!result.success) {
    const supported = SUPPORTED_PROVIDERS.join(", ");
    console.error(
      `Error: Unknown provider "${provider}". Supported: ${supported}`,
    );
    process.exit(1);
  }

  const envVars = PROVIDER_ENV_VARS[result.data];
  const missingVars = envVars.filter((v) => !process.env[v]);

  if (missingVars.length > 0) {
    console.error(
      `Error: Missing required environment variable(s): ${missingVars.join(", ")}. Set them or check your provider config.`,
    );
    process.exit(1);
  }

  return registry.languageModel(fullId as `${ProviderId}/${string}`);
}

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

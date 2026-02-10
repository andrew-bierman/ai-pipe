import { z } from "zod";
import { createProviderRegistry } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { perplexity } from "@ai-sdk/perplexity";
import { xai } from "@ai-sdk/xai";
import { mistral } from "@ai-sdk/mistral";
import { groq } from "@ai-sdk/groq";
import { deepseek } from "@ai-sdk/deepseek";
import { cohere } from "@ai-sdk/cohere";

export const registry = createProviderRegistry(
  { openai, anthropic, google, perplexity, xai, mistral, groq, deepseek, cohere },
  { separator: "/" }
);

export const SUPPORTED_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "perplexity",
  "xai",
  "mistral",
  "groq",
  "deepseek",
  "cohere",
] as const;

export const ProviderIdSchema = z.enum(SUPPORTED_PROVIDERS);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const PROVIDER_ENV_VARS: Record<ProviderId, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  xai: "XAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  groq: "GROQ_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  cohere: "COHERE_API_KEY",
};

const DEFAULT_PROVIDER: ProviderId = "openai";

export const ModelStringSchema = z
  .string()
  .min(1, "Model string cannot be empty")
  .transform((val) => {
    const slashIndex = val.indexOf("/");
    if (slashIndex === -1) {
      return { provider: DEFAULT_PROVIDER, modelId: val, fullId: `${DEFAULT_PROVIDER}/${val}` };
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
      `Error: Unknown provider "${provider}". Supported: ${supported}`
    );
    process.exit(1);
  }

  const envVar = PROVIDER_ENV_VARS[result.data];
  if (!process.env[envVar]) {
    console.error(
      `Error: Missing API key. Set ${envVar} or check your provider config.`
    );
    process.exit(1);
  }

  return registry.languageModel(fullId as `${ProviderId}/${string}`);
}

export function printProviders(): void {
  const maxName = Math.max(...SUPPORTED_PROVIDERS.map((p) => p.length));
  const maxVar = Math.max(
    ...Object.values(PROVIDER_ENV_VARS).map((v) => v.length)
  );

  console.log(
    `${"Provider".padEnd(maxName)}  ${"Env Variable".padEnd(maxVar)}  Status`
  );
  console.log(`${"─".repeat(maxName)}  ${"─".repeat(maxVar)}  ${"─".repeat(6)}`);

  for (const provider of SUPPORTED_PROVIDERS) {
    const envVar = PROVIDER_ENV_VARS[provider];
    const isSet = !!process.env[envVar];
    const status = isSet ? "✓ set" : "✗ missing";
    console.log(
      `${provider.padEnd(maxName)}  ${envVar.padEnd(maxVar)}  ${status}`
    );
  }
}

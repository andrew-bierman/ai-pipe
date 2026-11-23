import { z } from "zod";
import type { Config } from "./config.ts";
import { getProviderEndpoint, ProviderIdSchema } from "./provider.ts";

const CLOUD_CATALOG_URL = "https://models.dev/api.json";
const DISCOVERY_TIMEOUT_MS = 5_000;

const CLOUD_CATALOG_IDS: Readonly<Record<string, string>> = {
  bedrock: "amazon-bedrock",
  fireworks: "fireworks-ai",
  gateway: "vercel",
  vertex: "google-vertex",
};

const OpenAIModelList = z.object({
  data: z.array(z.object({ id: z.string().min(1) })),
});
const OllamaModelList = z.object({
  models: z.array(z.object({ name: z.string().min(1) })),
});
const CloudCatalog = z.record(z.string(), z.unknown());
const CloudProviderModels = z.object({
  models: z.record(z.string(), z.unknown()),
});

async function fetchModelList(
  url: string,
  source: string,
  apiKey?: string,
): Promise<unknown> {
  const signal = AbortSignal.timeout(DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    const detail = signal.aborted
      ? "request timed out"
      : error instanceof Error
        ? error.message
        : String(error);
    throw new Error(`Could not fetch models from ${source}: ${detail}`);
  }
}

export async function listModels(
  provider: string,
  config: Config,
): Promise<string[]> {
  const configKey =
    config.apiKeys && Object.hasOwn(config.apiKeys, provider)
      ? config.apiKeys[provider]
      : undefined;
  const settings = getProviderEndpoint(
    provider,
    config.customProviders,
    configKey,
  );
  let modelIds: string[];
  if (settings?.endpoint) {
    if (provider === "ollama") {
      const payload = await fetchModelList(
        `${settings.endpoint}/api/tags`,
        provider,
      );
      const listing = OllamaModelList.safeParse(payload);
      if (!listing.success)
        throw new Error("Ollama returned an invalid model list.");
      modelIds = listing.data.models.map((model) => model.name);
    } else {
      const payload = await fetchModelList(
        `${settings.endpoint}/models`,
        provider,
        settings.endpointKey,
      );
      const listing = OpenAIModelList.safeParse(payload);
      if (!listing.success) {
        throw new Error(
          `Provider "${provider}" returned an invalid model list.`,
        );
      }
      modelIds = listing.data.data.map((model) => model.id);
    }
  } else {
    if (provider === "local") {
      throw new Error(
        "Set AI_PIPE_LOCAL_BASE_URL to list models from the local endpoint.",
      );
    }
    if (!ProviderIdSchema.safeParse(provider).success) {
      throw new Error(
        `Unknown provider "${provider}". Run ai-pipe --providers for available providers.`,
      );
    }
    const catalog = CloudCatalog.safeParse(
      await fetchModelList(CLOUD_CATALOG_URL, "Models.dev"),
    );
    if (!catalog.success)
      throw new Error("Models.dev returned an invalid catalog.");
    const catalogId = CLOUD_CATALOG_IDS[provider] ?? provider;
    const listing = CloudProviderModels.safeParse(catalog.data[catalogId]);
    if (!listing.success) {
      throw new Error(`Models.dev has no catalog for provider "${provider}".`);
    }
    modelIds = Object.keys(listing.data.models);
  }
  return [...new Set(modelIds)]
    .sort()
    .map((modelId) => `${provider}/${modelId}`);
}

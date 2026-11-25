import { createGatewayProvider } from "@ai-sdk/gateway";
import { z } from "zod";
import { APPLE_MODEL_ID, hasAppleFm } from "./apple.ts";
import type { Config } from "./config.ts";
import {
  getProviderConfigEnvVar,
  getProviderEndpoint,
  ProviderIdSchema,
} from "./provider.ts";

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

async function listCompatibleModels(
  url: string,
  provider: string,
  key?: string,
) {
  const listing = OpenAIModelList.safeParse(
    await fetchModelList(url, provider, key),
  );
  if (!listing.success)
    throw new Error(`Provider "${provider}" returned an invalid model list.`);
  return listing.data.data.map(({ id }) => id);
}

export async function detectLocalModels(config: Config): Promise<string[]> {
  const providers = [
    "lmstudio",
    "ollama",
    ...Object.keys(config.customProviders ?? {}),
  ];
  if (process.env.AI_PIPE_LOCAL_BASE_URL) providers.push("local");
  if (hasAppleFm()) providers.push("apple");
  const results = await Promise.allSettled(
    providers.map((provider) => listModels(provider, config)),
  );
  return results
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .sort();
}

export async function listModels(
  provider: string,
  config: Config,
): Promise<string[]> {
  if (provider === "apple") {
    if (!hasAppleFm()) {
      throw new Error(
        "apple/on-device requires macOS 27 and the built-in /usr/bin/fm.",
      );
    }
    return [`apple/${APPLE_MODEL_ID}`];
  }
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
      modelIds = await listCompatibleModels(
        `${settings.endpoint}/models`,
        provider,
        settings.endpointKey,
      );
    }
  } else {
    if (provider === "local") {
      throw new Error(
        "Set AI_PIPE_LOCAL_BASE_URL to list models from the local endpoint.",
      );
    }
    const builtIn = ProviderIdSchema.safeParse(provider);
    if (!builtIn.success) {
      throw new Error(
        `Unknown provider "${provider}". Run ai-pipe --providers for available providers.`,
      );
    }
    const keyEnv = getProviderConfigEnvVar(builtIn.data);
    const apiKey = (keyEnv ? process.env[keyEnv] : undefined) || configKey;
    if (provider === "openai" && apiKey) {
      const baseURL =
        process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, "") ||
        "https://api.openai.com/v1";
      modelIds = await listCompatibleModels(
        `${baseURL}/models`,
        provider,
        apiKey,
      );
    } else if (provider === "openrouter") {
      modelIds = await listCompatibleModels(
        "https://openrouter.ai/api/v1/models",
        provider,
        apiKey,
      );
    } else if (provider === "gateway" && apiKey) {
      const gateway = createGatewayProvider({
        apiKey,
        fetch: Object.assign(
          (
            input: Parameters<typeof fetch>[0],
            init?: Parameters<typeof fetch>[1],
          ) => {
            const timeout = AbortSignal.timeout(DISCOVERY_TIMEOUT_MS);
            const signal = init?.signal
              ? AbortSignal.any([init.signal, timeout])
              : timeout;
            return fetch(input, { ...init, signal });
          },
          { preconnect: fetch.preconnect },
        ),
      });
      modelIds = (await gateway.getAvailableModels()).models.map(
        ({ id }) => id,
      );
    } else {
      const catalog = CloudCatalog.safeParse(
        await fetchModelList(CLOUD_CATALOG_URL, "Models.dev"),
      );
      if (!catalog.success)
        throw new Error("Models.dev returned an invalid catalog.");
      const catalogId = CLOUD_CATALOG_IDS[provider] ?? provider;
      const listing = CloudProviderModels.safeParse(catalog.data[catalogId]);
      if (!listing.success) {
        throw new Error(
          `Models.dev has no catalog for provider "${provider}".`,
        );
      }
      modelIds = Object.keys(listing.data.models);
    }
  }
  return [...new Set(modelIds)]
    .filter(
      (id) =>
        id.trim() &&
        Bun.stripANSI(id) === id &&
        !id.includes("\n") &&
        !id.includes("\r"),
    )
    .sort()
    .map((modelId) => `${provider}/${modelId}`);
}

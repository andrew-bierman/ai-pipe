import { join } from "node:path";

import * as p from "@clack/prompts";
import pkg from "../package.json";
import { APP } from "./constants.ts";
import {
  PROVIDER_ENV_VARS,
  type ProviderId,
  SUPPORTED_PROVIDERS,
} from "./provider.ts";

const HOME_DIR = Bun.env.HOME ?? Bun.env.USERPROFILE ?? "";
const CONFIG_DIR = join(HOME_DIR, APP.configDirName);
const CONFIG_PATH = join(CONFIG_DIR, APP.configFile);
const API_KEYS_PATH = join(CONFIG_DIR, APP.apiKeysFile);

/**
 * Display names for providers, used in the selection UI.
 */
const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  perplexity: "Perplexity",
  xai: "xAI (Grok)",
  mistral: "Mistral AI",
  groq: "Groq",
  deepseek: "DeepSeek",
  cohere: "Cohere",
  fireworks: "Fireworks AI",
  openrouter: "OpenRouter",
  azure: "Azure AI",
  togetherai: "Together AI",
  bedrock: "Amazon Bedrock",
  vertex: "Google Vertex AI",
  ollama: "Ollama (Local)",
  huggingface: "Hugging Face",
  deepinfra: "DeepInfra",
};

/**
 * Popular models per provider, used for default model suggestions.
 */
const POPULAR_MODELS: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: "openai/gpt-4o", label: "GPT-4o (recommended)" },
    { value: "openai/gpt-4o-mini", label: "GPT-4o Mini (fast, cheap)" },
    { value: "openai/o3-mini", label: "o3-mini (reasoning)" },
  ],
  anthropic: [
    {
      value: "anthropic/claude-sonnet-4-5",
      label: "Claude Sonnet 4.5 (recommended)",
    },
    { value: "anthropic/claude-haiku-3-5", label: "Claude 3.5 Haiku (fast)" },
    {
      value: "anthropic/claude-opus-4",
      label: "Claude Opus 4 (most capable)",
    },
  ],
  google: [
    {
      value: "google/gemini-2.5-flash",
      label: "Gemini 2.5 Flash (recommended)",
    },
    { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
  perplexity: [
    { value: "perplexity/sonar", label: "Sonar (recommended)" },
    { value: "perplexity/sonar-pro", label: "Sonar Pro" },
  ],
  xai: [
    { value: "xai/grok-3", label: "Grok 3 (recommended)" },
    { value: "xai/grok-3-mini", label: "Grok 3 Mini (fast)" },
  ],
  mistral: [
    {
      value: "mistral/mistral-large-latest",
      label: "Mistral Large (recommended)",
    },
    { value: "mistral/mistral-small-latest", label: "Mistral Small" },
  ],
  groq: [
    {
      value: "groq/llama-3.3-70b-versatile",
      label: "Llama 3.3 70B (recommended)",
    },
    { value: "groq/mixtral-8x7b-32768", label: "Mixtral 8x7B" },
  ],
  deepseek: [
    { value: "deepseek/deepseek-chat", label: "DeepSeek Chat (recommended)" },
    { value: "deepseek/deepseek-reasoner", label: "DeepSeek Reasoner" },
  ],
  cohere: [
    {
      value: "cohere/command-r-plus",
      label: "Command R+ (recommended)",
    },
    { value: "cohere/command-r", label: "Command R" },
  ],
  fireworks: [
    {
      value: "fireworks/accounts/fireworks/models/llama-v3p3-70b-instruct",
      label: "Llama 3.3 70B",
    },
  ],
  openrouter: [
    {
      value: "openrouter/auto",
      label: "Auto (routes to best model)",
    },
  ],
  azure: [{ value: "azure/gpt-4o", label: "GPT-4o on Azure" }],
  togetherai: [
    {
      value: "togetherai/meta-llama/Llama-3.3-70b-Instruct",
      label: "Llama 3.3 70B",
    },
  ],
  bedrock: [
    {
      value: "bedrock/anthropic.claude-sonnet-4-20250514-v1:0",
      label: "Claude Sonnet 4 on Bedrock",
    },
  ],
  vertex: [
    {
      value: "vertex/gemini-2.5-flash",
      label: "Gemini 2.5 Flash on Vertex",
    },
  ],
  ollama: [
    { value: "ollama/llama3", label: "Llama 3 (local)" },
    { value: "ollama/mistral", label: "Mistral (local)" },
  ],
  huggingface: [
    {
      value: "huggingface/meta-llama/Llama-3.3-70b-Instruct",
      label: "Llama 3.3 70B",
    },
  ],
  deepinfra: [
    {
      value: "deepinfra/meta-llama/Llama-3.3-70B-Instruct",
      label: "Llama 3.3 70B",
    },
  ],
};

/**
 * Check if a provider uses simple API key authentication
 * (single env var ending in _API_KEY or _TOKEN).
 */
function isSimpleApiKeyProvider(provider: ProviderId): boolean {
  const envVars = PROVIDER_ENV_VARS[provider];
  if (envVars.length !== 1) return false;
  const envVar = envVars[0] ?? "";
  return envVar.endsWith("_API_KEY") || envVar.endsWith("_TOKEN");
}

/**
 * Run the interactive setup wizard.
 *
 * Guides the user through provider selection, API key entry,
 * default model and temperature configuration, then writes
 * `config.json` and `apiKeys.json` to `~/.ai-pipe/`.
 */
export async function runInit(): Promise<void> {
  p.intro(`  ai-pipe v${pkg.version} - Setup Wizard  `);

  // Check if config already exists
  const configExists = await Bun.file(CONFIG_PATH).exists();
  const apiKeysExist = await Bun.file(API_KEYS_PATH).exists();

  if (configExists || apiKeysExist) {
    const existingFiles: string[] = [];
    if (configExists) existingFiles.push("config.json");
    if (apiKeysExist) existingFiles.push("apiKeys.json");

    const overwrite = await p.confirm({
      message: `Existing configuration found (${existingFiles.join(", ")}). Overwrite?`,
      initialValue: false,
    });

    if (p.isCancel(overwrite)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    if (!overwrite) {
      const merge = await p.confirm({
        message: "Merge new settings with existing config?",
        initialValue: true,
      });

      if (p.isCancel(merge)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      if (!merge) {
        p.cancel("Setup cancelled. Your existing config is unchanged.");
        process.exit(0);
      }
    }
  }

  // Step 1: Select providers
  const providers = await p.multiselect({
    message: "Which providers would you like to set up?",
    options: SUPPORTED_PROVIDERS.map((id) => ({
      value: id,
      label: PROVIDER_LABELS[id],
      hint: PROVIDER_ENV_VARS[id].join(", "),
    })),
    required: true,
  });

  if (p.isCancel(providers)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const selectedProviders = providers as ProviderId[];

  // Step 2: Collect API keys for each selected provider
  const apiKeys: Record<string, string> = {};

  for (const provider of selectedProviders) {
    if (isSimpleApiKeyProvider(provider)) {
      const envVar = PROVIDER_ENV_VARS[provider][0] as string;
      const existing = process.env[envVar];

      if (existing) {
        const useExisting = await p.confirm({
          message: `${PROVIDER_LABELS[provider]}: ${envVar} is already set in your environment. Use it?`,
          initialValue: true,
        });

        if (p.isCancel(useExisting)) {
          p.cancel("Setup cancelled.");
          process.exit(0);
        }

        if (useExisting) continue;
      }

      const apiKey = await p.password({
        message: `${PROVIDER_LABELS[provider]}: Enter your API key (${envVar})`,
        validate(value) {
          if (!value || value.trim().length === 0)
            return "API key cannot be empty";
        },
      });

      if (p.isCancel(apiKey)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      apiKeys[provider] = apiKey;
    } else {
      // For multi-env-var providers (bedrock, vertex, ollama), show guidance
      const envVars = PROVIDER_ENV_VARS[provider];
      p.log.info(
        `${PROVIDER_LABELS[provider]} requires environment variables: ${envVars.join(", ")}\nSet them in your shell profile (e.g., ~/.bashrc or ~/.zshrc).`,
      );
    }
  }

  // Step 3: Choose default model
  // Build model options from selected providers
  const modelOptions: { value: string; label: string; hint?: string }[] = [];
  for (const provider of selectedProviders) {
    const models = POPULAR_MODELS[provider];
    if (models) {
      for (const model of models) {
        modelOptions.push({
          ...model,
          hint: PROVIDER_LABELS[provider],
        });
      }
    }
  }

  let defaultModel = APP.defaultModel;
  if (modelOptions.length > 0) {
    const selected = await p.select({
      message: "Choose a default model",
      options: modelOptions,
    });

    if (p.isCancel(selected)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    defaultModel = selected as string;
  }

  // Step 4: Default temperature
  const tempInput = await p.text({
    message: "Default temperature (0-2, higher = more creative)",
    placeholder: "0.7",
    initialValue: "0.7",
    validate(value) {
      if (!value) return "Temperature is required";
      const n = Number.parseFloat(value);
      if (
        Number.isNaN(n) ||
        n < APP.temperature.min ||
        n > APP.temperature.max
      ) {
        return `Must be a number between ${APP.temperature.min} and ${APP.temperature.max}`;
      }
    },
  });

  if (p.isCancel(tempInput)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const temperature = Number.parseFloat(tempInput);

  // Step 5: Write config files
  const s = p.spinner();
  s.start("Writing configuration files");

  try {
    // Load existing configs if merging
    let existingConfig: Record<string, unknown> = {};
    let existingKeys: Record<string, unknown> = {};
    if (configExists) {
      try {
        existingConfig = (await Bun.file(CONFIG_PATH).json()) as Record<
          string,
          unknown
        >;
      } catch {
        // If existing config is invalid, start fresh
      }
    }
    if (apiKeysExist) {
      try {
        existingKeys = (await Bun.file(API_KEYS_PATH).json()) as Record<
          string,
          unknown
        >;
      } catch {
        // If existing keys file is invalid, start fresh
      }
    }

    const config = {
      ...existingConfig,
      model: defaultModel,
      temperature,
    };

    const mergedApiKeys = {
      ...existingKeys,
      ...apiKeys,
    };

    await Bun.write(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);

    if (Object.keys(mergedApiKeys).length > 0) {
      await Bun.write(
        API_KEYS_PATH,
        `${JSON.stringify(mergedApiKeys, null, 2)}\n`,
      );
    }

    s.stop("Configuration saved!");
  } catch (err) {
    s.stop("Failed to write configuration");
    p.log.error(
      `Error writing config: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  // Step 6: Show summary and examples
  const configuredProviders = [
    ...new Set([
      ...Object.keys(apiKeys),
      ...selectedProviders.filter((p) => !isSimpleApiKeyProvider(p)),
    ]),
  ];

  const summaryLines = [
    `Config directory: ${CONFIG_DIR}`,
    `Default model:    ${defaultModel}`,
    `Temperature:      ${temperature}`,
    "",
    `Providers configured: ${configuredProviders.length > 0 ? configuredProviders.map((id) => PROVIDER_LABELS[id as ProviderId] ?? id).join(", ") : "(none - using env vars)"}`,
  ];

  p.note(summaryLines.join("\n"), "Configuration Summary");

  const exampleCommands = [
    `ai-pipe "What is TypeScript?"`,
    `ai-pipe -m ${defaultModel} "Write a haiku"`,
    `cat README.md | ai-pipe "Summarize this"`,
    `ai-pipe -f src/index.ts "Review this code"`,
    `ai-pipe --chat`,
    `ai-pipe config show`,
  ];

  p.note(exampleCommands.join("\n"), "Try these commands");

  p.outro("You're all set! Happy prompting.");
}

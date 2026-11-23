import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import * as p from "@clack/prompts";
import pkg from "../package.json";
import { APP } from "./constants.ts";
import {
  PROVIDER_ENV_VARS,
  PROVIDER_OPTIONAL_ENV_VARS,
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
  lmstudio: "LM Studio",
  local: "OpenAI-compatible endpoint",
  huggingface: "Hugging Face",
  deepinfra: "DeepInfra",
  cerebras: "Cerebras",
  gateway: "Vercel AI Gateway",
  luma: "Luma",
  fal: "fal.ai",
  replicate: "Replicate",
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
  if (!HOME_DIR) {
    p.log.error("HOME or USERPROFILE environment variable is not set.");
    process.exit(1);
  }

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
      hint: [
        ...PROVIDER_ENV_VARS[id],
        ...(PROVIDER_OPTIONAL_ENV_VARS[id] ?? []),
      ].join(", "),
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
    } else if (
      provider === "lmstudio" ||
      provider === "local" ||
      provider === "ollama"
    ) {
      p.log.info(
        `Start your local server before making requests. See the provider guide for ${PROVIDER_LABELS[provider]} endpoint and authentication settings.`,
      );
    } else {
      const envVars = PROVIDER_ENV_VARS[provider];
      p.log.info(
        `${PROVIDER_LABELS[provider]} requires environment variables: ${envVars.join(", ")}\nSet them in your shell profile (e.g., ~/.bashrc or ~/.zshrc).`,
      );
    }
  }

  // Step 3: Choose a provider and enter a model ID.
  const selected = await p.select({
    message: "Choose the default provider",
    options: selectedProviders.map((provider) => ({
      value: provider,
      label: PROVIDER_LABELS[provider],
    })),
  });
  if (p.isCancel(selected)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  p.log.info(`Find available model IDs with: ai-pipe models ${selected}`);
  const defaultModelId = await p.text({
    message: `Model ID for ${PROVIDER_LABELS[selected]}`,
    validate: (value) => (value?.trim() ? undefined : "Enter a model ID"),
  });
  if (p.isCancel(defaultModelId)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  const defaultModel = `${selected}/${defaultModelId.trim()}`;

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

    // Ensure config directory exists with restricted permissions
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    try {
      chmodSync(CONFIG_DIR, 0o700);
    } catch {
      // Best effort
    }

    await Bun.write(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);

    if (Object.keys(mergedApiKeys).length > 0) {
      await Bun.write(
        API_KEYS_PATH,
        `${JSON.stringify(mergedApiKeys, null, 2)}\n`,
      );
      // Restrict API keys file permissions (owner read/write only)
      try {
        chmodSync(API_KEYS_PATH, 0o600);
      } catch {
        // Best effort — may fail on some platforms
      }
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

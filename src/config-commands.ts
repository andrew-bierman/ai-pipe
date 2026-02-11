import { join } from "node:path";

import { APP } from "./constants.ts";
import { PROVIDER_ENV_VARS, SUPPORTED_PROVIDERS } from "./provider.ts";

const HOME_DIR = Bun.env.HOME ?? Bun.env.USERPROFILE ?? "";
const CONFIG_DIR = join(HOME_DIR, APP.configDirName);
const CONFIG_PATH = join(CONFIG_DIR, APP.configFile);
const API_KEYS_PATH = join(CONFIG_DIR, APP.apiKeysFile);

/**
 * Known API key provider IDs. When `configSet` receives one of these
 * as a key (e.g., "openai", "anthropic"), the value is written to
 * `apiKeys.json` rather than `config.json`.
 */
const API_KEY_PROVIDERS = new Set<string>(SUPPORTED_PROVIDERS);

/**
 * Read a JSON file and return its parsed contents, or an empty object
 * if the file does not exist or contains invalid JSON.
 */
async function readJsonFile(path: string): Promise<Record<string, unknown>> {
  const file = Bun.file(path);
  if (!(await file.exists())) return {};
  try {
    return (await file.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Write an object to a JSON file, creating parent directories as needed.
 */
async function writeJsonFile(
  path: string,
  data: Record<string, unknown>,
): Promise<void> {
  await Bun.write(path, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Set a nested value in an object using dot-notation.
 *
 * Example: `setNestedValue(obj, "providers.anthropic.temperature", 0.5)`
 * creates the nested structure if it does not exist.
 */
function setNestedValue(
  obj: Record<string, unknown>,
  keyPath: string,
  value: unknown,
): void {
  const keys = keyPath.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i] as string;
    if (
      current[key] === undefined ||
      typeof current[key] !== "object" ||
      current[key] === null
    ) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = keys[keys.length - 1] as string;
  current[lastKey] = value;
}

/**
 * Coerce a string value to the appropriate type for known config keys.
 *
 * - "temperature" keys -> number (validated 0-2)
 * - "maxOutputTokens" keys -> integer (validated positive)
 * - "true"/"false" -> boolean
 * - Otherwise kept as string
 */
function coerceValue(key: string, raw: string): unknown {
  const lastKey = key.split(".").pop() ?? key;

  if (lastKey === "temperature") {
    const n = Number.parseFloat(raw);
    if (Number.isNaN(n) || n < APP.temperature.min || n > APP.temperature.max) {
      throw new Error(
        `Invalid temperature "${raw}". Must be a number between ${APP.temperature.min} and ${APP.temperature.max}.`,
      );
    }
    return n;
  }

  if (lastKey === "maxOutputTokens") {
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n) || n <= 0 || !Number.isInteger(Number(raw))) {
      throw new Error(
        `Invalid maxOutputTokens "${raw}". Must be a positive integer.`,
      );
    }
    return n;
  }

  if (raw === "true") return true;
  if (raw === "false") return false;

  return raw;
}

/**
 * Set a configuration value.
 *
 * - If the key matches a known provider ID (e.g., "openai"), the value
 *   is treated as an API key and written to `apiKeys.json`.
 * - Otherwise the key/value is written to `config.json`, supporting
 *   dot-notation for nested keys.
 *
 * @param key - The config key (e.g., "model", "temperature", "providers.anthropic.temperature", or a provider ID for API keys).
 * @param value - The string value to set.
 */
export async function configSet(key: string, value: string): Promise<void> {
  // If the key is a known provider, treat the value as an API key
  if (API_KEY_PROVIDERS.has(key)) {
    const apiKeys = await readJsonFile(API_KEYS_PATH);
    apiKeys[key] = value;
    await writeJsonFile(API_KEYS_PATH, apiKeys);
    console.log(`API key for "${key}" saved to ${API_KEYS_PATH}`);
    return;
  }

  const coerced = coerceValue(key, value);
  const config = await readJsonFile(CONFIG_PATH);
  setNestedValue(config, key, coerced);
  await writeJsonFile(CONFIG_PATH, config);
  console.log(`Set "${key}" = ${JSON.stringify(coerced)} in ${CONFIG_PATH}`);
}

/**
 * Mask a string, showing only the last 4 characters.
 *
 * Example: "sk-ant-abc123xyz789" -> "sk-...x789"
 */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

/**
 * Pretty-print the current configuration.
 *
 * Reads both `config.json` and `apiKeys.json`, masks API key values,
 * and prints a clean, readable output with aligned columns.
 */
export async function configShow(): Promise<void> {
  const config = await readJsonFile(CONFIG_PATH);
  const apiKeys = await readJsonFile(API_KEYS_PATH);

  console.log(`\n  ai-pipe configuration\n`);
  console.log(`  Config directory: ${CONFIG_DIR}`);
  console.log("");

  // Separate aliases from other settings to display in their own section
  const { aliases: configAliases, ...configWithoutAliases } = config as Record<
    string,
    unknown
  > & { aliases?: Record<string, unknown> };

  // Show config.json values (excluding aliases)
  const configEntries = flattenObject(
    configWithoutAliases as Record<string, unknown>,
  );
  if (configEntries.length > 0) {
    console.log("  Settings (config.json):");
    const maxKeyLen = Math.max(...configEntries.map(([k]) => k.length));
    for (const [k, v] of configEntries) {
      console.log(`    ${k.padEnd(maxKeyLen)}  ${formatValue(v)}`);
    }
  } else {
    console.log("  Settings (config.json): (empty)");
  }

  // Show aliases in their own section
  if (
    configAliases &&
    typeof configAliases === "object" &&
    Object.keys(configAliases).length > 0
  ) {
    console.log("");
    console.log("  Model Aliases:");
    const aliasEntries = Object.entries(configAliases);
    const maxAliasLen = Math.max(...aliasEntries.map(([k]) => k.length));
    for (const [alias, target] of aliasEntries) {
      console.log(`    ${alias.padEnd(maxAliasLen)}  -> ${String(target)}`);
    }
  }

  console.log("");

  // Show API keys (masked)
  const apiKeyEntries = Object.entries(apiKeys);
  if (apiKeyEntries.length > 0) {
    console.log("  API Keys (apiKeys.json):");
    const maxKeyLen = Math.max(...apiKeyEntries.map(([k]) => k.length));
    for (const [provider, key] of apiKeyEntries) {
      const masked = maskApiKey(String(key));
      console.log(`    ${provider.padEnd(maxKeyLen)}  ${masked}`);
    }
  } else {
    console.log("  API Keys (apiKeys.json): (none configured)");
  }

  // Show environment variable status
  console.log("");
  console.log("  Environment Variables:");
  let anyEnvSet = false;
  for (const provider of SUPPORTED_PROVIDERS) {
    const envVars = PROVIDER_ENV_VARS[provider];
    const allSet = envVars.every((v) => !!process.env[v]);
    if (allSet) {
      anyEnvSet = true;
      console.log(`    ${provider}: ${envVars.join(", ")} (set)`);
    }
  }
  if (!anyEnvSet) {
    console.log("    (no provider env vars detected)");
  }

  console.log("");
}

/**
 * Flatten an object into dot-notation key-value pairs.
 */
function flattenObject(
  obj: Record<string, unknown>,
  prefix = "",
): [string, unknown][] {
  const result: [string, unknown][] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result.push(...flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      result.push([fullKey, value]);
    }
  }
  return result;
}

/**
 * Format a value for display.
 */
function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * Reset config.json to an empty object.
 *
 * @param skipConfirmation - If true, skip the confirmation prompt (for testing).
 */
export async function configReset(skipConfirmation = false): Promise<void> {
  if (!skipConfirmation) {
    process.stdout.write(
      "This will reset config.json to defaults. API keys will not be affected.\nContinue? (y/N) ",
    );
    const reader = Bun.stdin.stream().getReader();
    const { value } = await reader.read();
    reader.releaseLock();
    const answer = value
      ? Buffer.from(value).toString("utf-8").trim().toLowerCase()
      : "";
    if (answer !== "y" && answer !== "yes") {
      console.log("Reset cancelled.");
      return;
    }
  }

  await writeJsonFile(CONFIG_PATH, {});
  console.log(`Config reset. ${CONFIG_PATH} is now empty.`);
}

/**
 * Print the path to the config directory.
 */
export function configPath(): void {
  console.log(CONFIG_DIR);
}

/**
 * Get the config directory path (for use in other modules).
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Get the config file path (for use in other modules).
 */
export function getConfigPath(): string {
  return CONFIG_PATH;
}

/**
 * Get the API keys file path (for use in other modules).
 */
export function getApiKeysPath(): string {
  return API_KEYS_PATH;
}

/**
 * Handle config subcommands from CLI args.
 *
 * @param args - The positional arguments after "config" (e.g., ["set", "model", "openai/gpt-4o"]).
 */
export async function handleConfigCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  switch (subcommand) {
    case "set": {
      const key = args[1];
      const value = args[2];
      if (!key || !value) {
        console.error(
          "Usage: ai-pipe config set <key> <value>\n\nExamples:\n  ai-pipe config set model anthropic/claude-sonnet-4-5\n  ai-pipe config set temperature 0.7\n  ai-pipe config set providers.anthropic.temperature 0.5\n  ai-pipe config set openai sk-your-api-key",
        );
        process.exit(1);
      }
      await configSet(key, value);
      break;
    }
    case "show":
      await configShow();
      break;
    case "reset":
      await configReset();
      break;
    case "path":
      configPath();
      break;
    default:
      console.error(
        "Usage: ai-pipe config <command>\n\nCommands:\n  set <key> <value>  Set a config value\n  show               Show current config\n  reset              Reset config to defaults\n  path               Print config directory path\n\nExamples:\n  ai-pipe config set model anthropic/claude-sonnet-4-5\n  ai-pipe config set temperature 0.7\n  ai-pipe config set openai sk-your-api-key\n  ai-pipe config show\n  ai-pipe config path",
      );
      process.exit(1);
  }
}

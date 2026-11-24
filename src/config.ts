import { basename, join } from "node:path";

import { z } from "zod";

import { APP } from "./constants.ts";
import {
  CustomProvidersSchema,
  ProviderIdSchema,
  parseModel,
  SUPPORTED_PROVIDERS,
} from "./provider.ts";

/** Zod schema for the API keys file. Keys must be valid provider IDs. */
const ApiKeysSchema = z
  .record(z.string(), z.string())
  .refine(
    (obj) =>
      Object.keys(obj).every((k) => ProviderIdSchema.safeParse(k).success),
    {
      message: `apiKeys keys must be valid providers: ${SUPPORTED_PROVIDERS.join(", ")}`,
    },
  );

const MillisecondsSchema = z.number().int().positive();
const GenerationSettingsSchema = z.strictObject({
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().int().positive().optional(),
  presencePenalty: z.number().optional(),
  frequencyPenalty: z.number().optional(),
  stopSequences: z.array(z.string().min(1)).optional(),
  seed: z.number().int().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  timeout: z
    .union([
      MillisecondsSchema,
      z.strictObject({
        totalMs: MillisecondsSchema.optional(),
        stepMs: MillisecondsSchema.optional(),
        chunkMs: MillisecondsSchema.optional(),
      }),
    ])
    .optional(),
  providerOptions: z
    .record(z.string(), z.record(z.string(), z.json()))
    .optional(),
});

export type GenerationSettings = z.infer<typeof GenerationSettingsSchema>;

/**
 * Zod schema for per-provider config overrides.
 *
 * Each provider entry can override model, system prompt, temperature,
 * and maxOutputTokens. All fields are optional.
 */
export const ProviderConfigSchema = z.object({
  model: z.string().optional(),
  system: z.string().optional(),
  temperature: z
    .number()
    .min(APP.temperature.min)
    .max(APP.temperature.max)
    .optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  generation: GenerationSettingsSchema.optional(),
});

/** Type for a single provider's config overrides. */
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/**
 * Zod schema for `config.json`.
 *
 * Validates model string, system prompt, temperature (within APP bounds),
 * and maxOutputTokens (positive integer). All fields are optional.
 * Supports an optional `providers` record for per-provider overrides.
 */
export const ConfigSchema = z.object({
  model: z.string().optional(),
  system: z.string().optional(),
  temperature: z
    .number()
    .min(APP.temperature.min)
    .max(APP.temperature.max)
    .optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  generation: GenerationSettingsSchema.optional(),
  providers: z.record(z.string(), ProviderConfigSchema).optional(),
  customProviders: CustomProvidersSchema.optional(),
  aliases: z.record(z.string(), z.string()).optional(),
});

/**
 * Application configuration type.
 *
 * Extends the ConfigSchema fields with an optional `apiKeys` map that is
 * loaded from a separate `apiKeys.json` file for security isolation.
 */
export type Config = z.infer<typeof ConfigSchema> & {
  apiKeys?: Record<string, string>;
  aliases?: Record<string, string>;
};

/**
 * Get provider-specific config overrides merged with global config values.
 *
 * Looks up the `providers[providerId]` section from the config and returns
 * the provider-specific values. Fields not set in the provider section are
 * omitted (callers should fall through to global config values).
 *
 * @param config - The loaded application config.
 * @param providerId - The provider identifier (e.g., "anthropic", "openai").
 * @returns The provider-specific overrides, or an empty object if none exist.
 */
export function getProviderDefaults(
  config: Config,
  providerId: string,
): ProviderConfig {
  return config.providers?.[providerId] ?? {};
}

export function getGenerationSettings(
  config: Config,
  model: string,
  maxRetries?: number,
): GenerationSettings {
  const base = config.generation;
  const override = getProviderDefaults(
    config,
    parseModel(model).provider,
  ).generation;
  const providerOptions = Object.fromEntries(
    Object.entries({
      ...base?.providerOptions,
      ...override?.providerOptions,
    }).map(([namespace, values]) => [
      namespace,
      { ...base?.providerOptions?.[namespace], ...values },
    ]),
  );
  return {
    ...base,
    ...override,
    ...(Object.keys(providerOptions).length ? { providerOptions } : {}),
    ...(maxRetries === undefined ? {} : { maxRetries }),
  };
}

/**
 * Resolve a model alias to its full model string.
 *
 * Looks up `modelString` in the config's `aliases` map. If found, returns
 * the target model string. Otherwise returns the input unchanged.
 *
 * @param config - The loaded application config.
 * @param modelString - The model string (possibly an alias) to resolve.
 * @returns The resolved model string.
 */
export function resolveAlias(config: Config, modelString: string): string {
  const aliases = config.aliases;
  return aliases && Object.hasOwn(aliases, modelString)
    ? (aliases[modelString] ?? modelString)
    : modelString;
}

const HOME_DIR = Bun.env.HOME ?? Bun.env.USERPROFILE ?? "";
if (!HOME_DIR) {
  console.warn(
    "Warning: Neither HOME nor USERPROFILE environment variable is set. Config paths may not resolve correctly.",
  );
}
const DEFAULT_CONFIG_DIR = join(HOME_DIR, APP.configDirName);

async function loadJsonFile<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    const raw = await file.json();
    return schema.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Load application configuration from a directory.
 *
 * Reads `config.json` and `apiKeys.json` from the specified directory
 * (or the default `~/.ai-pipe/` directory). Invalid or missing files are
 * silently ignored, returning an empty config.
 *
 * @param configDir - Optional path to the config directory. Defaults to `~/.ai-pipe/`.
 * @returns The merged configuration object.
 */
export async function loadConfig(configDir?: string): Promise<Config> {
  const dir = configDir ?? DEFAULT_CONFIG_DIR;

  const [settings, keys] = await Promise.all([
    loadJsonFile(join(dir, APP.configFile), z.unknown()),
    loadJsonFile(join(dir, APP.apiKeysFile), ApiKeysSchema),
  ]);

  const parsed = ConfigSchema.safeParse(settings);
  if (!parsed.success) {
    const issue = parsed.error.issues.find(
      ({ path }) =>
        path[0] === "customProviders" ||
        path[0] === "generation" ||
        (path[0] === "providers" && path[2] === "generation"),
    );
    if (issue) {
      throw new Error(
        `Invalid config.json setting ${issue.path.join(".")}: ${issue.message}`,
      );
    }
  }

  return {
    ...(parsed.data ?? {}),
    ...(keys ? { apiKeys: keys } : {}),
  };
}

const ROLES_DIR = "roles";

/**
 * Load a role's system prompt from a `.md` file in the roles directory.
 *
 * Role files are stored as `~/.ai-pipe/roles/<name>.md`. The role name is
 * sanitized to prevent path traversal attacks. If the role name includes
 * a `.md` extension, it is stripped to avoid double-extension issues.
 *
 * @param roleName - The role name (e.g., "reviewer" or "reviewer.md").
 * @param configDir - Optional config directory. Defaults to `~/.ai-pipe/`.
 * @returns The role file contents, or `null` if the role does not exist.
 */
export async function loadRole(
  roleName: string,
  configDir?: string,
): Promise<string | null> {
  const dir = configDir ?? DEFAULT_CONFIG_DIR;
  // Sanitize roleName to prevent path traversal attacks
  const sanitizedName = basename(roleName);
  // Strip .md extension if present to avoid double extension
  const nameWithoutExt = sanitizedName.replace(/\.md$/i, "");
  const rolesPath = join(dir, ROLES_DIR, nameWithoutExt);

  // Only load .md role files
  const mdFile = Bun.file(`${rolesPath}.md`);
  if (await mdFile.exists()) {
    return mdFile.text();
  }

  return null;
}

/**
 * List all available role names from the roles directory.
 *
 * Scans `~/.ai-pipe/roles/` for `.md` files and returns their names
 * (without extension), sorted alphabetically and deduplicated.
 *
 * @param configDir - Optional config directory. Defaults to `~/.ai-pipe/`.
 * @returns A sorted array of role names, or an empty array if none exist.
 */
export async function listRoles(configDir?: string): Promise<string[]> {
  const dir = configDir ?? DEFAULT_CONFIG_DIR;
  const rolesPath = join(dir, ROLES_DIR);

  try {
    // Only scan for .md role files
    const glob = new Bun.Glob("*.md");
    const roleFiles = await Array.fromAsync(glob.scan(rolesPath));
    const roles: string[] = roleFiles.map((path) => basename(path, ".md"));

    return [...new Set(roles)].sort();
  } catch {
    return [];
  }
}

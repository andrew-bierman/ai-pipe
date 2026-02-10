import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";
import { ProviderIdSchema, SUPPORTED_PROVIDERS } from "./provider.ts";
import { APP } from "./constants.ts";

const ApiKeysSchema = z.record(z.string(), z.string()).refine(
  (obj) => Object.keys(obj).every((k) => ProviderIdSchema.safeParse(k).success),
  { message: `apiKeys keys must be valid providers: ${SUPPORTED_PROVIDERS.join(", ")}` }
);

export const ConfigSchema = z.object({
  model: z.string().optional(),
  system: z.string().optional(),
  temperature: z.number().min(APP.temperature.min).max(APP.temperature.max).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
});

export type Config = z.infer<typeof ConfigSchema> & { apiKeys?: Record<string, string> };

const DEFAULT_CONFIG_DIR = join(homedir(), APP.configDirName);

async function loadJsonFile<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    const raw = await file.json();
    return schema.parse(raw);
  } catch {
    return null;
  }
}

export async function loadConfig(configDir?: string): Promise<Config> {
  const dir = configDir ?? DEFAULT_CONFIG_DIR;

  const [settings, keys] = await Promise.all([
    loadJsonFile(join(dir, APP.configFile), ConfigSchema),
    loadJsonFile(join(dir, APP.apiKeysFile), ApiKeysSchema),
  ]);

  return {
    ...(settings ?? {}),
    ...(keys ? { apiKeys: keys } : {}),
  };
}

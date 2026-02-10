import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";
import { ProviderIdSchema, SUPPORTED_PROVIDERS } from "./provider.ts";

const ApiKeysSchema = z.record(z.string(), z.string()).refine(
  (obj) => Object.keys(obj).every((k) => ProviderIdSchema.safeParse(k).success),
  { message: `apiKeys keys must be valid providers: ${SUPPORTED_PROVIDERS.join(", ")}` }
);

export const ConfigSchema = z.object({
  model: z.string().optional(),
  system: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  apiKeys: ApiKeysSchema.optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

const DEFAULT_CONFIG_PATH = join(homedir(), ".ai-cli.json");

export async function loadConfig(configPath?: string): Promise<Config> {
  const path = configPath ?? DEFAULT_CONFIG_PATH;
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return {};
  }

  try {
    const raw = await file.json();
    return ConfigSchema.parse(raw);
  } catch {
    return {};
  }
}

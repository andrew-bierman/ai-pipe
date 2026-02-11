import { basename, join } from "node:path";
import { z } from "zod";
import { APP } from "./constants.ts";
import { ProviderIdSchema, SUPPORTED_PROVIDERS } from "./provider.ts";

const ApiKeysSchema = z
  .record(z.string(), z.string())
  .refine(
    (obj) =>
      Object.keys(obj).every((k) => ProviderIdSchema.safeParse(k).success),
    {
      message: `apiKeys keys must be valid providers: ${SUPPORTED_PROVIDERS.join(", ")}`,
    },
  );

export const ConfigSchema = z.object({
  model: z.string().optional(),
  system: z.string().optional(),
  temperature: z
    .number()
    .min(APP.temperature.min)
    .max(APP.temperature.max)
    .optional(),
  maxOutputTokens: z.number().int().positive().optional(),
});

export type Config = z.infer<typeof ConfigSchema> & {
  apiKeys?: Record<string, string>;
};

// TODO: Bun.env.HOME is undefined on Windows — add fallback if Windows support needed
const DEFAULT_CONFIG_DIR = join(Bun.env.HOME ?? "", APP.configDirName);

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

const ROLES_DIR = "roles";

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

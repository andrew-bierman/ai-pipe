import { homedir } from "node:os";
import { join } from "node:path";
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

const DEFAULT_CONFIG_DIR = join(homedir(), APP.configDirName);
const ROLES_DIR = "roles";

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

export async function loadRole(roleName: string): Promise<string | null> {
  const rolesPath = join(DEFAULT_CONFIG_DIR, ROLES_DIR, roleName);

  // Try with .txt extension first
  const txtFile = Bun.file(`${rolesPath}.txt`);
  if (await txtFile.exists()) {
    return txtFile.text();
  }

  // Try as a plain file without extension
  const plainFile = Bun.file(rolesPath);
  if (await plainFile.exists()) {
    return plainFile.text();
  }

  return null;
}

export async function listRoles(): Promise<string[]> {
  const rolesPath = join(DEFAULT_CONFIG_DIR, ROLES_DIR);

  try {
    const dir = Bun.file(rolesPath);
    if (!(await dir.exists())) {
      return [];
    }

    // Use glob to find role files
    const glob = new Bun.Glob("*.txt");
    const txtRoles = await Array.fromAsync(glob.scan(rolesPath));
    const roles: string[] = txtRoles.map((path) =>
      path.split("/").pop()!.slice(0, -4),
    );

    // Also check for files without extension
    const plainGlob = new Bun.Glob("*");
    const plainPaths = await Array.fromAsync(plainGlob.scan(rolesPath));
    const plainRoles = plainPaths
      .filter((path) => !path.endsWith(".txt"))
      .map((path) => path.split("/").pop()!);

    return [...roles, ...plainRoles].sort();
  } catch {
    return [];
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

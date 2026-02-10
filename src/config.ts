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

const ROLES_DIR = "roles";
const getConfigDir = () => join(APP.configDirName, ROLES_DIR);

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
  // Sanitize roleName to prevent path traversal attacks
  const sanitizedName = basename(roleName);
  const rolesPath = join(APP.configDirName, ROLES_DIR, sanitizedName);

  // Try with .txt extension first
  const txtFile = Bun.file(`${rolesPath}.txt`);
  if (await txtFile.exists()) {
    return txtFile.text();
  }

  // Try with .md extension (markdown)
  const mdFile = Bun.file(`${rolesPath}.md`);
  if (await mdFile.exists()) {
    const markdownContent = await mdFile.text();
    // Convert markdown to HTML using Bun's built-in markdown parser
    return Bun.markdown.html(markdownContent);
  }

  // Try as a plain file without extension
  const plainFile = Bun.file(rolesPath);
  if (await plainFile.exists()) {
    return plainFile.text();
  }

  return null;
}

export async function listRoles(): Promise<string[]> {
  const rolesPath = join(APP.configDirName, ROLES_DIR);

  try {
    const dir = Bun.file(rolesPath);
    if (!(await dir.exists())) {
      return [];
    }

    // Use glob to find .txt and .md role files
    const glob = new Bun.Glob("*.{txt,md}");
    const roleFiles = await Array.fromAsync(glob.scan(rolesPath));
    const roles: string[] = roleFiles.map((path) =>
      basename(path, path.endsWith(".md") ? ".md" : ".txt"),
    );

    return roles.sort();
  } catch {
    return [];
  }
}

export async function loadConfig(configDir?: string): Promise<Config> {
  const dir = configDir ?? APP.configDirName;

  const [settings, keys] = await Promise.all([
    loadJsonFile(join(dir, APP.configFile), ConfigSchema),
    loadJsonFile(join(dir, APP.apiKeysFile), ApiKeysSchema),
  ]);

  return {
    ...(settings ?? {}),
    ...(keys ? { apiKeys: keys } : {}),
  };
}

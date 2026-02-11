import { z } from "zod";

export interface ToolConfig {
  name: string;
  description?: string;
  parameters: unknown;
}

export interface ToolsConfig {
  tools?: ToolConfig[];
}

export const ToolsConfigSchema = z.object({
  tools: z.optional(
    z.array(
      z.object({
        name: z.string(),
        description: z.optional(z.string()),
        parameters: z.any(),
      }),
    ),
  ),
});

export async function loadToolsConfig(
  configPath?: string,
): Promise<ToolConfig[]> {
  if (!configPath) return [];

  try {
    const file = Bun.file(configPath);
    if (!(await file.exists())) return [];

    const content = await file.text();
    const parsed = JSON.parse(content);
    const result = ToolsConfigSchema.safeParse(parsed);

    if (result.success && result.data.tools) {
      return result.data.tools;
    }
    return [];
  } catch {
    return [];
  }
}

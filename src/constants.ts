import { z } from "zod";

/** Zod schema for validating supported shell types (bash, zsh, fish). */
export const ShellSchema = z.enum(["bash", "zsh", "fish"]);

/** Union type of supported shell names. */
export type Shell = z.infer<typeof ShellSchema>;

/** Zod schema for the application configuration object. */
export const AppSchema = z.object({
  name: z.string(),
  description: z.string(),
  defaultModel: z.string(),
  defaultProvider: z.string(),
  temperature: z.object({
    min: z.number(),
    max: z.number(),
  }),
  configDirName: z.string(),
  configFile: z.string(),
  apiKeysFile: z.string(),
  supportedShells: z.array(ShellSchema),
});

/** Type representing the full application configuration. */
export type AppConfig = z.infer<typeof AppSchema>;

/**
 * Global application configuration constants.
 *
 * All magic values (app name, default model, temperature bounds, config paths,
 * supported shells) are centralized here. Validated at startup via AppSchema.
 */
export const APP: AppConfig = AppSchema.parse({
  name: "ai-pipe",
  description: "A lean CLI for calling LLMs from the terminal.",
  defaultModel: "openai/gpt-4o",
  defaultProvider: "openai",
  temperature: { min: 0, max: 2 },
  configDirName: ".ai-pipe",
  configFile: "config.json",
  apiKeysFile: "apiKeys.json",
  supportedShells: ["bash", "zsh", "fish"],
} as const satisfies Record<string, unknown>);

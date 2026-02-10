import { z } from "zod";

export const ShellSchema = z.enum(["bash", "zsh", "fish"]);
export type Shell = z.infer<typeof ShellSchema>;

export const AppSchema = z.object({
  name: z.string(),
  description: z.string(),
  defaultModel: z.string(),
  defaultProvider: z.string(),
  temperature: z.object({
    min: z.number(),
    max: z.number(),
  }),
  configFileName: z.string(),
  supportedShells: z.array(ShellSchema),
});

export type AppConfig = z.infer<typeof AppSchema>;

export const APP: AppConfig = AppSchema.parse({
  name: "ai-pipe",
  description: "A lean CLI for calling LLMs from the terminal.",
  defaultModel: "openai/gpt-4o",
  defaultProvider: "openai",
  temperature: { min: 0, max: 2 },
  configFileName: ".ai-pipe.json",
  supportedShells: ["bash", "zsh", "fish"],
});

#!/usr/bin/env bun

import { generateText, streamText } from "ai";
import { program } from "commander";
import { z } from "zod";
import pkg from "../package.json";
import { generateCompletions } from "./completions.ts";
import { type Config, loadConfig } from "./config.ts";
import { APP } from "./constants.ts";
import { renderMarkdown } from "./markdown.ts";
import {
  PROVIDER_ENV_VARS,
  ProviderIdSchema,
  printProviders,
  resolveModel,
} from "./provider.ts";

export interface CLIOptions {
  model?: string;
  system?: string;
  file?: string[];
  image?: string[];
  json: boolean;
  stream: boolean;
  markdown: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  config?: string;
  providers?: boolean;
  completions?: string;
}

export const CLIOptionsSchema = z.object({
  model: z.string().optional(),
  system: z.string().optional(),
  file: z.array(z.string()).optional(),
  image: z.array(z.string()).optional(),
  json: z.boolean(),
  stream: z.boolean(),
  markdown: z.boolean().optional().default(false),
  temperature: z
    .number()
    .min(APP.temperature.min)
    .max(APP.temperature.max)
    .optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  config: z.string().optional(),
  providers: z.boolean().optional(),
  completions: z.string().optional(),
});

export const JsonOutputSchema = z.object({
  text: z.string(),
  model: z.string(),
  usage: z.object({
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    totalTokens: z.number().optional(),
    inputTokenDetails: z
      .object({
        noCacheTokens: z.number().optional(),
        cacheReadTokens: z.number().optional(),
        cacheWriteTokens: z.number().optional(),
      })
      .optional(),
    outputTokenDetails: z
      .object({
        textTokens: z.number().optional(),
        reasoningTokens: z.number().optional(),
      })
      .optional(),
  }),
  finishReason: z.string(),
});

export type JsonOutput = z.infer<typeof JsonOutputSchema>;

/**
 * Load a file's content as a Data URL (base64 encoded).
 * Used for images and other binary attachments.
 */
export async function loadAsDataUrl(
  path: string,
  mimeType: string,
): Promise<string> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`File not found: ${path}`);
  }
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Helper to reduce duplication between readFiles and readImages.
 * Validates file exists, then applies the processing function.
 * Throws with label-prefixed error message on failure.
 */
async function loadOrExit<T>(
  label: string,
  fn: (path: string) => Promise<T>,
  paths: string[],
): Promise<T[]> {
  const results: T[] = [];
  for (const path of paths) {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      throw new Error(`${label} not found: ${path}`);
    }
    results.push(await fn(path));
  }
  return results;
}

export async function readFiles(paths: string[]): Promise<string> {
  const parts = await loadOrExit(
    "File",
    async (path: string) => {
      const file = Bun.file(path);
      return `# ${path}\n\`\`\`\n${await file.text()}\n\`\`\``;
    },
    paths,
  );
  return parts.join("\n\n");
}

export async function readImages(paths: string[]): Promise<{ url: string }[]> {
  return loadOrExit(
    "Image",
    async (path: string) => {
      const file = Bun.file(path);
      const mimeType = file.type || "image/png";
      const dataUrl = await loadAsDataUrl(path, mimeType);
      return { url: dataUrl };
    },
    paths,
  );
}

export function buildPrompt(
  argPrompt: string | null,
  fileContent: string | null = null,
  stdinContent: string | null = null,
): string {
  const parts: string[] = [];
  if (argPrompt) parts.push(argPrompt);
  if (fileContent) parts.push(fileContent);
  if (stdinContent) parts.push(stdinContent);
  return parts.join("\n\n");
}

export function resolveOptions(
  opts: CLIOptions,
  config: Config,
): {
  modelString: string;
  system: string | undefined;
  temperature: number | undefined;
  maxOutputTokens: number | undefined;
  markdown: boolean;
} {
  return {
    modelString: opts.model ?? config.model ?? APP.defaultModel,
    system: opts.system ?? config.system ?? undefined,
    temperature: opts.temperature ?? config.temperature ?? undefined,
    maxOutputTokens:
      opts.maxOutputTokens ?? config.maxOutputTokens ?? undefined,
    markdown: opts.markdown,
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8").trimEnd();
}

async function run(promptArgs: string[], rawOpts: Record<string, unknown>) {
  const parsed = CLIOptionsSchema.safeParse(rawOpts);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      console.error(
        `Error: Invalid option "${issue.path.join(".")}": ${issue.message}`,
      );
    }
    process.exit(1);
  }
  const opts = parsed.data;

  // Handle info flags first
  if (opts.providers) {
    printProviders();
    return;
  }

  if (opts.completions) {
    process.stdout.write(`${generateCompletions(opts.completions)}\n`);
    return;
  }

  const config = await loadConfig(opts.config);

  // Inject config API keys into process.env (env vars take precedence)
  if (config.apiKeys) {
    for (const [provider, key] of Object.entries(config.apiKeys)) {
      const providerId = ProviderIdSchema.safeParse(provider);
      if (!providerId.success) continue;
      const envVars = PROVIDER_ENV_VARS[providerId.data];
      if (envVars[0] && !process.env[envVars[0]]) {
        process.env[envVars[0]] = key;
      }
    }
  }

  const hasStdin = !process.stdin.isTTY;
  const argPrompt = promptArgs.length > 0 ? promptArgs.join(" ") : null;
  const stdinContent = hasStdin ? await readStdin() : null;

  let fileContent: string | null = null;
  try {
    fileContent = opts.file?.length ? await readFiles(opts.file) : null;
  } catch (err: unknown) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  let images: { url: string }[] = [];
  try {
    images = opts.image?.length ? await readImages(opts.image) : [];
  } catch (err: unknown) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const prompt = buildPrompt(argPrompt, fileContent, stdinContent);
  if (!prompt && images.length === 0) {
    program.help();
    return;
  }

  const { modelString, system, temperature, maxOutputTokens, markdown } =
    resolveOptions(opts, config);

  const model = resolveModel(modelString);

  try {
    if (opts.json || !opts.stream) {
      const result = await generateText({
        model,
        system,
        prompt,
        temperature,
        maxOutputTokens,
        images: images.length > 0 ? images : undefined,
      });

      if (opts.json) {
        const output: JsonOutput = {
          text: result.text,
          model: modelString,
          usage: result.usage,
          finishReason: result.finishReason,
        };
        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      } else if (markdown) {
        const rendered = renderMarkdown(result.text);
        process.stdout.write(`${rendered}\n`);
      } else {
        process.stdout.write(`${result.text}\n`);
      }
    } else {
      const result = streamText({
        model,
        system,
        prompt,
        temperature,
        maxOutputTokens,
        images: images.length > 0 ? images : undefined,
      });

      if (markdown) {
        const chunks: string[] = [];
        for await (const chunk of result.textStream) {
          chunks.push(chunk);
        }
        const fullText = chunks.join("");
        const rendered = renderMarkdown(fullText);
        process.stdout.write(`${rendered}\n`);
      } else {
        for await (const chunk of result.textStream) {
          process.stdout.write(chunk);
        }
        process.stdout.write("\n");
      }
    }
  } catch (err: unknown) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

export function setupCLI() {
  program
    .name(APP.name)
    .description(APP.description)
    .version(pkg.version)
    .argument("[prompt...]", "Prompt text. Multiple words are joined.")
    .option("-m, --model <model>", "Model in provider/model-id format")
    .option("-s, --system <prompt>", "System prompt")
    .option(
      "-f, --file <path>",
      "Include file contents in prompt (repeatable)",
      (val: string, acc: string[]) => {
        acc.push(val);
        return acc;
      },
      [] as string[],
    )
    .option(
      "-i, --image <path>",
      "Include image in prompt for vision models (repeatable)",
      (val: string, acc: string[]) => {
        acc.push(val);
        return acc;
      },
      [] as string[],
    )
    .option("-j, --json", "Output full JSON response object", false)
    .option("--no-stream", "Wait for full response, then print")
    .option("--markdown", "Render markdown output", false)
    .option(
      "-t, --temperature <n>",
      `Sampling temperature (${APP.temperature.min}-${APP.temperature.max})`,
      parseFloat,
    )
    .option("--max-output-tokens <n>", "Maximum tokens to generate", parseInt)
    .option("-c, --config <path>", "Path to config directory")
    .option("--providers", "List supported providers and their API key status")
    .option(
      "--completions <shell>",
      `Generate shell completions (${APP.supportedShells.join(", ")})`,
    )
    .action(run);

  return program;
}

// Only run CLI when executed directly (Bun), not when imported
if (import.meta.main) {
  setupCLI().parse();
}

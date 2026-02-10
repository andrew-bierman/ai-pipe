#!/usr/bin/env bun

import { z } from "zod";
import { program } from "commander";
import { streamText, generateText, type LanguageModelUsage, type FinishReason } from "ai";
import { resolveModel, printProviders, PROVIDER_ENV_VARS, type ProviderId } from "./provider.ts";
import { loadConfig, type Config } from "./config.ts";
import { generateCompletions } from "./completions.ts";

import pkg from "../package.json";

export interface CLIOptions {
  model?: string;
  system?: string;
  json: boolean;
  stream: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  config?: string;
  providers?: boolean;
  completions?: string;
}

export const CLIOptionsSchema = z.object({
  model: z.string().optional(),
  system: z.string().optional(),
  json: z.boolean(),
  stream: z.boolean(),
  temperature: z.number().min(0).max(2).optional(),
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

export function buildPrompt(
  argPrompt: string | null,
  stdinContent: string | null
): string | null {
  if (argPrompt && stdinContent) {
    return `${argPrompt}\n\n${stdinContent}`;
  }
  return argPrompt ?? stdinContent;
}

export function resolveOptions(
  opts: CLIOptions,
  config: Config
): {
  modelString: string;
  system: string | undefined;
  temperature: number | undefined;
  maxOutputTokens: number | undefined;
} {
  return {
    modelString: opts.model ?? config.model ?? "openai/gpt-4o",
    system: opts.system ?? config.system ?? undefined,
    temperature: opts.temperature ?? config.temperature ?? undefined,
    maxOutputTokens: opts.maxOutputTokens ?? config.maxOutputTokens ?? undefined,
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
      console.error(`Error: Invalid option "${issue.path.join(".")}": ${issue.message}`);
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
    process.stdout.write(generateCompletions(opts.completions) + "\n");
    return;
  }

  const config = await loadConfig(opts.config);

  // Inject config API keys into process.env (env vars take precedence)
  if (config.apiKeys) {
    for (const [provider, key] of Object.entries(config.apiKeys)) {
      const envVar = PROVIDER_ENV_VARS[provider as ProviderId];
      if (envVar && !process.env[envVar]) {
        process.env[envVar] = key;
      }
    }
  }

  const hasStdin = !process.stdin.isTTY;
  const argPrompt = promptArgs.length > 0 ? promptArgs.join(" ") : null;
  const stdinContent = hasStdin ? await readStdin() : null;

  const prompt = buildPrompt(argPrompt, stdinContent);
  if (!prompt) {
    program.help();
    return;
  }

  const { modelString, system, temperature, maxOutputTokens } = resolveOptions(
    opts,
    config
  );

  const model = resolveModel(modelString);

  try {
    if (opts.json || !opts.stream) {
      const result = await generateText({
        model,
        system,
        prompt,
        temperature,
        maxOutputTokens,
      });

      if (opts.json) {
        const output: JsonOutput = {
          text: result.text,
          model: modelString,
          usage: result.usage,
          finishReason: result.finishReason,
        };
        process.stdout.write(JSON.stringify(output, null, 2) + "\n");
      } else {
        process.stdout.write(result.text + "\n");
      }
    } else {
      const result = streamText({
        model,
        system,
        prompt,
        temperature,
        maxOutputTokens,
      });

      for await (const chunk of result.textStream) {
        process.stdout.write(chunk);
      }
      process.stdout.write("\n");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

// Only run CLI when executed directly, not when imported
if (import.meta.main) {
  program
    .name("ai")
    .description("A lean CLI for calling LLMs from the terminal.")
    .version(pkg.version)
    .argument("[prompt...]", "Prompt text. Multiple words are joined.")
    .option("-m, --model <model>", "Model in provider/model-id format")
    .option("-s, --system <prompt>", "System prompt")
    .option("-j, --json", "Output full JSON response object", false)
    .option("--no-stream", "Wait for full response, then print")
    .option("-t, --temperature <n>", "Sampling temperature (0-2)", parseFloat)
    .option("--max-output-tokens <n>", "Maximum tokens to generate", parseInt)
    .option("-c, --config <path>", "Path to config file")
    .option("--providers", "List supported providers and their API key status")
    .option("--completions <shell>", "Generate shell completions (bash, zsh, fish)")
    .action(run);

  program.parse();
}

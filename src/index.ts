#!/usr/bin/env bun

import { program } from "commander";
import { streamText, generateText, type LanguageModelUsage, type FinishReason } from "ai";
import { resolveModel } from "./provider.ts";
import { loadConfig, type Config } from "./config.ts";

const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();

export interface CLIOptions {
  model?: string;
  system?: string;
  json: boolean;
  stream: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  config?: string;
}

interface JsonOutput {
  text: string;
  model: string;
  usage: LanguageModelUsage;
  finishReason: FinishReason;
}

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

async function run(promptArgs: string[], opts: CLIOptions) {
  const config = await loadConfig(opts.config);

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
    .action(run);

  program.parse();
}

import { generateText, type LanguageModel } from "ai";
import { z } from "zod";

import { type Config, resolveAlias } from "./config.ts";
import { resolveModel } from "./provider.ts";

/**
 * Zod schema for a single chain step.
 *
 * Each step must have a `prompt` string containing `{{input}}` placeholders.
 * Optionally, a `model` override and `system` prompt can be specified per step.
 */
export const ChainStepSchema = z.object({
  model: z.string().optional(),
  system: z.string().optional(),
  prompt: z.string().min(1, "Chain step prompt cannot be empty"),
});

/** Zod schema for a chain config file (array of chain steps). */
export const ChainStepsSchema = z
  .array(ChainStepSchema)
  .min(1, "Chain must have at least one step");

/** A single step in a chain of LLM calls. */
export type ChainStep = z.infer<typeof ChainStepSchema>;

/** Options for executing a chain of LLM calls. */
export interface ChainOptions {
  steps: ChainStep[];
  initialInput: string;
  defaultModel: LanguageModel;
  defaultModelString: string;
  config: Config;
  temperature?: number;
  maxOutputTokens?: number;
  /** Print intermediate outputs to stderr. */
  verbose?: boolean;
}

/**
 * Execute a chain of LLM calls sequentially.
 *
 * Each step's output becomes `{{input}}` for the next step. The first step
 * receives `initialInput` as its `{{input}}` value. Per-step model overrides
 * are supported via the `model` field in each chain step.
 *
 * @param options - Chain execution options.
 * @returns The final output text from the last step.
 */
export async function executeChain(options: ChainOptions): Promise<string> {
  let currentInput = options.initialInput;

  for (let i = 0; i < options.steps.length; i++) {
    const step = options.steps[i] as ChainStep;
    const prompt = step.prompt.replace(/\{\{input\}\}/g, currentInput);

    const modelString = step.model
      ? resolveAlias(options.config, step.model)
      : options.defaultModelString;
    const model = step.model ? resolveModel(modelString) : options.defaultModel;

    if (options.verbose) {
      process.stderr.write(
        `\n🔗 Step ${i + 1}/${options.steps.length}: ${step.prompt.slice(0, 50)}...\n`,
      );
    }

    const result = await generateText({
      model,
      system: step.system,
      prompt,
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
    });

    currentInput = result.text;

    if (options.verbose) {
      process.stderr.write(`   ✓ ${currentInput.slice(0, 80)}...\n`);
    }
  }

  return currentInput;
}

/**
 * Parse a chain definition from a JSON file.
 *
 * The file must contain a JSON array of chain step objects, each with at least
 * a `prompt` field. The array is validated against `ChainStepsSchema`.
 *
 * @param path - Path to the chain config JSON file.
 * @returns A validated array of chain steps.
 * @throws If the file does not exist or contains invalid JSON/schema.
 */
export async function loadChainConfig(path: string): Promise<ChainStep[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Chain config not found: ${path}`);
  }
  const raw = await file.json();
  return ChainStepsSchema.parse(raw);
}

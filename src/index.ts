import { homedir } from "node:os";
import { join } from "node:path";
import { generateText, type ModelMessage, streamText } from "ai";
import { program } from "commander";
import { z } from "zod";
import pkg from "../package.json";
import { generateCompletions } from "./completions.ts";
import { type Config, loadConfig } from "./config.ts";
import { APP } from "./constants.ts";
import {
  PROVIDER_ENV_VARS,
  ProviderIdSchema,
  printProviders,
  resolveModel,
} from "./provider.ts";

// Session name sanitization: only allow alphanumeric, hyphens, underscores
const SESSION_NAME_REGEX = /^[A-Za-z0-9_-]+$/;
const SESSION_SCHEMA = z.string().regex(SESSION_NAME_REGEX);

export function sanitizeSessionName(session: string): string {
  return session.replace(/[^A-Za-z0-9_-]/g, "_");
}

export function isValidSessionName(session: string): boolean {
  return SESSION_NAME_REGEX.test(session);
}

// Zod schema for history messages
export const HistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export type HistoryMessage = z.infer<typeof HistoryMessageSchema>;

// History file schema: array of messages
export const HistorySchema = z.array(HistoryMessageSchema);

export interface CLIOptions {
  model?: string;
  system?: string;
  file?: string[];
  json: boolean;
  stream: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  config?: string;
  providers?: boolean;
  completions?: string;
  session?: string;
}

export const CLIOptionsSchema = z.object({
  model: z.string().optional(),
  system: z.string().optional(),
  file: z.array(z.string()).optional(),
  json: z.boolean(),
  stream: z.boolean(),
  temperature: z
    .number()
    .min(APP.temperature.min)
    .max(APP.temperature.max)
    .optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  config: z.string().optional(),
  providers: z.boolean().optional(),
  completions: z.string().optional(),
  session: z.string().optional(),
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

export async function readFiles(paths: string[]): Promise<string> {
  const parts: string[] = [];
  for (const path of paths) {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      throw new Error(`File not found: ${path}`);
    }
    const content = await file.text();
    parts.push(`# ${path}\n\`\`\`\n${content}\n\`\`\``);
  }
  return parts.join("\n\n");
}

export function buildPrompt(
  argPrompt: string | null,
  fileContent: string | null = null,
  stdinContent: string | null = null,
): string | null {
  const parts: string[] = [];
  if (argPrompt) parts.push(argPrompt);
  if (fileContent) parts.push(fileContent);
  if (stdinContent) parts.push(stdinContent);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

export function resolveOptions(
  opts: CLIOptions,
  config: Config,
): {
  modelString: string;
  system: string | undefined;
  temperature: number | undefined;
  maxOutputTokens: number | undefined;
} {
  return {
    modelString: opts.model ?? config.model ?? APP.defaultModel,
    system: opts.system ?? config.system ?? undefined,
    temperature: opts.temperature ?? config.temperature ?? undefined,
    maxOutputTokens:
      opts.maxOutputTokens ?? config.maxOutputTokens ?? undefined,
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8").trimEnd();
}

const HISTORY_DIR = join(homedir(), ".ai-pipe", "history");

function getHistoryPath(session: string): string {
  return join(HISTORY_DIR, `${session}.json`);
}

export async function loadHistory(session: string): Promise<ModelMessage[]> {
  const path = getHistoryPath(session);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return [];
  }
  try {
    const content = await file.text();
    const raw = JSON.parse(content);
    const result = HistorySchema.safeParse(raw);
    if (result.success) {
      return result.data as ModelMessage[];
    }
    // If validation fails, return empty array
    return [];
  } catch {
    return [];
  }
}

export async function saveHistory(
  session: string,
  messages: ModelMessage[],
): Promise<void> {
  const path = getHistoryPath(session);
  // Ensure directory exists using mkdir with recursive
  // Use fs.mkdir for directory creation with recursive option
  const { mkdir } = await import("node:fs/promises");
  await mkdir(HISTORY_DIR, { recursive: true });
  await Bun.write(path, JSON.stringify(messages, null, 2));
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

  const prompt = buildPrompt(argPrompt, fileContent, stdinContent);
  if (!prompt) {
    program.help();
    return;
  }

  const { modelString, system, temperature, maxOutputTokens } = resolveOptions(
    opts,
    config,
  );

  const model = resolveModel(modelString);

  // Load conversation history if session is provided
  // Sanitize session name to prevent directory traversal
  const sessionName = opts.session ? sanitizeSessionName(opts.session) : null;
  const messages: ModelMessage[] = sessionName
    ? await loadHistory(sessionName)
    : [];

  // Add current user message to messages if using session
  // Only add system message if history is empty (first message in conversation)
  if (sessionName) {
    if (system && messages.length === 0) {
      messages.unshift({ role: "system", content: system });
    }
    messages.push({ role: "user", content: prompt });
  }

  try {
    if (sessionName) {
      // Use conversation history mode
      if (opts.json || !opts.stream) {
        const result = await generateText({
          model,
          messages,
          temperature,
          maxOutputTokens,
        });

        // Save to history
        messages.push({ role: "assistant", content: result.text });
        await saveHistory(sessionName, messages);

        if (opts.json) {
          const output: JsonOutput = {
            text: result.text,
            model: modelString,
            usage: result.usage,
            finishReason: result.finishReason,
          };
          process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
        } else {
          process.stdout.write(`${result.text}\n`);
        }
      } else {
        const result = streamText({
          model,
          messages,
          temperature,
          maxOutputTokens,
        });

        let fullResponse = "";
        for await (const chunk of result.textStream) {
          process.stdout.write(chunk);
          fullResponse += chunk;
        }
        process.stdout.write("\n");

        // Save to history
        messages.push({ role: "assistant", content: fullResponse });
        await saveHistory(sessionName, messages);
      }
    } else {
      // Use regular prompt mode
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
          process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
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
        });

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
    .option("-j, --json", "Output full JSON response object", false)
    .option("--no-stream", "Wait for full response, then print")
    .option(
      "-t, --temperature <n>",
      `Sampling temperature (${APP.temperature.min}-${APP.temperature.max})`,
      parseFloat,
    )
    .option("--max-output-tokens <n>", "Maximum tokens to generate", parseInt)
    .option("-c, --config <path>", "Path to config directory")
    .option("-C, --session <name>", "Session name for conversation history")
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

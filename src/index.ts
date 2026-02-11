import { homedir } from "node:os";
import { join } from "node:path";
import { generateText, type ModelMessage, streamText } from "ai";
import { program } from "commander";
import { z } from "zod";
import pkg from "../package.json";
import {
  buildCacheKey,
  getCachedResponse,
  setCachedResponse,
} from "./cache.ts";
import { generateCompletions } from "./completions.ts";
import { type Config, listRoles, loadConfig, loadRole } from "./config.ts";
import { APP } from "./constants.ts";
import { calculateCost, formatCost, parseModelString } from "./cost.ts";
import { renderMarkdown } from "./markdown.ts";
import {
  PROVIDER_ENV_VARS,
  ProviderIdSchema,
  printProviders,
  resolveModel,
} from "./provider.ts";
import { checkForUpdates } from "./update.ts";

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
  role?: string;
  file?: string[];
  image?: string[];
  json: boolean;
  stream: boolean;
  markdown: boolean;
  cost: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  config?: string;
  providers?: boolean;
  completions?: string;
  session?: string;
  roles?: boolean;
  cache: boolean;
  updateCheck?: boolean;
}

export const CLIOptionsSchema = z.object({
  model: z.string().optional(),
  system: z.string().optional(),
  role: z.string().optional(),
  file: z.array(z.string()).optional(),
  image: z.array(z.string()).optional(),
  json: z.boolean(),
  stream: z.boolean(),
  markdown: z.boolean().optional().default(false),
  cost: z.boolean().optional().default(false),
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
  roles: z.boolean().optional(),
  cache: z.boolean().optional().default(true),
  updateCheck: z.boolean().optional().default(true),
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

  // List available roles
  if (opts.roles) {
    const roles = await listRoles();
    const rolesDir = `~/${APP.configDirName}/roles/`;
    if (roles.length === 0) {
      console.log(`No roles found. Create role files in ${rolesDir}`);
      console.log(`Example: ${rolesDir}reviewer.txt`);
    } else {
      console.log("Available roles:");
      for (const role of roles) {
        console.log(`  - ${role}`);
      }
    }
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

  // Resolve system prompt from role, CLI --system, or config
  // CLI --system takes precedence over role
  let systemPrompt = system;
  if (opts.role && opts.system === undefined) {
    const roleContent = await loadRole(opts.role);
    if (roleContent) {
      systemPrompt = roleContent;
    } else {
      console.error(
        `Error: Role "${opts.role}" not found in ~/${APP.configDirName}/roles/`,
      );
      console.error("Use --roles to list available roles.");
      process.exit(1);
    }
  }

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
          // Note: when --markdown is used with streaming, output is silently
          // buffered (see streaming path below) rather than displayed per-chunk.
          const output = markdown ? renderMarkdown(result.text) : `${result.text}\n`;
          process.stdout.write(output);
        }

        // Display cost if requested
        displayCostIfEnabled(result.usage, modelString, opts.cost);
      } else {
        const result = streamText({
          model,
          messages,
          temperature,
          maxOutputTokens,
        });

        // When markdown is enabled, silently buffer the full response
        // and render once complete (streaming chunks are not displayed).
        if (markdown) {
          let fullResponse = "";
          for await (const chunk of result.textStream) {
            fullResponse += chunk;
          }
          process.stdout.write(renderMarkdown(fullResponse));
        } else {
          for await (const chunk of result.textStream) {
            process.stdout.write(chunk);
          }
          process.stdout.write("\n");
        }

        // Save to history using the full accumulated text from the stream
        messages.push({ role: "assistant", content: await result.text });
        await saveHistory(sessionName, messages);

        // Display cost if requested (usage is available after stream completes)
        displayCostIfEnabled(await result.usage, modelString, opts.cost);
      }
    } else {
      // Use regular prompt mode
      const useCache = opts.cache && (opts.json || !opts.stream);
      const cacheKey = useCache
        ? buildCacheKey({
            model: modelString,
            system: systemPrompt,
            prompt,
            temperature,
            maxOutputTokens,
          })
        : null;

      // Check cache before making API call
      if (cacheKey) {
        const cached = await getCachedResponse(cacheKey);
        if (cached) {
          if (opts.json) {
            const output: JsonOutput = {
              text: cached.text,
              model: cached.model,
              usage: cached.usage,
              finishReason: cached.finishReason,
            };
            process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
          } else {
            process.stdout.write(`${cached.text}\n`);
          }
          displayCostIfEnabled(cached.usage, modelString, opts.cost);
          return;
        }
      }

      if (opts.json || !opts.stream) {
        const result = await generateText({
          model,
          system: systemPrompt,
          prompt,
          temperature,
          maxOutputTokens,
        });

        // Store in cache (failures are non-fatal)
        if (cacheKey) {
          try {
            await setCachedResponse(cacheKey, {
              text: result.text,
              usage: result.usage,
              finishReason: result.finishReason,
              model: modelString,
            });
          } catch {
            // Cache write failure is not critical; the model response still succeeded
          }
        }

        if (opts.json) {
          const output: JsonOutput = {
            text: result.text,
            model: modelString,
            usage: result.usage,
            finishReason: result.finishReason,
          };
          process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
        } else {
          const output = markdown ? renderMarkdown(result.text) : `${result.text}\n`;
          process.stdout.write(output);
        }

        // Display cost if requested
        displayCostIfEnabled(result.usage, modelString, opts.cost);
      } else {
        const result = streamText({
          model,
          system: systemPrompt,
          prompt,
          temperature,
          maxOutputTokens,
        });

        // When markdown is enabled, silently buffer the full response
        // and render once complete (streaming chunks are not displayed).
        if (markdown) {
          let fullResponse = "";
          for await (const chunk of result.textStream) {
            fullResponse += chunk;
          }
          process.stdout.write(renderMarkdown(fullResponse));
        } else {
          for await (const chunk of result.textStream) {
            process.stdout.write(chunk);
          }
          process.stdout.write("\n");
        }

        // Display cost if requested (usage is available after stream completes)
        displayCostIfEnabled(await result.usage, modelString, opts.cost);
      }
    }
  } catch (err: unknown) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Check for updates (bounded wait, printed to stderr)
  if (opts.updateCheck !== false) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const updateMessage = await checkForUpdates(undefined, controller.signal);
      if (updateMessage) {
        process.stderr.write(updateMessage);
      }
    } catch {
      // Timeout or abort — silently ignore
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Display cost information if the --cost flag is set
 */
function displayCostIfEnabled(
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
  modelString: string,
  showCost: boolean,
): void {
  if (!showCost || !usage) return;

  const { provider, modelId } = parseModelString(modelString);
  const costInfo = calculateCost(provider, modelId, usage);
  const formattedCost = formatCost(costInfo);
  console.error(`\n💰 Cost: ${formattedCost}`);
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
      "-r, --role <name>",
      `Use a role from ~/${APP.configDirName}/roles/`,
    )
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
    .option("--no-cache", "Disable response caching")
    .option("--markdown", "Render markdown output", false)
    .option("--cost", "Show estimated cost of the request", false)
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
      "--roles",
      `List available roles from ~/${APP.configDirName}/roles/`,
    )
    .option(
      "--completions <shell>",
      `Generate shell completions (${APP.supportedShells.join(", ")})`,
    )
    .option("--no-update-check", "Disable update notifications")
    .action(run);

  return program;
}

// Only run CLI when executed directly (Bun), not when imported
if (import.meta.main) {
  setupCLI().parse();
}

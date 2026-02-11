import { homedir } from "node:os";
import { join } from "node:path";
import {
  generateText,
  type LanguageModel,
  type ModelMessage,
  streamText,
} from "ai";
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
import type { UsageInfo } from "./cost.ts";
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
  const { mkdir } = await import("node:fs/promises");
  await mkdir(HISTORY_DIR, { recursive: true });
  await Bun.write(path, JSON.stringify(messages, null, 2));
}

/** Parameters for the executePrompt helper */
interface ExecutePromptParams {
  model: LanguageModel;
  modelString: string;
  messages?: ModelMessage[];
  prompt?: string;
  system?: string;
  temperature: number | undefined;
  maxOutputTokens: number | undefined;
  stream: boolean;
  json: boolean;
  markdown: boolean;
  showCost: boolean;
  /** If provided, saves assistant response to session history */
  session?: {
    name: string;
    messages: ModelMessage[];
  };
  /** If provided, enables response caching (non-session, non-streaming only) */
  cacheKey?: string | null;
}

/**
 * Unified prompt execution for both session and non-session modes.
 * Handles streaming vs non-streaming, JSON output, markdown rendering,
 * cost display, caching, and optional session history persistence.
 */
async function executePrompt(params: ExecutePromptParams): Promise<void> {
  const {
    model,
    modelString,
    messages,
    prompt,
    system,
    temperature,
    maxOutputTokens,
    stream,
    json,
    markdown,
    showCost,
    session,
    cacheKey,
  } = params;

  // Check cache before making API call (only for non-session, non-streaming)
  if (cacheKey) {
    const cached = await getCachedResponse(cacheKey);
    if (cached) {
      if (json) {
        const output: JsonOutput = {
          text: cached.text,
          model: cached.model,
          usage: cached.usage,
          finishReason: cached.finishReason,
        };
        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      } else {
        const text = markdown ? renderMarkdown(cached.text) : `${cached.text}\n`;
        process.stdout.write(text);
      }
      displayCostIfEnabled(cached.usage, modelString, showCost);
      return;
    }
  }

  // Build the common model call options with proper type narrowing
  const baseOptions = { model, temperature, maxOutputTokens };
  const callOptions =
    messages !== undefined
      ? { ...baseOptions, messages }
      : { ...baseOptions, system, prompt: prompt ?? "" };

  if (json || !stream) {
    const result = await generateText(callOptions);

    // Store in cache if applicable (failures are non-fatal)
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

    // Save to session history if applicable
    if (session) {
      session.messages.push({ role: "assistant", content: result.text });
      await saveHistory(session.name, session.messages);
    }

    if (json) {
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

    displayCostIfEnabled(result.usage, modelString, showCost);
  } else {
    const result = streamText(callOptions);

    // When markdown is enabled, silently buffer the full response
    // and render once complete (streaming chunks are not displayed).
    if (markdown) {
      let fullResponse = "";
      for await (const chunk of result.textStream) {
        fullResponse += chunk;
      }
      process.stdout.write(renderMarkdown(fullResponse));

      // Save to session history if applicable
      if (session) {
        session.messages.push({ role: "assistant", content: fullResponse });
        await saveHistory(session.name, session.messages);
      }
    } else {
      let fullResponse = "";
      for await (const chunk of result.textStream) {
        process.stdout.write(chunk);
        fullResponse += chunk;
      }
      process.stdout.write("\n");

      // Save to session history if applicable
      if (session) {
        session.messages.push({ role: "assistant", content: fullResponse });
        await saveHistory(session.name, session.messages);
      }
    }

    displayCostIfEnabled(await result.usage, modelString, showCost);
  }
}

/**
 * Format an error for display, extracting the message from Error instances.
 */
function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function run(
  promptArgs: string[],
  rawOpts: Record<string, unknown>,
): Promise<void> {
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
    console.error(`Error: ${formatError(err)}`);
    process.exit(1);
  }

  let images: { url: string }[] = [];
  try {
    images = opts.image?.length ? await readImages(opts.image) : [];
  } catch (err: unknown) {
    console.error(`Error: ${formatError(err)}`);
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
    if (systemPrompt && messages.length === 0) {
      messages.unshift({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });
  }

  try {
    // Build cache key for non-session mode when caching is enabled
    const useCache = !sessionName && opts.cache && (opts.json || !opts.stream);
    const cacheKey = useCache
      ? buildCacheKey({
          model: modelString,
          system: systemPrompt,
          prompt,
          temperature,
          maxOutputTokens,
        })
      : null;

    await executePrompt({
      model,
      modelString,
      messages: sessionName ? messages : undefined,
      prompt: sessionName ? undefined : prompt,
      system: sessionName ? undefined : systemPrompt,
      temperature,
      maxOutputTokens,
      stream: markdown ? false : opts.stream,
      json: opts.json,
      markdown,
      showCost: opts.cost,
      session: sessionName ? { name: sessionName, messages } : undefined,
      cacheKey,
    });
  } catch (err: unknown) {
    console.error(`Error: ${formatError(err)}`);
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
  usage: UsageInfo | undefined,
  modelString: string,
  showCost: boolean,
): void {
  if (!showCost || !usage) return;

  const { provider, modelId } = parseModelString(modelString);
  const costInfo = calculateCost(provider, modelId, usage);
  const formattedCost = formatCost(costInfo);
  console.error(`\n💰 Cost: ${formattedCost}`);
}

export function setupCLI(): typeof program {
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

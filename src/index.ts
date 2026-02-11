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
import { startChat } from "./chat.ts";
import { generateCompletions } from "./completions.ts";
import {
  type Config,
  getProviderDefaults,
  listRoles,
  loadConfig,
  loadRole,
} from "./config.ts";
import { APP } from "./constants.ts";
import type { UsageInfo } from "./cost.ts";
import { calculateCost, formatCost, parseModelString } from "./cost.ts";
import { renderMarkdown } from "./markdown.ts";
import { loadMCPConfig, MCPManager } from "./mcp.ts";
import {
  PROVIDER_ENV_VARS,
  ProviderIdSchema,
  printProviders,
  resolveModel,
} from "./provider.ts";
import { StreamingMarkdownRenderer } from "./streaming-markdown.ts";
import { loadToolsConfig } from "./tools.ts";
import { checkForUpdates } from "./update.ts";

// Session name sanitization: only allow alphanumeric, hyphens, underscores
const SESSION_NAME_REGEX = /^[A-Za-z0-9_-]+$/;

/**
 * Sanitize a session name by replacing invalid characters with underscores.
 *
 * Only alphanumeric characters, hyphens, and underscores are preserved.
 * All other characters are replaced with "_" to prevent directory traversal
 * and filesystem issues.
 *
 * @param session - The raw session name to sanitize.
 * @returns A sanitized session name safe for use as a filename.
 */
export function sanitizeSessionName(session: string): string {
  return session.replace(/[^A-Za-z0-9_-]/g, "_");
}

/**
 * Check whether a session name contains only valid characters.
 *
 * Valid characters: A-Z, a-z, 0-9, hyphens, and underscores.
 *
 * @param session - The session name to validate.
 * @returns `true` if the session name is valid, `false` otherwise.
 */
export function isValidSessionName(session: string): boolean {
  return SESSION_NAME_REGEX.test(session);
}

/** Zod schema for a single conversation history message. */
export const HistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

/** A single message in the conversation history. */
export type HistoryMessage = z.infer<typeof HistoryMessageSchema>;

/** Zod schema for validating a full conversation history (array of messages). */
export const HistorySchema = z.array(HistoryMessageSchema);

/** CLI option values as parsed by Commander and validated by CLIOptionsSchema. */
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
  chat: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  config?: string;
  providers?: boolean;
  completions?: string;
  session?: string;
  roles?: boolean;
  cache: boolean;
  updateCheck?: boolean;
  tools?: string;
  mcp?: string;
}

/** Zod schema for validating and coercing CLI options from Commander. */
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
  chat: z.boolean().optional().default(false),
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
  tools: z.string().optional(),
  mcp: z.string().optional(),
});

/**
 * Zod schema for the structured JSON output emitted with `--json`.
 *
 * Aligned with the Vercel AI SDK's `LanguageModelUsage` and `FinishReason` types.
 * See `sdk-compat.test.ts` for compile-time alignment tests.
 */
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

/** The structured JSON output type for `--json` mode. */
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
 * Options for the loadOrExit helper function.
 */
interface LoadOrExitOptions<T> {
  label: string;
  fn: (path: string) => Promise<T>;
  paths: string[];
}

/**
 * Helper to reduce duplication between readFiles and readImages.
 * Validates file exists, then applies the processing function.
 * Throws with label-prefixed error message on failure.
 */
async function loadOrExit<T>({
  label,
  fn,
  paths,
}: LoadOrExitOptions<T>): Promise<T[]> {
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

/**
 * Read one or more files and return their contents formatted as markdown
 * code blocks, each prefixed with the file path as a heading.
 *
 * @param paths - Array of file paths to read.
 * @returns A single string with all file contents, separated by double newlines.
 * @throws If any file does not exist.
 */
export async function readFiles(paths: string[]): Promise<string> {
  const parts = await loadOrExit({
    label: "File",
    fn: async (path: string) => {
      const file = Bun.file(path);
      return `# ${path}\n\`\`\`\n${await file.text()}\n\`\`\``;
    },
    paths,
  });
  return parts.join("\n\n");
}

/**
 * Read one or more image files and return them as base64-encoded data URLs.
 *
 * The MIME type is detected from each file's content. Used for vision model
 * support with the `-i` / `--image` CLI flag.
 *
 * @param paths - Array of image file paths to read.
 * @returns An array of objects with `url` properties containing data URLs.
 * @throws If any image file does not exist.
 */
export async function readImages(paths: string[]): Promise<{ url: string }[]> {
  return loadOrExit({
    label: "Image",
    fn: async (path: string) => {
      const file = Bun.file(path);
      const mimeType = file.type || "image/png";
      const dataUrl = await loadAsDataUrl(path, mimeType);
      return { url: dataUrl };
    },
    paths,
  });
}

export interface BuildPromptOptions {
  prompt: string | null;
  fileContent?: string | null;
  stdinContent?: string | null;
}

/**
 * Build the final prompt string from argument text, file contents, and stdin.
 *
 * Non-null parts are joined with double newlines. The order is:
 * argument prompt, file content, stdin content.
 * Breaking change (pre-1.0): signature changed from positional args to object param.
 *
 * @param options - Object containing prompt, fileContent, and stdinContent.
 * @returns The combined prompt string (may be empty if all inputs are null).
 */
export function buildPrompt({
  prompt,
  fileContent = null,
  stdinContent = null,
}: BuildPromptOptions): string {
  const parts: string[] = [];
  if (prompt) parts.push(prompt);
  if (fileContent) parts.push(fileContent);
  if (stdinContent) parts.push(stdinContent);
  return parts.join("\n\n");
}

/**
 * Resolve effective options by merging CLI flags, provider config, global config, and defaults.
 *
 * Priority order (highest to lowest): CLI flags > provider-specific config > global config > built-in defaults.
 *
 * After resolving the model string, the provider is extracted (e.g., "anthropic" from
 * "anthropic/claude-sonnet-4-5") and used to look up provider-specific overrides from
 * the config's `providers` section.
 *
 * @param opts - CLI options as parsed by Commander.
 * @param config - Loaded configuration from config files.
 * @returns The merged options with all values resolved.
 */
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
  // First resolve the model string to determine the provider
  const modelString = opts.model ?? config.model ?? APP.defaultModel;
  const { provider } = parseModelString(modelString);

  // Look up provider-specific overrides
  const providerDefaults = getProviderDefaults(config, provider);

  return {
    modelString,
    system:
      opts.system ?? providerDefaults.system ?? config.system ?? undefined,
    temperature:
      opts.temperature ??
      providerDefaults.temperature ??
      config.temperature ??
      undefined,
    maxOutputTokens:
      opts.maxOutputTokens ??
      providerDefaults.maxOutputTokens ??
      config.maxOutputTokens ??
      undefined,
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

const HOME_DIR = Bun.env.HOME ?? Bun.env.USERPROFILE ?? "";
if (!HOME_DIR) {
  console.warn(
    "Warning: Neither HOME nor USERPROFILE environment variable is set. History paths may not resolve correctly.",
  );
}
const HISTORY_DIR = join(HOME_DIR, ".ai-pipe", "history");

function getHistoryPath(session: string): string {
  return join(HISTORY_DIR, `${session}.json`);
}

/**
 * Load conversation history for a named session from disk.
 *
 * History is stored as JSON in `~/.ai-pipe/history/<session>.json`.
 * Returns an empty array if the file does not exist, contains invalid JSON,
 * or fails Zod validation.
 *
 * @param session - The sanitized session name.
 * @returns An array of conversation messages, or empty array on any failure.
 */
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

/**
 * Save conversation history for a named session to disk.
 *
 * Creates the history directory (`~/.ai-pipe/history/`) if it does not exist.
 * The session file is written as pretty-printed JSON.
 *
 * @param session - The sanitized session name.
 * @param messages - The full conversation history to persist.
 */
export async function saveHistory(
  session: string,
  messages: ModelMessage[],
): Promise<void> {
  const path = getHistoryPath(session);
  // Note: Bun.write() automatically creates parent directories (verified),
  // so no explicit mkdir call is needed here.
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
  /** If provided, tools available for the model to call */
  tools?: Record<string, unknown>;
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
    tools,
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
        const text = markdown
          ? renderMarkdown(cached.text)
          : `${cached.text}\n`;
        process.stdout.write(text);
      }
      displayCostIfEnabled({ usage: cached.usage, modelString, showCost });
      return;
    }
  }

  // Build the common model call options with proper type narrowing
  // Cast tools to satisfy AI SDK's ToolSet type constraint
  const baseOptions = {
    model,
    temperature,
    maxOutputTokens,
    ...(tools
      ? { tools: tools as Parameters<typeof generateText>[0]["tools"] }
      : {}),
  };
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
      const output = markdown
        ? renderMarkdown(result.text)
        : `${result.text}\n`;
      process.stdout.write(output);
    }

    displayCostIfEnabled({ usage: result.usage, modelString, showCost });
  } else {
    const result = streamText(callOptions);

    // When markdown is enabled, progressively re-render as tokens arrive.
    if (markdown) {
      const renderer = new StreamingMarkdownRenderer();
      for await (const chunk of result.textStream) {
        renderer.append(chunk);
      }
      renderer.finish();

      // Save to session history if applicable
      if (session) {
        session.messages.push({
          role: "assistant",
          content: renderer.getBuffer(),
        });
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

    displayCostIfEnabled({ usage: await result.usage, modelString, showCost });
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

  // In chat mode, skip stdin/prompt reading — input comes from the REPL
  const hasStdin = !opts.chat && !process.stdin.isTTY;
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

  const prompt = buildPrompt({ prompt: argPrompt, fileContent, stdinContent });
  if (!opts.chat && !prompt && images.length === 0) {
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
      const roleFilename = opts.role.endsWith(".md")
        ? opts.role
        : `${opts.role}.md`;
      console.error(
        `Error: Role "${opts.role}" not found. Create it at ~/${APP.configDirName}/roles/${roleFilename} or run "ai-pipe --roles" to see available roles.`,
      );
      process.exit(1);
    }
  }

  const model = resolveModel(modelString);

  // If --chat is set, enter interactive chat mode instead of one-shot execution
  if (opts.chat) {
    await startChat({
      model,
      modelString,
      system: systemPrompt,
      temperature,
      maxOutputTokens,
      markdown,
      showCost: opts.cost,
    });
    return;
  }

  // Load tools from config file if --tools flag is provided
  const toolConfigs = await loadToolsConfig(opts.tools);
  const staticTools: Record<string, unknown> =
    toolConfigs.length > 0
      ? Object.fromEntries(
          toolConfigs.map((t) => [
            t.name,
            { description: t.description, parameters: t.parameters },
          ]),
        )
      : {};

  // Load MCP tools if --mcp flag is provided
  let mcpManager: MCPManager | undefined;
  let mcpTools: Record<string, unknown> = {};
  if (opts.mcp) {
    try {
      const mcpConfig = await loadMCPConfig(opts.mcp);
      mcpManager = new MCPManager();
      await mcpManager.connect(mcpConfig);
      mcpTools = await mcpManager.getTools();
    } catch (err: unknown) {
      console.error(`Error loading MCP config: ${formatError(err)}`);
      process.exit(1);
    }
  }

  // Merge static tools and MCP tools
  const allTools = { ...staticTools, ...mcpTools };
  const tools: Record<string, unknown> | undefined =
    Object.keys(allTools).length > 0 ? allTools : undefined;

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
      stream: opts.stream,
      json: opts.json,
      markdown,
      showCost: opts.cost,
      session: sessionName ? { name: sessionName, messages } : undefined,
      cacheKey,
      tools,
    });
  } catch (err: unknown) {
    console.error(`Error: ${formatError(err)}`);
    process.exit(1);
  } finally {
    // Clean up MCP server connections on exit
    if (mcpManager) {
      await mcpManager.close();
    }
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

interface DisplayCostOptions {
  usage: UsageInfo | undefined;
  modelString: string;
  showCost: boolean;
}

/**
 * Display cost information if the --cost flag is set
 */
function displayCostIfEnabled({
  usage,
  modelString,
  showCost,
}: DisplayCostOptions): void {
  if (!showCost || !usage) return;

  const { provider, modelId } = parseModelString(modelString);
  const costInfo = calculateCost({ provider, modelId, usage });
  const formattedCost = formatCost(costInfo);
  console.error(`\n💰 Cost: ${formattedCost}`);
}

/**
 * Configure and return the Commander program instance with all CLI options.
 *
 * This is the main entry point for the CLI. It registers all flags, options,
 * and the `run()` action handler. Call `.parse()` on the returned program
 * to execute.
 *
 * @returns The configured Commander program instance.
 */
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
    .option("--chat", "Start interactive chat mode", false)
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
    .option("--tools <path>", "Path to tools configuration file (JSON)")
    .option("--mcp <path>", "Path to MCP server configuration file (JSON)")
    .option("--no-update-check", "Disable update notifications")
    .action(run);

  return program;
}

// Only run CLI when executed directly (Bun), not when imported
if (import.meta.main) {
  setupCLI().parse();
}

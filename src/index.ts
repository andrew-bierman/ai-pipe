import { join } from "node:path";
import {
  generateText,
  type LanguageModel,
  type ModelMessage,
  streamText,
} from "ai";
import { defineCommand, runMain, showUsage } from "citty";
import { z } from "zod";

import pkg from "../package.json";
import {
  buildCacheKey,
  getCachedResponse,
  setCachedResponse,
} from "./cache.ts";
import { executeChain, loadChainConfig } from "./chain.ts";
import { startChat } from "./chat.ts";
import { generateCompletions } from "./completions.ts";
import {
  type Config,
  getProviderDefaults,
  listRoles,
  loadConfig,
  loadRole,
  resolveAlias,
} from "./config.ts";
import { handleConfigCommand } from "./config-commands.ts";
import { APP } from "./constants.ts";
import type { UsageInfo } from "./cost.ts";
import { calculateCost, formatCost, parseModelString } from "./cost.ts";
import {
  formatOutput,
  type OutputFormat,
  OutputFormatSchema,
} from "./formats.ts";
import { runInit } from "./init.ts";
import { renderMarkdown } from "./markdown.ts";
import { loadMCPConfig, MCPManager } from "./mcp.ts";
import {
  PROVIDER_ENV_VARS,
  ProviderIdSchema,
  printProviders,
  resolveModel,
} from "./provider.ts";
import { withRetry } from "./retry.ts";
import {
  deleteSession,
  exportSessionJson,
  exportSessionMarkdown,
  importSession,
  listSessions,
} from "./session.ts";
import { StreamingMarkdownRenderer } from "./streaming-markdown.ts";
import { applyTemplate, listTemplates, loadTemplate } from "./templates.ts";
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

/** CLI option values as parsed by citty and validated by CLIOptionsSchema. */
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
  template?: string;
  templates?: boolean;
  cache: boolean;
  updateCheck?: boolean;
  retries?: number;
  format?: OutputFormat;
  tools?: string;
  mcp?: string;
  budget?: number;
  chain?: string;
  verbose?: boolean;
}

/** Zod schema for validating and coercing CLI options from citty. */
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
  template: z.string().optional(),
  templates: z.boolean().optional(),
  cache: z.boolean().optional().default(true),
  updateCheck: z.boolean().optional().default(true),
  retries: z.number().int().nonnegative().optional(),
  format: OutputFormatSchema.optional(),
  tools: z.string().optional(),
  mcp: z.string().optional(),
  budget: z.number().positive().optional(),
  chain: z.string().optional(),
  verbose: z.boolean().optional().default(false),
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
 * @param opts - CLI options as parsed by citty.
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

/**
 * Handle the `session` subcommand and its sub-actions.
 *
 * Routes to: list, export, import, delete.
 * Prints usage information if no valid sub-action is provided.
 *
 * @param args - The remaining arguments after "session".
 */
async function handleSessionCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (subcommand === "list") {
    const sessions = await listSessions();
    if (sessions.length === 0) {
      console.log("No saved sessions.");
    } else {
      console.log("Saved sessions:");
      for (const name of sessions) {
        console.log(`  - ${name}`);
      }
    }
    return;
  }

  if (subcommand === "export") {
    const name = args[1];
    if (!name) {
      console.error(
        "Error: Session name required. Usage: ai-pipe session export <name> [--format json|md]",
      );
      process.exit(1);
    }
    // Check for --format flag
    let format = "json";
    const formatIdx = args.indexOf("--format");
    if (formatIdx !== -1 && args[formatIdx + 1] !== undefined) {
      format = args[formatIdx + 1] as string;
    }
    if (format !== "json" && format !== "md") {
      console.error(
        `Error: Unsupported format "${format}". Use "json" or "md".`,
      );
      process.exit(1);
    }
    const output =
      format === "md"
        ? await exportSessionMarkdown(name)
        : await exportSessionJson(name);
    process.stdout.write(output);
    return;
  }

  if (subcommand === "import") {
    const name = args[1];
    if (!name) {
      console.error(
        "Error: Session name required. Usage: ai-pipe session import <name> <file>",
      );
      process.exit(1);
    }
    // Read from file argument or stdin
    let content: string;
    const filePath = args[2];
    if (filePath) {
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }
      content = await file.text();
    } else if (!process.stdin.isTTY) {
      content = await readStdin();
    } else {
      console.error(
        "Error: Provide a file path or pipe content via stdin. Usage: ai-pipe session import <name> <file>",
      );
      process.exit(1);
    }
    try {
      await importSession(name, content);
      console.log(`Session "${name}" imported successfully.`);
    } catch (err: unknown) {
      console.error(
        `Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
    return;
  }

  if (subcommand === "delete") {
    const name = args[1];
    if (!name) {
      console.error(
        "Error: Session name required. Usage: ai-pipe session delete <name>",
      );
      process.exit(1);
    }
    try {
      await deleteSession(name);
      console.log(`Session "${name}" deleted.`);
    } catch (err: unknown) {
      console.error(
        `Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
    return;
  }

  // Unknown or missing subcommand — print usage
  console.log(`Usage: ai-pipe session <command>

Commands:
  list                     List all saved sessions
  export <name> [--format] Export a session (json or md, default: json)
  import <name> [file]     Import a session from file or stdin
  delete <name>            Delete a session`);
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
  format?: OutputFormat;
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
  /** If provided, warn when cost exceeds this budget (in USD) */
  budget?: number;
  /** Number of retries on transient/rate-limit errors (0 = no retries) */
  retries?: number;
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
    format,
    markdown,
    showCost,
    session,
    cacheKey,
    tools,
    budget,
    retries,
  } = params;

  // Check cache before making API call (only for non-session, non-streaming)
  if (cacheKey) {
    const cached = await getCachedResponse(cacheKey);
    if (cached) {
      if (format) {
        const outputData: JsonOutput = {
          text: cached.text,
          model: cached.model,
          usage: cached.usage,
          finishReason: cached.finishReason,
        };
        const output = formatOutput(outputData, format);
        process.stdout.write(`${output}\n`);
      } else if (json) {
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
      checkBudget({ usage: cached.usage, modelString, budget });
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

  if (json || format || !stream) {
    const result =
      retries !== undefined && retries > 0
        ? await withRetry(() => generateText(callOptions), {
            maxRetries: retries,
          })
        : await generateText(callOptions);

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

    if (format) {
      const outputData: JsonOutput = {
        text: result.text,
        model: modelString,
        usage: result.usage,
        finishReason: result.finishReason,
      };
      const output = formatOutput(outputData, format);
      process.stdout.write(`${output}\n`);
    } else if (json) {
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
    checkBudget({ usage: result.usage, modelString, budget });
  } else {
    const consumeStream = async () => {
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

      displayCostIfEnabled({
        usage: await result.usage,
        modelString,
        showCost,
      });
      checkBudget({ usage: await result.usage, modelString, budget });
    };

    if (retries !== undefined && retries > 0) {
      await withRetry(consumeStream, { maxRetries: retries });
    } else {
      await consumeStream();
    }
  }
}

/**
 * Format an error for display, extracting the message from Error instances.
 */
function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function runAction(
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

  // List available templates
  if (opts.templates) {
    const templates = await listTemplates();
    const templatesDir = `~/${APP.configDirName}/templates/`;
    if (templates.length === 0) {
      console.log(
        `No templates found. Create template files in ${templatesDir}`,
      );
      console.log(`Example: ${templatesDir}review.md`);
    } else {
      console.log("Available templates:");
      for (const template of templates) {
        console.log(`  - ${template}`);
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

  let prompt = buildPrompt({ prompt: argPrompt, fileContent, stdinContent });

  // Apply template if --template is set
  if (opts.template) {
    const templateContent = await loadTemplate(opts.template);
    if (templateContent) {
      prompt = applyTemplate(templateContent, { input: prompt });
    } else {
      const templateFilename = opts.template.endsWith(".md")
        ? opts.template
        : `${opts.template}.md`;
      console.error(
        `Error: Template "${opts.template}" not found. Create it at ~/${APP.configDirName}/templates/${templateFilename} or run "ai-pipe --templates" to see available templates.`,
      );
      process.exit(1);
    }
  }

  if (!opts.chat && !prompt && images.length === 0) {
    await showUsage(mainCommand);
    process.exit(0);
  }

  // Resolve model aliases before resolveOptions
  if (opts.model) {
    opts.model = resolveAlias(config, opts.model);
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
      budget: opts.budget,
    });
    return;
  }

  // If --chain is set, execute chain mode (non-streaming, sequential LLM calls)
  if (opts.chain) {
    try {
      const steps = await loadChainConfig(opts.chain);
      const result = await executeChain({
        steps,
        initialInput: prompt,
        defaultModel: model,
        defaultModelString: modelString,
        config,
        temperature,
        maxOutputTokens,
        verbose: opts.verbose,
      });

      if (opts.format) {
        const outputData: JsonOutput = {
          text: result,
          model: modelString,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          finishReason: "stop",
        };
        const output = formatOutput(outputData, opts.format);
        process.stdout.write(`${output}\n`);
      } else if (opts.json) {
        const output: JsonOutput = {
          text: result,
          model: modelString,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          finishReason: "stop",
        };
        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      } else {
        const output = markdown ? renderMarkdown(result) : `${result}\n`;
        process.stdout.write(output);
      }
    } catch (err: unknown) {
      console.error(`Error: ${formatError(err)}`);
      process.exit(1);
    }
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
    const useCache =
      !sessionName && opts.cache && (opts.json || opts.format || !opts.stream);
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
      format: opts.format,
      markdown,
      showCost: opts.cost,
      session: sessionName ? { name: sessionName, messages } : undefined,
      cacheKey,
      tools,
      budget: opts.budget,
      retries: opts.retries,
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
 * Check if the cost of a request exceeds the budget, and print a warning if so.
 */
function checkBudget({
  usage,
  modelString,
  budget,
}: {
  usage: UsageInfo | undefined;
  modelString: string;
  budget: number | undefined;
}): void {
  if (budget === undefined || !usage) return;

  const { provider, modelId } = parseModelString(modelString);
  const costInfo = calculateCost({ provider, modelId, usage });
  if (costInfo.totalCost > budget) {
    console.error(
      `⚠️  Budget exceeded: $${costInfo.totalCost.toFixed(4)} (budget: $${budget.toFixed(4)})`,
    );
  }
}

/**
 * Parse repeatable flags (-f/--file and -i/--image) from raw argv.
 *
 * citty does not support repeatable options natively, so we manually
 * extract all occurrences of the specified flags from process.argv.
 *
 * @param rawArgs - The raw argv array (typically process.argv.slice(2)).
 * @param shortFlag - The short form, e.g. "-f".
 * @param longFlag - The long form, e.g. "--file".
 * @returns An array of collected values, or undefined if none found.
 */
function parseRepeatableFlag(
  rawArgs: string[],
  shortFlag: string,
  longFlag: string,
): string[] | undefined {
  const values: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i] as string | undefined;
    if (arg === undefined) continue;
    if (arg === shortFlag || arg === longFlag) {
      const next = rawArgs[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        values.push(next);
        i++; // skip the value
      }
    } else if (arg.startsWith(`${longFlag}=`)) {
      values.push(arg.slice(longFlag.length + 1));
    }
  }
  return values.length > 0 ? values : undefined;
}

/**
 * citty command definition for the CLI.
 *
 * All options are defined as citty args. Repeatable flags (-f, -i) are
 * handled separately via parseRepeatableFlag() since citty does not
 * support repeatable options natively.
 */
export const mainCommand = defineCommand({
  meta: {
    name: APP.name,
    version: pkg.version,
    description: APP.description,
  },
  args: {
    model: {
      type: "string",
      alias: "m",
      description: "Model in provider/model-id format",
    },
    system: {
      type: "string",
      alias: "s",
      description: "System prompt",
    },
    role: {
      type: "string",
      alias: "r",
      description: `Use a role from ~/${APP.configDirName}/roles/`,
    },
    file: {
      type: "string",
      alias: "f",
      description: "Include file contents in prompt (repeatable)",
    },
    image: {
      type: "string",
      alias: "i",
      description: "Include image in prompt for vision models (repeatable)",
    },
    json: {
      type: "boolean",
      alias: "j",
      description: "Output full JSON response object",
      default: false,
    },
    format: {
      type: "string",
      alias: "F",
      description: "Output format (json, yaml, csv, text)",
    },
    stream: {
      type: "boolean",
      description: "Stream output as it arrives",
      negativeDescription: "Wait for full response, then print",
      default: true,
    },
    cache: {
      type: "boolean",
      description: "Enable response caching",
      negativeDescription: "Disable response caching",
      default: true,
    },
    markdown: {
      type: "boolean",
      description: "Render markdown output",
      default: false,
    },
    cost: {
      type: "boolean",
      description: "Show estimated cost of the request",
      default: false,
    },
    chat: {
      type: "boolean",
      description: "Start interactive chat mode",
      default: false,
    },
    temperature: {
      type: "string",
      alias: "t",
      description: `Sampling temperature (${APP.temperature.min}-${APP.temperature.max})`,
    },
    maxOutputTokens: {
      type: "string",
      description: "Maximum tokens to generate",
    },
    config: {
      type: "string",
      alias: "c",
      description: "Path to config directory",
    },
    session: {
      type: "string",
      alias: "C",
      description: "Session name for conversation history",
    },
    providers: {
      type: "boolean",
      description: "List supported providers and their API key status",
      default: false,
    },
    roles: {
      type: "boolean",
      description: `List available roles from ~/${APP.configDirName}/roles/`,
      default: false,
    },
    template: {
      type: "string",
      alias: "T",
      description: `Use a template from ~/${APP.configDirName}/templates/`,
    },
    templates: {
      type: "boolean",
      description: `List available templates from ~/${APP.configDirName}/templates/`,
      default: false,
    },
    completions: {
      type: "string",
      description: `Generate shell completions (${APP.supportedShells.join(", ")})`,
    },
    retries: {
      type: "string",
      description: "Number of retries on rate limit or transient errors",
    },
    tools: {
      type: "string",
      description: "Path to tools configuration file (JSON)",
    },
    mcp: {
      type: "string",
      description: "Path to MCP server configuration file (JSON)",
    },
    budget: {
      type: "string",
      alias: "B",
      description: "Max dollar budget per request (e.g., 0.05)",
    },
    chain: {
      type: "string",
      description: "Path to chain config JSON file for multi-step LLM calls",
    },
    verbose: {
      type: "boolean",
      alias: "v",
      description: "Show intermediate chain outputs on stderr",
      default: false,
    },
    updateCheck: {
      type: "boolean",
      description: "Check for updates after execution",
      negativeDescription: "Disable update notifications",
      default: true,
    },
  },
  async run({ args, rawArgs }) {
    // Collect positional args (prompt words) from citty's _ array
    const promptArgs = args._ || [];

    // Detect subcommands before normal flag processing
    const firstArg = promptArgs[0];
    if (firstArg === "init") {
      await runInit();
      return;
    }
    if (firstArg === "config") {
      await handleConfigCommand(promptArgs.slice(1));
      return;
    }
    if (firstArg === "session") {
      await handleSessionCommand(promptArgs.slice(1));
      return;
    }

    // Parse repeatable flags manually (citty does not support repeatable options)
    const files = parseRepeatableFlag(rawArgs, "-f", "--file");
    const images = parseRepeatableFlag(rawArgs, "-i", "--image");

    // Map citty's parsed args to the CLIOptions shape
    const rawOpts: Record<string, unknown> = {
      model: args.model,
      system: args.system,
      role: args.role,
      file: files,
      image: images,
      json: args.json,
      format: args.format,
      stream: args.stream,
      cache: args.cache,
      markdown: args.markdown,
      cost: args.cost,
      chat: args.chat,
      temperature:
        args.temperature !== undefined
          ? Number.parseFloat(args.temperature)
          : undefined,
      maxOutputTokens:
        args.maxOutputTokens !== undefined
          ? Number.parseInt(args.maxOutputTokens, 10)
          : undefined,
      config: args.config,
      session: args.session,
      providers: args.providers,
      roles: args.roles,
      template: args.template,
      templates: args.templates,
      completions: args.completions,
      retries:
        args.retries !== undefined
          ? Number.parseInt(args.retries, 10)
          : undefined,
      tools: args.tools,
      mcp: args.mcp,
      budget:
        args.budget !== undefined ? Number.parseFloat(args.budget) : undefined,
      chain: args.chain,
      verbose: args.verbose,
      updateCheck: args.updateCheck,
    };

    await runAction(promptArgs, rawOpts);
  },
});

// Only run CLI when executed directly (Bun), not when imported
if (import.meta.main) {
  runMain(mainCommand);
}

import { type LanguageModel, type ModelMessage, streamText } from "ai";
import type { GenerationSettings } from "./config.ts";
import type { UsageInfo } from "./cost.ts";
import { calculateCost, formatCost, parseModelString } from "./cost.ts";
import { renderMarkdown } from "./markdown.ts";
import { formatResponseStats } from "./stats.ts";

export const EXIT_COMMANDS = new Set(["exit", "quit", "/bye"]);
export const CLEAR_COMMAND = "/clear";

export interface ChatOptions {
  model: LanguageModel;
  modelString: string;
  resolveChatModel?: (id: string) => {
    model: LanguageModel;
    modelString: string;
  };
  modelSuggestions?: (currentModel: string, query: string) => Promise<string[]>;
  generationForModel?: (model: string) => GenerationSettings;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  markdown: boolean;
  showCost: boolean;
  showStats?: boolean;
  budget?: number;
}

function createLineChat(model: string, markdown: boolean) {
  const input = Bun.stdin
    .stream()
    .pipeThrough(new TextDecoderStream())
    .getReader();
  let pending = "";
  let ended = false;

  async function readLine(): Promise<string | undefined> {
    let newline = pending.indexOf("\n");
    while (newline === -1 && !ended) {
      const { value, done } = await input.read();
      ended = done;
      pending += value ?? "";
      newline = pending.indexOf("\n");
    }
    if (newline === -1 && !pending) return;
    const line = newline === -1 ? pending : pending.slice(0, newline);
    pending = newline === -1 ? "" : pending.slice(newline + 1);
    return line.endsWith("\r") ? line.slice(0, -1) : line;
  }

  const notice = (text: string) => console.error(text);
  notice(`ai-pipe chat · ${model} · /help`);
  return {
    async read(prompt?: string) {
      if (prompt) notice(prompt);
      let text = "";
      while (true) {
        const line = await readLine();
        if (line === undefined) return text || undefined;
        if (!line.endsWith("\\")) return text + line;
        text += `${line.slice(0, -1)}\n`;
      }
    },
    setModel: (id: string) => notice(`Model: ${id}`),
    remember: undefined,
    notice,
    response: (_prompt: string) => {
      let written = 0;
      return (text: string, complete = false) => {
        if (markdown) {
          if (complete && text) process.stdout.write(renderMarkdown(text));
        } else {
          process.stdout.write(text.slice(written));
          written = text.length;
          if (complete && text) process.stdout.write("\n");
        }
      };
    },
    close: () => {
      pending = "";
      ended = true;
      void input.cancel().catch(() => {});
    },
  };
}

export async function startChat(options: ChatOptions): Promise<void> {
  let { model, modelString } = options;
  if (!model) throw new Error("Chat requires a model.");
  const messages: ModelMessage[] = [];
  let lastPrompt: string | undefined;
  let lastPromptIndex = 0;
  let active: AbortController | undefined;
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let closing = false;
  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  const view = interactive
    ? (await import("./chat-tui.ts")).createChatTui({
        model: modelString,
        markdown: options.markdown,
        interrupt,
        suggestModels: (query) =>
          options.modelSuggestions?.(modelString, query) ?? Promise.resolve([]),
      })
    : createLineChat(modelString, options.markdown);

  function close() {
    closing = true;
    active?.abort();
    view.close();
  }

  function interrupt() {
    if (active) active.abort();
    else close();
  }

  function reset() {
    messages.length = 0;
    if (options.system)
      messages.push({ role: "system", content: options.system });
    lastPrompt = undefined;
    totalCost = 0;
    totalInputTokens = 0;
    totalOutputTokens = 0;
  }

  const warningLogger = globalThis.AI_SDK_LOG_WARNINGS;
  if (interactive) {
    globalThis.AI_SDK_LOG_WARNINGS = ({ warnings }) => {
      for (const warning of warnings) {
        view.notice(
          warning.type === "other"
            ? warning.message
            : (warning.details ?? warning.feature),
        );
      }
    };
  }
  reset();
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", close);
  try {
    while (!closing) {
      const input = (await view.read())?.trim();
      if (input === undefined || EXIT_COMMANDS.has(input.toLowerCase())) break;
      if (!input) continue;
      const command = input.toLowerCase();
      if (command === "/help") {
        view.notice(
          "/model [id]  ·  /settings  ·  /retry  ·  /clear  ·  /bye\nEnter submits. Shift+Enter or Ctrl+J adds a line.",
        );
        continue;
      }
      if (command === "/settings") {
        const { providerOptions, ...settings } =
          options.generationForModel?.(modelString) ?? {};
        const activeSettings = {
          model: modelString,
          markdown: options.markdown,
          stats: Boolean(options.showStats),
          cost: Boolean(options.showCost),
          budget: options.budget,
          temperature: options.temperature,
          maxOutputTokens: options.maxOutputTokens,
          maxRetries: "SDK default",
          ...settings,
        };
        const lines = Object.entries(activeSettings)
          .filter(([, value]) => value !== undefined)
          .map(
            ([key, value]) =>
              `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
          );
        if (providerOptions)
          lines.push(
            `provider options: ${Object.keys(providerOptions).join(", ")}`,
          );
        view.notice(lines.join("\n"));
        continue;
      }
      if (command === CLEAR_COMMAND) {
        reset();
        view.notice("Conversation context cleared.");
        continue;
      }
      if (command === "/model" || command.startsWith("/model ")) {
        const id = input.slice(6).trim();
        if (id && options.resolveChatModel) {
          try {
            ({ model, modelString } = options.resolveChatModel(id));
            view.setModel(modelString);
          } catch (error) {
            view.notice(error instanceof Error ? error.message : String(error));
          }
        } else view.notice(`Model: ${modelString}`);
        continue;
      }

      let prompt = input;
      const retry = command === "/retry";
      if (retry) {
        if (lastPrompt === undefined) {
          view.notice("Send a message before retrying.");
          continue;
        }
        prompt = lastPrompt;
      } else {
        view.remember?.(prompt);
        lastPromptIndex = messages.length;
      }
      lastPrompt = prompt;
      const update = view.response(prompt);
      const started = performance.now();
      let firstTextMs: number | undefined;
      let text = "";
      let streamError: unknown;
      let usage: UsageInfo | undefined;
      const controller = new AbortController();
      active = controller;
      try {
        const result = streamText({
          ...options.generationForModel?.(modelString),
          model,
          messages: [
            ...messages.slice(0, lastPromptIndex),
            { role: "user", content: prompt },
          ],
          temperature: options.temperature,
          maxOutputTokens: options.maxOutputTokens,
          abortSignal: controller.signal,
          onError: ({ error }) => {
            streamError = error;
          },
        });
        for await (const chunk of result.textStream) {
          if (chunk) firstTextMs ??= performance.now() - started;
          text += chunk;
          update(text);
        }
        if (controller.signal.aborted) throw controller.signal.reason;
        if (streamError) throw streamError;
        usage = await result.usage;
        if (retry) messages.length = lastPromptIndex;
        messages.push(
          { role: "user", content: prompt },
          { role: "assistant", content: text },
        );
      } catch (error) {
        update(text, true);
        if (!closing) {
          view.notice(
            controller.signal.aborted
              ? "Response cancelled."
              : `Error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        continue;
      } finally {
        active = undefined;
      }
      if (closing) break;
      const elapsedMs = performance.now() - started;
      update(text, true);
      if (options.showStats)
        view.notice(formatResponseStats({ usage, elapsedMs, firstTextMs }));
      if (!usage || (!options.showCost && options.budget === undefined))
        continue;

      const { provider, modelId } = parseModelString(modelString);
      const cost = calculateCost({ provider, modelId, usage });
      totalCost += cost.totalCost;
      totalInputTokens += cost.inputTokens;
      totalOutputTokens += cost.outputTokens;
      if (options.showCost) {
        view.notice(
          `Cost: ${formatCost(cost)} · session $${totalCost.toFixed(4)}`,
        );
      }
      if (options.budget !== undefined && totalCost > options.budget) {
        const answer = (
          await view.read(
            `Budget exceeded ($${totalCost.toFixed(4)}). Continue? [y/N]`,
          )
        )
          ?.trim()
          .toLowerCase();
        if (answer !== "y" && answer !== "yes") break;
      }
    }
  } finally {
    globalThis.AI_SDK_LOG_WARNINGS = warningLogger;
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", close);
    close();
    if (options.showCost && totalCost > 0) {
      console.error(
        `Session total cost: $${totalCost.toFixed(4)} (${totalInputTokens.toLocaleString()} in, ${totalOutputTokens.toLocaleString()} out)`,
      );
    }
  }
}

import * as readline from "node:readline";
import { type LanguageModel, type ModelMessage, streamText } from "ai";

import type { UsageInfo } from "./cost.ts";
import { calculateCost, formatCost, parseModelString } from "./cost.ts";
import { StreamingMarkdownRenderer } from "./streaming-markdown.ts";

// ── ANSI helpers ──────────────────────────────────────────────────────
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GRAY = "\x1b[90m";
const MAGENTA = "\x1b[35m";

/** Commands that exit the chat session. */
const EXIT_COMMANDS = new Set(["exit", "quit", "/bye"]);

/** Commands that clear conversation history. */
const CLEAR_COMMAND = "/clear";

/** Help command */
const HELP_COMMAND = "/help";

/** Options accepted by startChat. */
export interface ChatOptions {
  model: LanguageModel;
  modelString: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  markdown: boolean;
  showCost: boolean;
  /** If provided, warn when cumulative cost exceeds this budget (in USD) */
  budget?: number;
}

/** The accumulated cost totals across the chat session. */
interface RunningCost {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

/** Count user messages in the conversation (excludes system/assistant). */
function userMessageCount(messages: ModelMessage[]): number {
  return messages.filter((m) => m.role === "user").length;
}

/** Build the colored prompt string showing message count. */
function buildPrompt(msgCount: number): string {
  if (msgCount === 0) {
    return `${CYAN}${BOLD}> ${RESET}`;
  }
  return `${GRAY}[${msgCount}]${RESET} ${CYAN}${BOLD}> ${RESET}`;
}

/** Print the welcome banner to stderr. */
function printWelcomeBanner(modelString: string, hasSystem: boolean): void {
  const border = `${GRAY}${"─".repeat(50)}${RESET}`;
  console.error(border);
  console.error(
    `  ${BOLD}${CYAN}ai-pipe${RESET} ${DIM}interactive chat${RESET}`,
  );
  console.error("");
  console.error(`  ${DIM}Model:${RESET}   ${GREEN}${modelString}${RESET}`);
  console.error(
    `  ${DIM}System:${RESET}  ${hasSystem ? `${GREEN}active${RESET}` : `${GRAY}none${RESET}`}`,
  );
  console.error("");
  console.error(`  ${DIM}Commands:${RESET}`);
  console.error(
    `    ${YELLOW}/clear${RESET}  ${DIM}reset conversation${RESET}`,
  );
  console.error(`    ${YELLOW}/help${RESET}   ${DIM}show this help${RESET}`);
  console.error(`    ${YELLOW}exit${RESET}    ${DIM}quit (or Ctrl+D)${RESET}`);
  console.error("");
  console.error(
    `  ${DIM}Tip: End a line with ${RESET}${YELLOW}\\${RESET}${DIM} for multiline input${RESET}`,
  );
  console.error(border);
  console.error("");
}

/** Simple dots spinner that runs until stopped. */
class DotsSpinner {
  private interval: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private readonly frames = [".", "..", "...", ".."];

  start(): void {
    this.frame = 0;
    process.stderr.write(`${DIM}  thinking${RESET}`);
    this.interval = setInterval(() => {
      const dots = this.frames[this.frame % this.frames.length];
      // Clear line and rewrite
      process.stderr.write(`\r${DIM}  thinking${dots}${RESET}\x1b[K`);
      this.frame++;
    }, 300);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    // Clear the spinner line
    process.stderr.write("\r\x1b[K");
  }
}

/**
 * Start an interactive chat REPL.
 *
 * Maintains a conversation history in memory and streams responses by default.
 * Supports `/clear` to reset history, `/help` to show commands, and
 * `exit`/`quit`/`/bye`/Ctrl-C/Ctrl-D to exit cleanly.
 *
 * @param options - Resolved CLI options including model, system prompt, and display flags.
 */
export async function startChat(options: ChatOptions): Promise<void> {
  const {
    model,
    modelString,
    system,
    temperature,
    maxOutputTokens,
    markdown,
    showCost,
    budget,
  } = options;

  const messages: ModelMessage[] = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }

  const runningCost: RunningCost = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
  };

  // Track the current streaming abort controller so Ctrl+C can cancel it
  let currentAbort: AbortController | null = null;
  let isStreaming = false;

  // Multiline input buffer
  let multilineBuffer = "";
  let isMultiline = false;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    prompt: buildPrompt(0),
    terminal: true,
  });

  printWelcomeBanner(modelString, !!system);

  rl.prompt();

  // Wrap the REPL loop in a promise so startChat awaits until exit
  return new Promise<void>((resolve) => {
    rl.on("line", async (input: string) => {
      // ── Multiline support: lines ending with \ continue ──
      if (input.endsWith("\\")) {
        multilineBuffer += `${input.slice(0, -1)}\n`;
        isMultiline = true;
        // Show a continuation prompt via readline to stay in sync
        rl.setPrompt(`${GRAY}  ...${RESET} `);
        rl.prompt();
        return;
      }

      // If we were accumulating multiline, append this final line and restore prompt
      let fullInput: string;
      if (isMultiline) {
        fullInput = multilineBuffer + input;
        multilineBuffer = "";
        isMultiline = false;
        // Restore the normal prompt after multiline input is complete
        rl.setPrompt(buildPrompt(userMessageCount(messages)));
      } else {
        fullInput = input;
      }

      const trimmed = fullInput.trim();

      // Skip empty lines
      if (!trimmed) {
        rl.setPrompt(buildPrompt(userMessageCount(messages)));
        rl.prompt();
        return;
      }

      // Handle exit commands
      if (EXIT_COMMANDS.has(trimmed.toLowerCase())) {
        console.error(`\n${DIM}Goodbye!${RESET}`);
        rl.close();
        return;
      }

      // Handle /help command
      if (trimmed.toLowerCase() === HELP_COMMAND) {
        printWelcomeBanner(modelString, !!system);
        rl.setPrompt(buildPrompt(userMessageCount(messages)));
        rl.prompt();
        return;
      }

      // Handle /clear command
      if (trimmed.toLowerCase() === CLEAR_COMMAND) {
        // Keep only the system message if present
        messages.length = 0;
        if (system) {
          messages.push({ role: "system", content: system });
        }
        runningCost.totalInputTokens = 0;
        runningCost.totalOutputTokens = 0;
        runningCost.totalCost = 0;
        console.error(`${GREEN}Conversation history cleared.${RESET}\n`);
        rl.setPrompt(buildPrompt(0));
        rl.prompt();
        return;
      }

      // Add user message to history
      messages.push({ role: "user", content: trimmed });

      const spinner = new DotsSpinner();

      try {
        currentAbort = new AbortController();
        isStreaming = true;
        spinner.start();

        // Capture API errors via onError to prevent Bun from dumping
        // verbose stack traces before the JS catch block fires.
        let streamError: Error | null = null;
        const result = streamText({
          model,
          messages,
          temperature,
          maxOutputTokens,
          abortSignal: currentAbort.signal,
          onError: ({ error }) => {
            streamError = error as Error;
          },
        });

        // Stream the response
        let fullResponse = "";
        let firstChunk = true;

        if (markdown) {
          const renderer = new StreamingMarkdownRenderer();
          try {
            for await (const chunk of result.textStream) {
              if (firstChunk) {
                spinner.stop();
                console.error(""); // blank line before response
                firstChunk = false;
              }
              renderer.append(chunk);
              fullResponse += chunk;
            }
          } finally {
            if (firstChunk) {
              spinner.stop();
              process.stderr.write("\r\x1b[K"); // clear spinner line
            }
          }

          // If onError captured an API error, throw it now for clean formatting
          if (streamError) throw streamError;

          renderer.finish();
          fullResponse = renderer.getBuffer();
        } else {
          try {
            for await (const chunk of result.textStream) {
              if (firstChunk) {
                spinner.stop();
                // Print a visual separator before the response
                process.stdout.write(`\n${MAGENTA}`);
                firstChunk = false;
              }
              process.stdout.write(chunk);
              fullResponse += chunk;
            }
          } finally {
            if (firstChunk) {
              spinner.stop();
              process.stderr.write("\r\x1b[K"); // clear spinner line
            }
          }

          // If onError captured an API error, throw it now for clean formatting
          if (streamError) throw streamError;

          process.stdout.write(`${RESET}\n`);
        }

        isStreaming = false;
        currentAbort = null;

        // Add assistant response to history
        messages.push({ role: "assistant", content: fullResponse });

        // Always compute usage for budget tracking even if showCost is false
        const usage: UsageInfo | undefined = await result.usage;
        if (usage) {
          const { provider, modelId } = parseModelString(modelString);
          const costInfo = calculateCost({ provider, modelId, usage });

          runningCost.totalInputTokens += costInfo.inputTokens;
          runningCost.totalOutputTokens += costInfo.outputTokens;
          runningCost.totalCost += costInfo.totalCost;

          // Display cost if enabled — dim/gray text below response
          if (showCost) {
            const turnCost = formatCost(costInfo);
            console.error(
              `${DIM}  cost: ${turnCost} | session: $${runningCost.totalCost.toFixed(4)} (${runningCost.totalInputTokens.toLocaleString()} in, ${runningCost.totalOutputTokens.toLocaleString()} out)${RESET}`,
            );
          }

          // Check budget
          if (budget !== undefined && runningCost.totalCost > budget) {
            console.error(
              `\n${YELLOW}  Budget exceeded: $${runningCost.totalCost.toFixed(4)} (budget: $${budget.toFixed(4)})${RESET}`,
            );
            const answer = await new Promise<string>((res) => {
              rl.question(
                `${YELLOW}  Continue chatting? (y/n) ${RESET}`,
                (ans: string) => res(ans.trim().toLowerCase()),
              );
            });
            if (answer !== "y" && answer !== "yes") {
              console.error(`${DIM}Stopping due to budget.${RESET}`);
              rl.close();
              return;
            }
          }
        }
      } catch (err: unknown) {
        spinner.stop();
        isStreaming = false;
        currentAbort = null;

        // If the request was aborted by Ctrl+C, just inform the user
        if (
          err instanceof Error &&
          (err.name === "AbortError" || err.message.includes("aborted"))
        ) {
          console.error(`\n${YELLOW}  Response cancelled.${RESET}`);
          // Remove the user message that didn't get a response
          messages.pop();
        } else {
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            `\n${RED}${BOLD}  Error:${RESET}${RED} ${message}${RESET}`,
          );
          // Remove the failed user message so it doesn't pollute history
          messages.pop();
        }
      }

      console.error(""); // blank line after response block
      rl.setPrompt(buildPrompt(userMessageCount(messages)));
      rl.prompt();
    });

    rl.on("close", () => {
      if (showCost && runningCost.totalCost > 0) {
        console.error(
          `\n${DIM}Session total cost: $${runningCost.totalCost.toFixed(4)} (${runningCost.totalInputTokens.toLocaleString()} in, ${runningCost.totalOutputTokens.toLocaleString()} out)${RESET}`,
        );
      }
      resolve();
    });

    // Handle SIGINT (Ctrl+C) — cancel streaming or exit
    rl.on("SIGINT", () => {
      if (isStreaming && currentAbort) {
        // Cancel the current response instead of exiting
        currentAbort.abort();
      } else {
        console.error(`\n${DIM}Goodbye!${RESET}`);
        rl.close();
      }
    });
  });
}

/**
 * Get the current messages array from a chat session.
 * Exported for testing purposes.
 */
export { EXIT_COMMANDS, CLEAR_COMMAND };

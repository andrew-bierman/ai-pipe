import * as readline from "node:readline";
import { type LanguageModel, type ModelMessage, streamText } from "ai";

import type { UsageInfo } from "./cost.ts";
import { calculateCost, formatCost, parseModelString } from "./cost.ts";
import { renderMarkdown } from "./markdown.ts";

/** Commands that exit the chat session. */
const EXIT_COMMANDS = new Set(["exit", "quit", "/bye"]);

/** Commands that clear conversation history. */
const CLEAR_COMMAND = "/clear";

/** Options accepted by startChat. */
export interface ChatOptions {
  model: LanguageModel;
  modelString: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  markdown: boolean;
  showCost: boolean;
}

/** The accumulated cost totals across the chat session. */
interface RunningCost {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

/**
 * Start an interactive chat REPL.
 *
 * Maintains a conversation history in memory and streams responses by default.
 * Supports `/clear` to reset history, and `exit`/`quit`/`/bye`/Ctrl-C/Ctrl-D
 * to exit cleanly.
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

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    prompt: "> ",
    terminal: true,
  });

  console.error(`Chat mode started. Model: ${modelString}`);
  console.error(`Type "exit", "quit", "/bye", or press Ctrl+C/Ctrl+D to exit.`);
  console.error(`Type "/clear" to reset conversation history.\n`);

  rl.prompt();

  // Wrap the REPL loop in a promise so startChat awaits until exit
  return new Promise<void>((resolve) => {
    rl.on("line", async (input: string) => {
      const trimmed = input.trim();

      // Skip empty lines
      if (!trimmed) {
        rl.prompt();
        return;
      }

      // Handle exit commands
      if (EXIT_COMMANDS.has(trimmed.toLowerCase())) {
        console.error("\nGoodbye!");
        rl.close();
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
        console.error("Conversation history cleared.\n");
        rl.prompt();
        return;
      }

      // Add user message to history
      messages.push({ role: "user", content: trimmed });

      try {
        const result = streamText({
          model,
          messages,
          temperature,
          maxOutputTokens,
        });

        // Stream the response
        let fullResponse = "";
        if (markdown) {
          // Buffer the full response for markdown rendering
          for await (const chunk of result.textStream) {
            fullResponse += chunk;
          }
          process.stdout.write(renderMarkdown(fullResponse));
        } else {
          for await (const chunk of result.textStream) {
            process.stdout.write(chunk);
            fullResponse += chunk;
          }
          process.stdout.write("\n");
        }

        // Add assistant response to history
        messages.push({ role: "assistant", content: fullResponse });

        // Display cost if enabled
        if (showCost) {
          const usage: UsageInfo | undefined = await result.usage;
          if (usage) {
            const { provider, modelId } = parseModelString(modelString);
            const costInfo = calculateCost({ provider, modelId, usage });

            runningCost.totalInputTokens += costInfo.inputTokens;
            runningCost.totalOutputTokens += costInfo.outputTokens;
            runningCost.totalCost += costInfo.totalCost;

            const turnCost = formatCost(costInfo);
            console.error(`\nTurn cost: ${turnCost}`);
            console.error(
              `Session total: $${runningCost.totalCost.toFixed(4)} (${runningCost.totalInputTokens.toLocaleString()} in, ${runningCost.totalOutputTokens.toLocaleString()} out)`,
            );
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`\nError: ${message}`);
        // Remove the failed user message so it doesn't pollute history
        messages.pop();
      }

      process.stdout.write("\n");
      rl.prompt();
    });

    rl.on("close", () => {
      if (showCost && runningCost.totalCost > 0) {
        console.error(
          `\nSession total cost: $${runningCost.totalCost.toFixed(4)} (${runningCost.totalInputTokens.toLocaleString()} in, ${runningCost.totalOutputTokens.toLocaleString()} out)`,
        );
      }
      resolve();
    });

    // Handle SIGINT (Ctrl+C) gracefully
    rl.on("SIGINT", () => {
      console.error("\nGoodbye!");
      rl.close();
    });
  });
}

/**
 * Get the current messages array from a chat session.
 * Exported for testing purposes.
 */
export { EXIT_COMMANDS, CLEAR_COMMAND };

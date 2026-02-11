import { generateText } from "ai";
import type { UsageInfo } from "./cost.ts";
import { calculateCost, formatCost, parseModelString } from "./cost.ts";
import { resolveModel } from "./provider.ts";

export interface DiffResult {
  model: string;
  text: string;
  usage?: UsageInfo;
  cost?: string;
  durationMs: number;
  sources?: Array<{ url: string; title?: string }>;
  reasoning?: string;
}

export interface DiffOptions {
  models: string[];
  prompt: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  showCost?: boolean;
}

/**
 * Run the same prompt against multiple models and collect results.
 * Models are queried in parallel for speed.
 */
export async function runDiff(options: DiffOptions): Promise<DiffResult[]> {
  const results = await Promise.allSettled(
    options.models.map(async (modelString) => {
      const model = resolveModel(modelString);
      const start = performance.now();

      const result = await generateText({
        model,
        system: options.system,
        prompt: options.prompt,
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
      });

      const durationMs = performance.now() - start;
      const { provider, modelId } = parseModelString(modelString);
      const cost = options.showCost
        ? formatCost(calculateCost({ provider, modelId, usage: result.usage }))
        : undefined;

      const sources =
        result.sources?.length > 0
          ? result.sources
              .filter(
                (s): s is Extract<typeof s, { sourceType: "url" }> =>
                  s.sourceType === "url",
              )
              .map((s) => ({
                url: s.url,
                ...(s.title ? { title: s.title } : {}),
              }))
          : undefined;

      return {
        model: modelString,
        text: result.text,
        usage: result.usage,
        cost,
        durationMs,
        sources,
        reasoning: result.reasoningText ?? undefined,
      };
    }),
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      model: options.models[i] ?? "unknown",
      text: `Error: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
      durationMs: 0,
    };
  });
}

/**
 * Format diff results for terminal display.
 * Shows each model's response with a separator.
 */
export function formatDiffResults(results: DiffResult[]): string {
  const separator = "\u2500".repeat(60);
  const parts: string[] = [];

  for (const result of results) {
    const header = [
      `\ud83d\udcca ${result.model}`,
      `   \u23f1\ufe0f  ${(result.durationMs / 1000).toFixed(2)}s`,
      result.cost ? `   \ud83d\udcb0 ${result.cost}` : null,
      result.usage?.totalTokens
        ? `   \ud83d\udcdd ${result.usage.totalTokens} tokens`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    parts.push(`${separator}\n${header}\n${separator}\n\n${result.text}\n`);
  }

  return parts.join("\n");
}

/**
 * Format diff results as JSON.
 */
export function formatDiffJson(results: DiffResult[]): string {
  return JSON.stringify(
    results.map((r) => ({
      model: r.model,
      text: r.text,
      usage: r.usage,
      cost: r.cost,
      durationMs: Math.round(r.durationMs),
      ...(r.sources ? { sources: r.sources } : {}),
      ...(r.reasoning ? { reasoning: r.reasoning } : {}),
    })),
    null,
    2,
  );
}

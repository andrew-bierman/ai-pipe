import type { UsageInfo } from "./cost.ts";

export function formatResponseStats({
  usage,
  elapsedMs,
  firstTextMs,
  label,
}: {
  usage?: UsageInfo;
  elapsedMs: number;
  firstTextMs?: number;
  label?: string;
}): string {
  const parts = [`${(elapsedMs / 1000).toFixed(2)}s elapsed`];
  if (firstTextMs !== undefined) {
    parts.push(`${(firstTextMs / 1000).toFixed(2)}s to first text`);
  }
  if (usage?.inputTokens !== undefined) {
    parts.push(`${usage.inputTokens} input tokens`);
  }
  if (usage?.outputTokens !== undefined) {
    parts.push(`${usage.outputTokens} output tokens`);
    if (elapsedMs > 0) {
      parts.push(
        `${((usage.outputTokens * 1000) / elapsedMs).toFixed(1)} tok/s end-to-end`,
      );
    }
  }
  return `Stats${label ? ` (${label})` : ""}: ${parts.join(" · ")}`;
}

export function printResponseStats(
  stats: Parameters<typeof formatResponseStats>[0],
): void {
  console.error(formatResponseStats(stats));
}

import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { APP } from "./constants.ts";

const CACHE_DIR = join(homedir(), APP.configDirName, "cache");
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Schema for cached response data stored on disk */
export const CachedResponseSchema = z.object({
  text: z.string(),
  usage: z.object({
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    totalTokens: z.number().optional(),
  }),
  finishReason: z.string(),
  timestamp: z.number(),
  model: z.string(),
});

export type CachedResponse = z.infer<typeof CachedResponseSchema>;

/** Parameters used to build a cache key */
export interface CacheKeyParams {
  model: string;
  system: string | undefined;
  prompt: string;
  temperature: number | undefined;
  maxOutputTokens: number | undefined;
}

/**
 * Build a deterministic cache key from the request parameters.
 * Uses SHA-256 via Bun.CryptoHasher for a consistent hash.
 */
export function buildCacheKey(params: CacheKeyParams): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(params.model);
  hasher.update(params.system ?? "");
  hasher.update(params.prompt);
  hasher.update(String(params.temperature ?? ""));
  hasher.update(String(params.maxOutputTokens ?? ""));
  return hasher.digest("hex");
}

/**
 * Retrieve a cached response for the given cache key.
 * Returns null if the cache file does not exist or if the entry has expired.
 */
export async function getCachedResponse(
  key: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<CachedResponse | null> {
  const filePath = join(CACHE_DIR, `${key}.json`);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return null;
  }

  try {
    const raw = await file.json();
    const result = CachedResponseSchema.safeParse(raw);

    if (!result.success) {
      return null;
    }

    const entry = result.data;

    // Check TTL expiration
    if (Date.now() - entry.timestamp >= ttlMs) {
      return null;
    }

    return entry;
  } catch {
    return null;
  }
}

/**
 * Store a response in the cache under the given key.
 */
export async function setCachedResponse(
  key: string,
  response: Omit<CachedResponse, "timestamp">,
): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });

  const entry: CachedResponse = {
    ...response,
    timestamp: Date.now(),
  };

  const filePath = join(CACHE_DIR, `${key}.json`);
  await Bun.write(filePath, JSON.stringify(entry, null, 2));
}

/**
 * Remove all cached response files from the cache directory.
 */
export async function clearCache(): Promise<number> {
  try {
    const glob = new Bun.Glob("*.json");
    const files = await Array.fromAsync(glob.scan(CACHE_DIR));

    let removed = 0;
    for (const file of files) {
      const filePath = join(CACHE_DIR, file);
      const { unlink } = await import("node:fs/promises");
      await unlink(filePath);
      removed++;
    }

    return removed;
  } catch {
    return 0;
  }
}

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE_DIR =
  process.env.AI_PIPE_CACHE_DIR ?? join(homedir(), ".ai-pipe", "cache");
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CacheEntry {
  timestamp: number;
  ttlMs: number;
  response: string;
}

export interface CacheOptions {
  ttlMs?: number;
}

/**
 * Generate a SHA-256 hash of the cache key components
 */
export function generateCacheKey(
  provider: string,
  model: string,
  prompt: string,
): string {
  const keyString = `${provider}:${model}:${prompt}`;
  return createHash("sha256").update(keyString).digest("hex");
}

/**
 * Get the cache directory, ensuring it exists
 */
async function getCacheDir(): Promise<string> {
  await mkdir(CACHE_DIR, { recursive: true });
  return CACHE_DIR;
}

/**
 * Get the file path for a cache entry
 */
function getCachePath(key: string): string {
  return join(CACHE_DIR, `${key}.json`);
}

/**
 * Get a cached response if it exists and hasn't expired
 */
export async function getCachedResponse(
  provider: string,
  model: string,
  prompt: string,
  options?: CacheOptions,
): Promise<string | null> {
  const key = generateCacheKey(provider, model, prompt);
  const cachePath = getCachePath(key);

  try {
    const content = await readFile(cachePath, "utf-8");
    const entry: CacheEntry = JSON.parse(content);

    const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    const now = Date.now();

    // Check if the entry has expired
    if (now - entry.timestamp > ttlMs) {
      return null;
    }

    return entry.response;
  } catch {
    // File doesn't exist or is invalid - cache miss
    return null;
  }
}

/**
 * Store a response in the cache
 */
export async function setCachedResponse(
  provider: string,
  model: string,
  prompt: string,
  response: string,
  options?: CacheOptions,
): Promise<void> {
  const key = generateCacheKey(provider, model, prompt);
  const cachePath = getCachePath(key);
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;

  const entry: CacheEntry = {
    timestamp: Date.now(),
    ttlMs,
    response,
  };

  await writeFile(cachePath, JSON.stringify(entry), "utf-8");
}

/**
 * Clear all cached responses
 */
export async function clearCache(): Promise<void> {
  try {
    const files = await readdir(CACHE_DIR);
    await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map((f) => rm(join(CACHE_DIR, f))),
    );
  } catch {
    // Directory doesn't exist, nothing to clear
  }
}

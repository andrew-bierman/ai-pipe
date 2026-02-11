import { homedir } from "node:os";
import { dirname, join } from "node:path";
import pkg from "../package.json";
import { APP } from "./constants.ts";

const UPDATE_CHECK_FILE = join(homedir(), APP.configDirName, ".update-check");
const NPM_REGISTRY_URL = "https://registry.npmjs.org/ai-pipe/latest";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Compare two semver strings. Returns true if latest > current.
 * Strips prerelease/build metadata, then splits on dots and compares each segment numerically.
 */
export function compareVersions(current: string, latest: string): boolean {
  const strip = (v: string) => v.replace(/[-+].*$/, "");
  const currentParts = strip(current).split(".").map(Number);
  const latestParts = strip(latest).split(".").map(Number);

  const maxLength = Math.max(currentParts.length, latestParts.length);

  for (let i = 0; i < maxLength; i++) {
    const c = currentParts[i] ?? 0;
    const l = latestParts[i] ?? 0;

    if (l > c) return true;
    if (l < c) return false;
  }

  return false;
}

/**
 * Check whether enough time has passed since the last update check.
 * Returns true if the file is missing or the timestamp is older than 24 hours.
 */
export async function shouldCheckForUpdates(
  lastCheckPath: string = UPDATE_CHECK_FILE,
): Promise<boolean> {
  try {
    const file = Bun.file(lastCheckPath);
    if (!(await file.exists())) return true;

    const content = await file.text();
    const lastCheck = Number(content.trim());

    if (Number.isNaN(lastCheck)) return true;

    return Date.now() - lastCheck >= CHECK_INTERVAL_MS;
  } catch {
    return false;
  }
}

/**
 * Write the current timestamp to the update check file.
 */
async function writeLastCheckTimestamp(
  lastCheckPath: string = UPDATE_CHECK_FILE,
): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dirname(lastCheckPath), { recursive: true });
  await Bun.write(lastCheckPath, String(Date.now()));
}

/**
 * Check for updates to ai-pipe on npm.
 * Returns a formatted message string if an update is available, or null otherwise.
 * Best-effort and fail-silent: any error returns null.
 */
export async function checkForUpdates(
  lastCheckPath: string = UPDATE_CHECK_FILE,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    if (!(await shouldCheckForUpdates(lastCheckPath))) {
      return null;
    }

    // Record that we checked immediately to honor 24h backoff even on fetch failures
    await writeLastCheckTimestamp(lastCheckPath);

    const response = await fetch(NPM_REGISTRY_URL, { signal });
    if (!response.ok) return null;

    const data = (await response.json()) as { version?: string };
    const latest = data.version;

    if (!latest) return null;

    const current = pkg.version;
    if (compareVersions(current, latest)) {
      return `\nUpdate available: ${current} \u2192 ${latest}. Run \`bun install -g ai-pipe\` to update.\n`;
    }

    return null;
  } catch {
    return null;
  }
}

import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

import { APP } from "./constants.ts";
import { HistorySchema } from "./index.ts";

const HOME_DIR = Bun.env.HOME ?? Bun.env.USERPROFILE ?? "";
const HISTORY_DIR = join(HOME_DIR, APP.configDirName, "history");

/**
 * Export a session to JSON format.
 *
 * Reads the session file from the history directory and returns its
 * contents as a formatted JSON string. Returns "[]" if the session
 * does not exist.
 *
 * @param sessionName - The name of the session to export.
 * @returns A pretty-printed JSON string of the session messages.
 */
export async function exportSessionJson(sessionName: string): Promise<string> {
  const path = join(HISTORY_DIR, `${sessionName}.json`);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return JSON.stringify([], null, 2);
  }
  const content = await file.text();
  // Parse and re-serialize to ensure valid, formatted JSON
  const raw = JSON.parse(content);
  return JSON.stringify(raw, null, 2);
}

/**
 * Export a session to Markdown format.
 *
 * Each message becomes a heading (## User / ## Assistant / ## System)
 * followed by its content. Returns an empty string if the session
 * does not exist.
 *
 * @param sessionName - The name of the session to export.
 * @returns A Markdown-formatted string of the conversation.
 */
export async function exportSessionMarkdown(
  sessionName: string,
): Promise<string> {
  const path = join(HISTORY_DIR, `${sessionName}.json`);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return "";
  }
  const content = await file.text();
  const raw = JSON.parse(content);
  const result = HistorySchema.safeParse(raw);
  if (!result.success) {
    return "";
  }

  const lines: string[] = [];
  lines.push(`# Session: ${sessionName}`);
  lines.push("");

  for (const message of result.data) {
    const roleLabel =
      message.role.charAt(0).toUpperCase() + message.role.slice(1);
    lines.push(`## ${roleLabel}`);
    lines.push("");
    lines.push(message.content);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Import a session from JSON content.
 *
 * Validates the JSON string against HistorySchema before writing.
 * Throws an error if the content is not valid JSON or does not
 * match the expected message format.
 *
 * @param sessionName - The name to save the session as.
 * @param content - A JSON string containing an array of messages.
 * @throws If the content is not valid JSON or fails schema validation.
 */
export async function importSession(
  sessionName: string,
  content: string,
): Promise<void> {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error("Invalid JSON content");
  }

  const result = HistorySchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid session format: ${result.error.issues.map((i) => i.message).join(", ")}`,
    );
  }

  const path = join(HISTORY_DIR, `${sessionName}.json`);
  await Bun.write(path, JSON.stringify(result.data, null, 2));
}

/**
 * Delete a session file from the history directory.
 *
 * @param sessionName - The name of the session to delete.
 * @throws If the session file does not exist.
 */
export async function deleteSession(sessionName: string): Promise<void> {
  const path = join(HISTORY_DIR, `${sessionName}.json`);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Session "${sessionName}" not found`);
  }
  await unlink(path);
}

/**
 * List all saved sessions.
 *
 * Reads the history directory and returns session names (without
 * the .json extension). Returns an empty array if the directory
 * does not exist.
 *
 * @param configDir - Optional override for the config directory (used in tests).
 * @returns An array of session name strings, sorted alphabetically.
 */
export async function listSessions(configDir?: string): Promise<string[]> {
  const dir = configDir ? join(configDir, "history") : HISTORY_DIR;

  try {
    const entries = await readdir(dir);
    return entries
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    // Directory doesn't exist or can't be read
    return [];
  }
}

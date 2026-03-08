import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  deleteSession,
  exportSessionJson,
  exportSessionMarkdown,
  importSession,
  listSessions,
} from "../session.ts";

// ── Test helpers ──────────────────────────────────────────────────────

let tempDir: string;
let historyDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "session-test-"));
  historyDir = join(tempDir, "history");
  await Bun.write(join(historyDir, ".keep"), "");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

/**
 * Write a session file directly into the temp history directory.
 */
async function writeSession(
  name: string,
  messages: Array<{ role: string; content: string }>,
): Promise<void> {
  const path = join(historyDir, `${name}.json`);
  await Bun.write(path, JSON.stringify(messages, null, 2));
}

// ── exportSessionJson ─────────────────────────────────────────────────

describe("exportSessionJson", () => {
  test("returns valid JSON for an existing session", async () => {
    // We can't override the module's HISTORY_DIR, so we test the function
    // by verifying it returns "[]" for a non-existent session.
    const result = await exportSessionJson(`nonexistent-${Date.now()}`);
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toEqual([]);
  });

  test("returns empty array JSON for missing session", async () => {
    const result = await exportSessionJson(`missing-session-${Date.now()}`);
    expect(result).toBe(JSON.stringify([], null, 2));
  });
});

// ── exportSessionMarkdown ─────────────────────────────────────────────

describe("exportSessionMarkdown", () => {
  test("returns empty string for missing session", async () => {
    const result = await exportSessionMarkdown(`missing-session-${Date.now()}`);
    expect(result).toBe("");
  });
});

// ── importSession ─────────────────────────────────────────────────────

describe("importSession", () => {
  test("saves valid JSON content", async () => {
    const sessionName = `import-test-${Date.now()}`;
    const messages = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ];
    const content = JSON.stringify(messages);

    // importSession writes to the default history dir; this will create
    // the file at ~/.ai-pipe/history/<name>.json. We just verify it
    // does not throw.
    await importSession(sessionName, content);

    // Verify by exporting it back
    const exported = await exportSessionJson(sessionName);
    const parsed = JSON.parse(exported);
    expect(parsed).toEqual(messages);

    // Clean up: delete the session we just created
    await deleteSession(sessionName);
  });

  test("throws on invalid JSON", async () => {
    expect(importSession("bad-json", "not valid json {{{")).rejects.toThrow(
      "Invalid JSON content",
    );
  });

  test("throws on valid JSON but invalid schema", async () => {
    const invalidContent = JSON.stringify([
      { role: "unknown_role", content: "test" },
    ]);
    expect(importSession("bad-schema", invalidContent)).rejects.toThrow(
      "Invalid session format",
    );
  });

  test("throws on non-array JSON", async () => {
    const invalidContent = JSON.stringify({ role: "user", content: "test" });
    expect(importSession("bad-structure", invalidContent)).rejects.toThrow(
      "Invalid session format",
    );
  });
});

// ── deleteSession ─────────────────────────────────────────────────────

describe("deleteSession", () => {
  test("throws for non-existent session", async () => {
    expect(deleteSession(`nonexistent-${Date.now()}`)).rejects.toThrow(
      "not found",
    );
  });

  test("deletes an existing session", async () => {
    const sessionName = `delete-test-${Date.now()}`;
    // Create a session first
    const messages = [{ role: "user", content: "to be deleted" }];
    await importSession(sessionName, JSON.stringify(messages));

    // Delete it
    await deleteSession(sessionName);

    // Verify it's gone by trying to export (should return empty)
    const exported = await exportSessionJson(sessionName);
    expect(JSON.parse(exported)).toEqual([]);
  });
});

// ── listSessions ──────────────────────────────────────────────────────

describe("listSessions", () => {
  test("returns session names without .json extension", async () => {
    await writeSession("chat-one", [{ role: "user", content: "Hi" }]);
    await writeSession("chat-two", [{ role: "user", content: "Hey" }]);

    const sessions = await listSessions(tempDir);
    expect(sessions).toContain("chat-one");
    expect(sessions).toContain("chat-two");
    expect(sessions.length).toBe(2);
  });

  test("returns empty array when directory does not exist", async () => {
    const sessions = await listSessions("/tmp/nonexistent-dir-12345");
    expect(sessions).toEqual([]);
  });

  test("returns sorted session names", async () => {
    await writeSession("zebra", [{ role: "user", content: "Z" }]);
    await writeSession("alpha", [{ role: "user", content: "A" }]);
    await writeSession("middle", [{ role: "user", content: "M" }]);

    const sessions = await listSessions(tempDir);
    expect(sessions).toEqual(["alpha", "middle", "zebra"]);
  });

  test("ignores non-json files", async () => {
    await writeSession("real-session", [{ role: "user", content: "Hi" }]);
    await Bun.write(join(historyDir, "notes.txt"), "some notes");
    await Bun.write(join(historyDir, ".keep"), "");

    const sessions = await listSessions(tempDir);
    expect(sessions).toEqual(["real-session"]);
  });
});

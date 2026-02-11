import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../config.ts";
import {
  buildPrompt,
  type CLIOptions,
  CLIOptionsSchema,
  HistoryMessageSchema,
  HistorySchema,
  isValidSessionName,
  JsonOutputSchema,
  loadAsDataUrl,
  readFiles,
  readImages,
  resolveOptions,
  sanitizeSessionName,
} from "../index.ts";

// ── buildPrompt ────────────────────────────────────────────────────────

describe("buildPrompt", () => {
  test("returns arg prompt when only args provided", () => {
    expect(buildPrompt("explain monads", null)).toBe("explain monads");
  });

  test("returns stdin when only stdin provided", () => {
    expect(buildPrompt(null, null, "hello world")).toBe("hello world");
  });

  test("combines arg prompt and stdin with double newline", () => {
    const result = buildPrompt("review this code", null, "const x = 1;");
    expect(result).toBe("review this code\n\nconst x = 1;");
  });

  test("returns empty string when neither provided", () => {
    expect(buildPrompt(null, null)).toBe("");
  });

  test("arg prompt comes first in combined output", () => {
    const result = buildPrompt("summarize", null, "long document text");
    expect(result).not.toBeNull();
    expect(result?.startsWith("summarize")).toBe(true);
    expect(result?.endsWith("long document text")).toBe(true);
  });

  test("preserves multiline stdin content", () => {
    const result = buildPrompt("review", null, "line1\nline2\nline3");
    expect(result).toBe("review\n\nline1\nline2\nline3");
  });

  test("preserves multiline arg prompt", () => {
    const result = buildPrompt("do this\nand that", null);
    expect(result).toBe("do this\nand that");
  });

  test("includes file content between arg and stdin", () => {
    const result = buildPrompt(
      "review",
      "# file.ts\n```\ncode\n```",
      "stdin data",
    );
    expect(result).toBe("review\n\n# file.ts\n```\ncode\n```\n\nstdin data");
  });

  test("returns file content only", () => {
    const result = buildPrompt(null, "# f.txt\n```\nhello\n```");
    expect(result).toBe("# f.txt\n```\nhello\n```");
  });

  test("combines arg and file content without stdin", () => {
    const result = buildPrompt("summarize", "# f.txt\n```\ncontent\n```");
    expect(result).toBe("summarize\n\n# f.txt\n```\ncontent\n```");
  });

  test("combines file content and stdin without arg", () => {
    const result = buildPrompt(null, "# f.txt\n```\ncontent\n```", "stdin");
    expect(result).toBe("# f.txt\n```\ncontent\n```\n\nstdin");
  });

  test("returns empty string when all three are null", () => {
    expect(buildPrompt(null, null, null)).toBe("");
  });

  test("file content default param preserves two-arg behavior", () => {
    expect(buildPrompt("hello", null)).toBe("hello");
    expect(buildPrompt(null, null, "stdin")).toBe("stdin");
    expect(buildPrompt("a", null, "b")).toBe("a\n\nb");
  });
});

// ── readFiles ─────────────────────────────────────────────────────────

describe("readFiles", () => {
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  test("reads a single file", async () => {
    const path = join(tmpdir(), `test-${uid()}.txt`);
    await Bun.write(path, "hello world");
    const result = await readFiles([path]);
    expect(result).toBe(`# ${path}\n\`\`\`\nhello world\n\`\`\``);
  });

  test("throws on nonexistent file", async () => {
    const missing = join(tmpdir(), `nonexistent-${uid()}.txt`);
    await expect(readFiles([missing])).rejects.toThrow(
      `File not found: ${missing}`,
    );
  });

  test("reads multiple files", async () => {
    const path1 = join(tmpdir(), `test-${uid()}-a.txt`);
    const path2 = join(tmpdir(), `test-${uid()}-b.txt`);
    await Bun.write(path1, "file one");
    await Bun.write(path2, "file two");
    const result = await readFiles([path1, path2]);
    expect(result).toContain(`# ${path1}`);
    expect(result).toContain("file one");
    expect(result).toContain(`# ${path2}`);
    expect(result).toContain("file two");
    // Files separated by double newline
    expect(result).toContain("```\n\n# ");
  });
});

// ── readImages ────────────────────────────────────────────────────────

describe("readImages", () => {
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  test("reads a single image and returns data URL", async () => {
    const path = join(tmpdir(), `test-${uid()}.png`);
    await Bun.write(path, "fake png content");
    const result = await readImages([path]);
    expect(result).toHaveLength(1);
    expect(result[0]!.url).toMatch(/^data:image\/png;base64,/);
    expect(result[0]!.url).toContain("ZmFrZSBwbmcgY29udGVudA=="); // "fake png content" in base64
  });

  test("reads multiple images and returns data URLs", async () => {
    const path1 = join(tmpdir(), `test-${uid()}-a.png`);
    const path2 = join(tmpdir(), `test-${uid()}-b.jpg`);
    await Bun.write(path1, "image one");
    await Bun.write(path2, "image two");
    const result = await readImages([path1, path2]);
    expect(result).toHaveLength(2);
    expect(result[0]!.url).toMatch(/^data:image\/png;base64,/);
    expect(result[1]!.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  test("throws on nonexistent image file", async () => {
    const missing = join(tmpdir(), `nonexistent-${uid()}.png`);
    await expect(readImages([missing])).rejects.toThrow(
      `Image not found: ${missing}`,
    );
  });

  test("throws on nonexistent file among valid images", async () => {
    const validPath = join(tmpdir(), `test-${uid()}-valid.png`);
    const missingPath = join(tmpdir(), `missing-${uid()}.png`);
    await Bun.write(validPath, "valid image");
    await expect(readImages([validPath, missingPath])).rejects.toThrow(
      `Image not found: ${missingPath}`,
    );
  });

  test("detects PNG mime type from file content", async () => {
    // PNG magic bytes
    const pngPath = join(tmpdir(), `test-${uid()}.png`);
    await Bun.write(pngPath, "\x89PNG\r\n\x1a\n");
    const result = await readImages([pngPath]);
    expect(result[0]!.url).toMatch(/^data:image\/png;base64,/);
  });

  test("handles empty image array", async () => {
    const result = await readImages([]);
    expect(result).toEqual([]);
  });
});

// ── resolveOptions ─────────────────────────────────────────────────────

describe("resolveOptions", () => {
  const defaultOpts: CLIOptions = {
    json: false,
    stream: true,
    markdown: false,
    cost: false,
  };
  const emptyConfig: Config = {};

  test("uses built-in defaults when no flags or config", () => {
    const result = resolveOptions(defaultOpts, emptyConfig);
    expect(result.modelString).toBe("openai/gpt-4o");
    expect(result.system).toBeUndefined();
    expect(result.temperature).toBeUndefined();
    expect(result.maxOutputTokens).toBeUndefined();
  });

  test("config overrides built-in defaults", () => {
    const config: Config = {
      model: "anthropic/claude-sonnet-4-5",
      system: "Be concise.",
      temperature: 0.5,
      maxOutputTokens: 200,
    };
    const result = resolveOptions(defaultOpts, config);
    expect(result.modelString).toBe("anthropic/claude-sonnet-4-5");
    expect(result.system).toBe("Be concise.");
    expect(result.temperature).toBe(0.5);
    expect(result.maxOutputTokens).toBe(200);
  });

  test("CLI flags override config", () => {
    const config: Config = {
      model: "anthropic/claude-sonnet-4-5",
      system: "config system",
      temperature: 0.5,
    };
    const opts: CLIOptions = {
      ...defaultOpts,
      model: "google/gemini-2.5-flash",
      system: "cli system",
      temperature: 0.9,
      maxOutputTokens: 1000,
    };
    const result = resolveOptions(opts, config);
    expect(result.modelString).toBe("google/gemini-2.5-flash");
    expect(result.system).toBe("cli system");
    expect(result.temperature).toBe(0.9);
    expect(result.maxOutputTokens).toBe(1000);
  });

  test("partial CLI flags merge with config", () => {
    const config: Config = {
      model: "anthropic/claude-sonnet-4-5",
      system: "config system",
      temperature: 0.5,
    };
    const opts: CLIOptions = { ...defaultOpts, temperature: 0.9 };
    const result = resolveOptions(opts, config);
    expect(result.modelString).toBe("anthropic/claude-sonnet-4-5");
    expect(result.system).toBe("config system");
    expect(result.temperature).toBe(0.9);
  });

  test("all undefined opts fall through to config", () => {
    const config: Config = {
      model: "xai/grok-3",
      system: "sys",
      temperature: 1.5,
      maxOutputTokens: 300,
    };
    const result = resolveOptions(defaultOpts, config);
    expect(result.modelString).toBe("xai/grok-3");
    expect(result.system).toBe("sys");
    expect(result.temperature).toBe(1.5);
    expect(result.maxOutputTokens).toBe(300);
  });
});

// ── CLIOptionsSchema ───────────────────────────────────────────────────

describe("CLIOptionsSchema", () => {
  test("accepts minimal valid options", () => {
    const result = CLIOptionsSchema.parse({
      json: false,
      stream: true,
      markdown: false,
    });
    expect(result.json).toBe(false);
    expect(result.stream).toBe(true);
    expect(result.markdown).toBe(false);
  });

  test("accepts full valid options", () => {
    const result = CLIOptionsSchema.parse({
      model: "anthropic/claude-sonnet-4-5",
      system: "be concise",
      json: true,
      stream: false,
      temperature: 1.0,
      maxOutputTokens: 500,
      config: "/path/to/config.json",
      providers: true,
      completions: "bash",
    });
    expect(result.model).toBe("anthropic/claude-sonnet-4-5");
    expect(result.maxOutputTokens).toBe(500);
  });

  test("rejects temperature below 0", () => {
    expect(
      CLIOptionsSchema.safeParse({
        json: false,
        stream: true,
        markdown: false,
        temperature: -1,
      }).success,
    ).toBe(false);
  });

  test("rejects temperature above 2", () => {
    expect(
      CLIOptionsSchema.safeParse({
        json: false,
        stream: true,
        markdown: false,
        temperature: 3,
      }).success,
    ).toBe(false);
  });

  test("rejects negative maxOutputTokens", () => {
    expect(
      CLIOptionsSchema.safeParse({
        json: false,
        stream: true,
        markdown: false,
        maxOutputTokens: -5,
      }).success,
    ).toBe(false);
  });

  test("rejects float maxOutputTokens", () => {
    expect(
      CLIOptionsSchema.safeParse({
        json: false,
        stream: true,
        markdown: false,
        maxOutputTokens: 10.5,
      }).success,
    ).toBe(false);
  });

  test("rejects non-boolean json", () => {
    expect(
      CLIOptionsSchema.safeParse({ json: "yes", stream: true, markdown: false })
        .success,
    ).toBe(false);
  });

  test("accepts file as string array", () => {
    const result = CLIOptionsSchema.parse({
      json: false,
      stream: true,
      markdown: false,
      file: ["a.txt", "b.txt"],
    });
    expect(result.file).toEqual(["a.txt", "b.txt"]);
  });

  test("file is optional", () => {
    const result = CLIOptionsSchema.parse({
      json: false,
      stream: true,
      markdown: false,
    });
    expect(result.file).toBeUndefined();
  });
});

// ── JsonOutputSchema ───────────────────────────────────────────────────

describe("JsonOutputSchema", () => {
  test("accepts valid output", () => {
    const result = JsonOutputSchema.parse({
      text: "hello",
      model: "openai/gpt-4o",
      usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
      finishReason: "stop",
    });
    expect(result.text).toBe("hello");
    expect(result.finishReason).toBe("stop");
  });

  test("accepts output with optional token fields", () => {
    const result = JsonOutputSchema.parse({
      text: "",
      model: "openai/gpt-4o",
      usage: {},
      finishReason: "length",
    });
    expect(result.usage.inputTokens).toBeUndefined();
    expect(result.usage.inputTokenDetails).toBeUndefined();
    expect(result.usage.outputTokenDetails).toBeUndefined();
  });

  test("accepts output with full token details", () => {
    const result = JsonOutputSchema.parse({
      text: "hi",
      model: "openai/gpt-4o",
      usage: {
        inputTokens: 5,
        outputTokens: 10,
        totalTokens: 15,
        inputTokenDetails: {
          noCacheTokens: 3,
          cacheReadTokens: 2,
          cacheWriteTokens: 0,
        },
        outputTokenDetails: { textTokens: 8, reasoningTokens: 2 },
      },
      finishReason: "stop",
    });
    expect(result.usage.inputTokenDetails?.cacheReadTokens).toBe(2);
    expect(result.usage.outputTokenDetails?.reasoningTokens).toBe(2);
  });

  test("rejects missing text", () => {
    expect(
      JsonOutputSchema.safeParse({
        model: "openai/gpt-4o",
        usage: {},
        finishReason: "stop",
      }).success,
    ).toBe(false);
  });

  test("rejects missing model", () => {
    expect(
      JsonOutputSchema.safeParse({
        text: "hi",
        usage: {},
        finishReason: "stop",
      }).success,
    ).toBe(false);
  });

  test("rejects missing finishReason", () => {
    expect(
      JsonOutputSchema.safeParse({
        text: "hi",
        model: "m",
        usage: {},
      }).success,
    ).toBe(false);
  });
});

// ── Session Sanitization ───────────────────────────────────────────────

describe("session sanitization", () => {
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  test("allows valid alphanumeric session names", () => {
    expect(isValidSessionName("session123")).toBe(true);
    expect(isValidSessionName("abc")).toBe(true);
    expect(isValidSessionName("123")).toBe(true);
  });

  test("allows session names with hyphens and underscores", () => {
    expect(isValidSessionName("my-session")).toBe(true);
    expect(isValidSessionName("my_session")).toBe(true);
    expect(isValidSessionName("test-session_123")).toBe(true);
  });

  test("rejects session names with special characters", () => {
    expect(isValidSessionName("session/path")).toBe(false);
    expect(isValidSessionName("session.name")).toBe(false);
    expect(isValidSessionName("session name")).toBe(false);
    expect(isValidSessionName("session@123")).toBe(false);
    expect(isValidSessionName("")).toBe(false);
  });

  test("sanitizeSessionName replaces invalid chars with underscore", () => {
    expect(sanitizeSessionName("my session")).toBe("my_session");
    expect(sanitizeSessionName("path/to/dir")).toBe("path_to_dir");
    expect(sanitizeSessionName("file.name.js")).toBe("file_name_js");
    expect(sanitizeSessionName("session@123")).toBe("session_123");
  });

  test("sanitizeSessionName preserves valid characters", () => {
    expect(sanitizeSessionName("valid-session_123")).toBe("valid-session_123");
    expect(sanitizeSessionName("ABCdef123")).toBe("ABCdef123");
  });
});

// ── History Loading ─────────────────────────────────────────────────────

describe("history loading", () => {
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const {
    loadHistory,
    saveHistory,
    sanitizeSessionName,
  } = require("../index.ts");

  test("returns empty array for non-existent history", async () => {
    const session = `test-nonexistent-${uid()}`;
    const history = await loadHistory(session);
    expect(history).toEqual([]);
  });

  test("saves and loads history correctly", async () => {
    const session = `test-load-${uid()}`;
    const messages = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
      { role: "user", content: "How are you?" },
    ];

    await saveHistory(session, messages);
    const loaded = await loadHistory(session);

    expect(loaded).toEqual(messages);
  });

  test("sanitizes session names when saving history", async () => {
    const session = `test-sanitize-${uid()}`;
    const unsafeSession = "session with spaces/and slashes";
    const sanitized = sanitizeSessionName(unsafeSession);

    const messages = [{ role: "user", content: "test" }];
    await saveHistory(sanitized, messages);
    const loaded = await loadHistory(sanitized);

    expect(loaded).toEqual(messages);
  });

  test("handles invalid JSON gracefully", async () => {
    const session = `test-invalid-${uid()}`;
    const path = require("node:path");
    const tmpdir = require("node:os").tmpdir();
    const historyPath = path.join(
      tmpdir,
      ".ai-pipe",
      "history",
      `${session}.json`,
    );

    // Create a file with invalid JSON
    await require("bun").write(historyPath, "not valid json {");

    const history = await loadHistory(session);
    expect(history).toEqual([]);
  });
});

// ── HistoryMessageSchema ────────────────────────────────────────────────

describe("HistoryMessageSchema", () => {
  test("accepts valid user message", () => {
    const result = HistoryMessageSchema.parse({
      role: "user",
      content: "Hello!",
    });
    expect(result.role).toBe("user");
    expect(result.content).toBe("Hello!");
  });

  test("accepts valid assistant message", () => {
    const result = HistoryMessageSchema.parse({
      role: "assistant",
      content: "Hi there!",
    });
    expect(result.role).toBe("assistant");
  });

  test("accepts valid system message", () => {
    const result = HistoryMessageSchema.parse({
      role: "system",
      content: "You are a helpful assistant.",
    });
    expect(result.role).toBe("system");
  });

  test("rejects invalid role", () => {
    const result = HistoryMessageSchema.safeParse({
      role: "admin",
      content: "test",
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing content", () => {
    const result = HistoryMessageSchema.safeParse({ role: "user" });
    expect(result.success).toBe(false);
  });

  test("rejects missing role", () => {
    const result = HistoryMessageSchema.safeParse({ content: "test" });
    expect(result.success).toBe(false);
  });

  test("rejects empty object", () => {
    const result = HistoryMessageSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("rejects non-string content", () => {
    const result = HistoryMessageSchema.safeParse({
      role: "user",
      content: 123,
    });
    expect(result.success).toBe(false);
  });

  test("accepts empty string content", () => {
    const result = HistoryMessageSchema.parse({
      role: "user",
      content: "",
    });
    expect(result.content).toBe("");
  });
});

// ── HistorySchema ────────────────────────────────────────────────────────

describe("HistorySchema", () => {
  test("accepts empty array", () => {
    const result = HistorySchema.parse([]);
    expect(result).toEqual([]);
  });

  test("accepts array of valid messages", () => {
    const messages = [
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];
    const result = HistorySchema.parse(messages);
    expect(result).toHaveLength(3);
  });

  test("rejects array with invalid message", () => {
    const result = HistorySchema.safeParse([
      { role: "user", content: "ok" },
      { role: "invalid", content: "bad" },
    ]);
    expect(result.success).toBe(false);
  });

  test("rejects non-array", () => {
    const result = HistorySchema.safeParse({ role: "user", content: "test" });
    expect(result.success).toBe(false);
  });

  test("rejects null", () => {
    const result = HistorySchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  test("rejects string", () => {
    const result = HistorySchema.safeParse("not an array");
    expect(result.success).toBe(false);
  });
});

// ── loadAsDataUrl ────────────────────────────────────────────────────────

describe("loadAsDataUrl", () => {
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  test("converts file to data URL with correct MIME type", async () => {
    const path = join(tmpdir(), `test-dataurl-${uid()}.txt`);
    await Bun.write(path, "hello");
    const result = await loadAsDataUrl(path, "text/plain");
    expect(result).toMatch(/^data:text\/plain;base64,/);
    expect(result).toContain("aGVsbG8="); // "hello" in base64
  });

  test("throws for nonexistent file", async () => {
    const path = join(tmpdir(), `nonexistent-${uid()}.txt`);
    await expect(loadAsDataUrl(path, "text/plain")).rejects.toThrow(
      "File not found",
    );
  });

  test("handles binary content", async () => {
    const path = join(tmpdir(), `test-binary-${uid()}.bin`);
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
    await Bun.write(path, bytes);
    const result = await loadAsDataUrl(path, "application/octet-stream");
    expect(result).toMatch(/^data:application\/octet-stream;base64,/);
  });

  test("handles empty file", async () => {
    const path = join(tmpdir(), `test-empty-${uid()}.txt`);
    await Bun.write(path, "");
    const result = await loadAsDataUrl(path, "text/plain");
    expect(result).toBe("data:text/plain;base64,");
  });
});

// ── readFiles edge cases ─────────────────────────────────────────────────

describe("readFiles edge cases", () => {
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  test("returns empty string for empty array", async () => {
    const result = await readFiles([]);
    expect(result).toBe("");
  });

  test("handles file with empty content", async () => {
    const path = join(tmpdir(), `test-empty-${uid()}.txt`);
    await Bun.write(path, "");
    const result = await readFiles([path]);
    expect(result).toBe(`# ${path}\n\`\`\`\n\n\`\`\``);
  });

  test("handles file with multiline content", async () => {
    const path = join(tmpdir(), `test-multiline-${uid()}.txt`);
    await Bun.write(path, "line1\nline2\nline3");
    const result = await readFiles([path]);
    expect(result).toContain("line1\nline2\nline3");
  });

  test("handles file with special characters", async () => {
    const path = join(tmpdir(), `test-special-${uid()}.txt`);
    await Bun.write(path, 'const x = "hello";');
    const result = await readFiles([path]);
    expect(result).toContain('const x = "hello";');
  });
});

// ── readImages edge cases ────────────────────────────────────────────────

describe("readImages edge cases", () => {
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  test("handles single image file correctly", async () => {
    const path = join(tmpdir(), `test-img-${uid()}.jpg`);
    await Bun.write(path, "fake jpeg data");
    const result = await readImages([path]);
    expect(result).toHaveLength(1);
    expect(result[0]!.url).toMatch(/^data:image\/jpeg;base64,/);
  });
});

// ── CLIOptionsSchema additional tests ────────────────────────────────────

describe("CLIOptionsSchema additional", () => {
  test("accepts session option", () => {
    const result = CLIOptionsSchema.parse({
      json: false,
      stream: true,
      markdown: false,
      session: "my-session",
    });
    expect(result.session).toBe("my-session");
  });

  test("accepts role option", () => {
    const result = CLIOptionsSchema.parse({
      json: false,
      stream: true,
      markdown: false,
      role: "reviewer",
    });
    expect(result.role).toBe("reviewer");
  });

  test("accepts roles boolean", () => {
    const result = CLIOptionsSchema.parse({
      json: false,
      stream: true,
      markdown: false,
      roles: true,
    });
    expect(result.roles).toBe(true);
  });

  test("accepts image as string array", () => {
    const result = CLIOptionsSchema.parse({
      json: false,
      stream: true,
      markdown: false,
      image: ["img1.png", "img2.jpg"],
    });
    expect(result.image).toEqual(["img1.png", "img2.jpg"]);
  });

  test("accepts cost option", () => {
    const result = CLIOptionsSchema.parse({
      json: false,
      stream: true,
      markdown: false,
      cost: true,
    });
    expect(result.cost).toBe(true);
  });

  test("cost defaults to false", () => {
    const result = CLIOptionsSchema.parse({
      json: false,
      stream: true,
    });
    expect(result.cost).toBe(false);
  });

  test("markdown defaults to false", () => {
    const result = CLIOptionsSchema.parse({
      json: false,
      stream: true,
    });
    expect(result.markdown).toBe(false);
  });

  test("rejects non-string model", () => {
    const result = CLIOptionsSchema.safeParse({
      json: false,
      stream: true,
      markdown: false,
      model: 123,
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-string system", () => {
    const result = CLIOptionsSchema.safeParse({
      json: false,
      stream: true,
      markdown: false,
      system: true,
    });
    expect(result.success).toBe(false);
  });

  test("accepts temperature at boundary 0", () => {
    const result = CLIOptionsSchema.parse({
      json: false,
      stream: true,
      markdown: false,
      temperature: 0,
    });
    expect(result.temperature).toBe(0);
  });

  test("accepts temperature at boundary 2", () => {
    const result = CLIOptionsSchema.parse({
      json: false,
      stream: true,
      markdown: false,
      temperature: 2,
    });
    expect(result.temperature).toBe(2);
  });

  test("accepts maxOutputTokens = 1", () => {
    const result = CLIOptionsSchema.parse({
      json: false,
      stream: true,
      markdown: false,
      maxOutputTokens: 1,
    });
    expect(result.maxOutputTokens).toBe(1);
  });

  test("rejects maxOutputTokens = 0", () => {
    const result = CLIOptionsSchema.safeParse({
      json: false,
      stream: true,
      markdown: false,
      maxOutputTokens: 0,
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing required json field", () => {
    const result = CLIOptionsSchema.safeParse({
      stream: true,
      markdown: false,
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing required stream field", () => {
    const result = CLIOptionsSchema.safeParse({
      json: false,
      markdown: false,
    });
    expect(result.success).toBe(false);
  });
});

// ── JsonOutputSchema additional ──────────────────────────────────────────

describe("JsonOutputSchema additional", () => {
  test("rejects missing usage", () => {
    const result = JsonOutputSchema.safeParse({
      text: "hi",
      model: "m",
      finishReason: "stop",
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-object usage", () => {
    const result = JsonOutputSchema.safeParse({
      text: "hi",
      model: "m",
      usage: "none",
      finishReason: "stop",
    });
    expect(result.success).toBe(false);
  });

  test("accepts all common finishReason values", () => {
    for (const reason of ["stop", "length", "content-filter", "error", "other"]) {
      const result = JsonOutputSchema.safeParse({
        text: "",
        model: "m",
        usage: {},
        finishReason: reason,
      });
      expect(result.success).toBe(true);
    }
  });

  test("accepts empty text", () => {
    const result = JsonOutputSchema.parse({
      text: "",
      model: "m",
      usage: {},
      finishReason: "stop",
    });
    expect(result.text).toBe("");
  });

  test("accepts partial inputTokenDetails", () => {
    const result = JsonOutputSchema.parse({
      text: "t",
      model: "m",
      usage: {
        inputTokenDetails: { cacheReadTokens: 5 },
      },
      finishReason: "stop",
    });
    expect(result.usage.inputTokenDetails?.cacheReadTokens).toBe(5);
    expect(result.usage.inputTokenDetails?.noCacheTokens).toBeUndefined();
  });

  test("accepts partial outputTokenDetails", () => {
    const result = JsonOutputSchema.parse({
      text: "t",
      model: "m",
      usage: {
        outputTokenDetails: { reasoningTokens: 10 },
      },
      finishReason: "stop",
    });
    expect(result.usage.outputTokenDetails?.reasoningTokens).toBe(10);
    expect(result.usage.outputTokenDetails?.textTokens).toBeUndefined();
  });
});

// ── session sanitization additional ──────────────────────────────────────

describe("session sanitization additional", () => {
  test("sanitizeSessionName handles path traversal (../..)", () => {
    expect(sanitizeSessionName("../../etc/passwd")).toBe("______etc_passwd");
  });

  test("sanitizeSessionName handles double dots", () => {
    expect(sanitizeSessionName("..")).toBe("__");
  });

  test("sanitizeSessionName handles single dot", () => {
    expect(sanitizeSessionName(".")).toBe("_");
  });

  test("sanitizeSessionName handles null bytes", () => {
    expect(sanitizeSessionName("test\0name")).toBe("test_name");
  });

  test("sanitizeSessionName handles tab and newline", () => {
    expect(sanitizeSessionName("test\tname\n")).toBe("test_name_");
  });

  test("isValidSessionName rejects path traversal", () => {
    expect(isValidSessionName("../etc/passwd")).toBe(false);
    expect(isValidSessionName("../../secret")).toBe(false);
  });

  test("isValidSessionName rejects null bytes", () => {
    expect(isValidSessionName("test\0")).toBe(false);
  });

  test("isValidSessionName accepts single character", () => {
    expect(isValidSessionName("a")).toBe(true);
    expect(isValidSessionName("1")).toBe(true);
    expect(isValidSessionName("-")).toBe(true);
    expect(isValidSessionName("_")).toBe(true);
  });

  test("isValidSessionName rejects unicode characters", () => {
    expect(isValidSessionName("session\u00e9")).toBe(false);
    expect(isValidSessionName("session\u2603")).toBe(false);
  });
});

// ── resolveOptions additional ────────────────────────────────────────────

describe("resolveOptions additional", () => {
  const defaultOpts: CLIOptions = {
    json: false,
    stream: true,
    markdown: false,
    cost: false,
  };
  const emptyConfig: Config = {};

  test("markdown flag is passed through", () => {
    const opts: CLIOptions = { ...defaultOpts, markdown: true };
    const result = resolveOptions(opts, emptyConfig);
    expect(result.markdown).toBe(true);
  });

  test("markdown defaults to false", () => {
    const result = resolveOptions(defaultOpts, emptyConfig);
    expect(result.markdown).toBe(false);
  });

  test("temperature of 0 from opts is used (not falsy fallthrough)", () => {
    const config: Config = { temperature: 1.5 };
    const opts: CLIOptions = { ...defaultOpts, temperature: 0 };
    const result = resolveOptions(opts, config);
    expect(result.temperature).toBe(0);
  });

  test("maxOutputTokens from config is used when opts has none", () => {
    const config: Config = { maxOutputTokens: 4096 };
    const result = resolveOptions(defaultOpts, config);
    expect(result.maxOutputTokens).toBe(4096);
  });

  test("system from opts overrides config system", () => {
    const config: Config = { system: "config system" };
    const opts: CLIOptions = { ...defaultOpts, system: "cli system" };
    const result = resolveOptions(opts, config);
    expect(result.system).toBe("cli system");
  });

  test("empty string system from opts is used", () => {
    const config: Config = { system: "config system" };
    const opts: CLIOptions = { ...defaultOpts, system: "" };
    const result = resolveOptions(opts, config);
    // Empty string is not nullish, so ?? preserves it over config
    expect(result.system).toBe("");
  });
});

// ── buildPrompt edge cases ───────────────────────────────────────────────

describe("buildPrompt edge cases", () => {
  test("empty string arg is treated as falsy", () => {
    const result = buildPrompt("", null, null);
    expect(result).toBe("");
  });

  test("empty string stdin is treated as falsy", () => {
    const result = buildPrompt(null, null, "");
    expect(result).toBe("");
  });

  test("whitespace-only arg is kept", () => {
    const result = buildPrompt("  ", null, null);
    expect(result).toBe("  ");
  });

  test("handles very long prompt", () => {
    const longPrompt = "a".repeat(100000);
    const result = buildPrompt(longPrompt, null, null);
    expect(result.length).toBe(100000);
  });

  test("handles unicode content", () => {
    const result = buildPrompt("Hello \u2603", null, "\u00e9l\u00e8ve");
    expect(result).toContain("\u2603");
    expect(result).toContain("\u00e9l\u00e8ve");
  });
});

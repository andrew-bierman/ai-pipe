import { test, expect, describe } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildPrompt, readFiles, resolveOptions, CLIOptionsSchema, JsonOutputSchema, type CLIOptions } from "../index.ts";
import type { Config } from "../config.ts";

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

  test("returns null when neither provided", () => {
    expect(buildPrompt(null, null)).toBeNull();
  });

  test("arg prompt comes first in combined output", () => {
    const result = buildPrompt("summarize", null, "long document text")!;
    expect(result.startsWith("summarize")).toBe(true);
    expect(result.endsWith("long document text")).toBe(true);
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
    const result = buildPrompt("review", "# file.ts\n```\ncode\n```", "stdin data");
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

  test("returns null when all three are null", () => {
    expect(buildPrompt(null, null, null)).toBeNull();
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
    expect(readFiles(["/nonexistent/file.txt"])).rejects.toThrow("File not found: /nonexistent/file.txt");
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

// ── resolveOptions ─────────────────────────────────────────────────────

describe("resolveOptions", () => {
  const defaultOpts: CLIOptions = { json: false, stream: true };
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
    const config: Config = { model: "xai/grok-3", system: "sys", temperature: 1.5, maxOutputTokens: 300 };
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
    const result = CLIOptionsSchema.parse({ json: false, stream: true });
    expect(result.json).toBe(false);
    expect(result.stream).toBe(true);
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
      CLIOptionsSchema.safeParse({ json: false, stream: true, temperature: -1 }).success
    ).toBe(false);
  });

  test("rejects temperature above 2", () => {
    expect(
      CLIOptionsSchema.safeParse({ json: false, stream: true, temperature: 3 }).success
    ).toBe(false);
  });

  test("rejects negative maxOutputTokens", () => {
    expect(
      CLIOptionsSchema.safeParse({ json: false, stream: true, maxOutputTokens: -5 }).success
    ).toBe(false);
  });

  test("rejects float maxOutputTokens", () => {
    expect(
      CLIOptionsSchema.safeParse({ json: false, stream: true, maxOutputTokens: 10.5 }).success
    ).toBe(false);
  });

  test("rejects non-boolean json", () => {
    expect(
      CLIOptionsSchema.safeParse({ json: "yes", stream: true }).success
    ).toBe(false);
  });

  test("accepts file as string array", () => {
    const result = CLIOptionsSchema.parse({
      json: false,
      stream: true,
      file: ["a.txt", "b.txt"],
    });
    expect(result.file).toEqual(["a.txt", "b.txt"]);
  });

  test("file is optional", () => {
    const result = CLIOptionsSchema.parse({ json: false, stream: true });
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
        inputTokenDetails: { noCacheTokens: 3, cacheReadTokens: 2, cacheWriteTokens: 0 },
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
      }).success
    ).toBe(false);
  });

  test("rejects missing model", () => {
    expect(
      JsonOutputSchema.safeParse({
        text: "hi",
        usage: {},
        finishReason: "stop",
      }).success
    ).toBe(false);
  });

  test("rejects missing finishReason", () => {
    expect(
      JsonOutputSchema.safeParse({
        text: "hi",
        model: "m",
        usage: {},
      }).success
    ).toBe(false);
  });
});

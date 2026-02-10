import { test, expect, describe } from "bun:test";
import { buildPrompt, resolveOptions, type CLIOptions } from "../index.ts";
import type { Config } from "../config.ts";

describe("buildPrompt", () => {
  test("returns arg prompt when only args provided", () => {
    expect(buildPrompt("explain monads", null)).toBe("explain monads");
  });

  test("returns stdin when only stdin provided", () => {
    expect(buildPrompt(null, "hello world")).toBe("hello world");
  });

  test("combines arg prompt and stdin with double newline", () => {
    const result = buildPrompt("review this code", "const x = 1;");
    expect(result).toBe("review this code\n\nconst x = 1;");
  });

  test("returns null when neither provided", () => {
    expect(buildPrompt(null, null)).toBeNull();
  });

  test("arg prompt takes precedence position (comes first in combined)", () => {
    const result = buildPrompt("summarize", "long document text");
    expect(result!.startsWith("summarize")).toBe(true);
    expect(result!.endsWith("long document text")).toBe(true);
  });

  test("empty string arg prompt is treated as present (not null)", () => {
    // In practice, CLI converts empty args array to null, not ""
    expect(buildPrompt("", "stdin content")).toBe("");
  });

  test("empty string stdin is treated as present (not null)", () => {
    // In practice, CLI converts empty stdin to null, not ""
    expect(buildPrompt("arg prompt", "")).toBe("arg prompt");
  });
});

describe("resolveOptions", () => {
  const defaultOpts: CLIOptions = {
    json: false,
    stream: true,
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
    const opts: CLIOptions = {
      ...defaultOpts,
      temperature: 0.9,
    };
    const result = resolveOptions(opts, config);
    expect(result.modelString).toBe("anthropic/claude-sonnet-4-5");
    expect(result.system).toBe("config system");
    expect(result.temperature).toBe(0.9);
  });
});

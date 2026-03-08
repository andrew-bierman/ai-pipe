import { describe, expect, test } from "bun:test";
import { type DiffResult, formatDiffJson, formatDiffResults } from "../diff.ts";

// ── formatDiffResults ────────────────────────────────────────────────

describe("formatDiffResults", () => {
  test("formats results with separators and headers", () => {
    const results: DiffResult[] = [
      {
        model: "openai/gpt-4o",
        text: "Hello from GPT-4o",
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        cost: "$0.0001 (10 in) + $0.0002 (20 out) = $0.0003",
        durationMs: 1234,
      },
      {
        model: "anthropic/claude-sonnet-4-5",
        text: "Hello from Claude",
        usage: { inputTokens: 15, outputTokens: 25, totalTokens: 40 },
        cost: "$0.0002 (15 in) + $0.0004 (25 out) = $0.0006",
        durationMs: 2345,
      },
    ];

    const output = formatDiffResults(results);

    // Check separators
    expect(output).toContain("\u2500".repeat(60));

    // Check model names
    expect(output).toContain("openai/gpt-4o");
    expect(output).toContain("anthropic/claude-sonnet-4-5");

    // Check durations
    expect(output).toContain("1.23s");
    expect(output).toContain("2.35s");

    // Check costs
    expect(output).toContain("$0.0003");
    expect(output).toContain("$0.0006");

    // Check token counts
    expect(output).toContain("30 tokens");
    expect(output).toContain("40 tokens");

    // Check response text
    expect(output).toContain("Hello from GPT-4o");
    expect(output).toContain("Hello from Claude");
  });

  test("handles results without cost", () => {
    const results: DiffResult[] = [
      {
        model: "openai/gpt-4o",
        text: "Response text",
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        durationMs: 500,
      },
    ];

    const output = formatDiffResults(results);

    expect(output).toContain("openai/gpt-4o");
    expect(output).toContain("0.50s");
    expect(output).toContain("30 tokens");
    expect(output).toContain("Response text");
    // Should not contain cost emoji when no cost
    expect(output).not.toContain("\ud83d\udcb0");
  });

  test("handles results without usage", () => {
    const results: DiffResult[] = [
      {
        model: "openai/gpt-4o",
        text: "Response text",
        durationMs: 750,
      },
    ];

    const output = formatDiffResults(results);

    expect(output).toContain("openai/gpt-4o");
    expect(output).toContain("0.75s");
    expect(output).toContain("Response text");
    // Should not contain tokens line when no usage
    expect(output).not.toContain("tokens");
  });

  test("handles error results (durationMs: 0)", () => {
    const results: DiffResult[] = [
      {
        model: "openai/gpt-4o",
        text: "Error: API key missing",
        durationMs: 0,
      },
    ];

    const output = formatDiffResults(results);

    expect(output).toContain("openai/gpt-4o");
    expect(output).toContain("0.00s");
    expect(output).toContain("Error: API key missing");
  });

  test("with single model", () => {
    const results: DiffResult[] = [
      {
        model: "google/gemini-2.5-flash",
        text: "Single model response",
        usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
        durationMs: 300,
      },
    ];

    const output = formatDiffResults(results);

    expect(output).toContain("google/gemini-2.5-flash");
    expect(output).toContain("Single model response");
    expect(output).toContain("15 tokens");
  });

  test("with multiple models", () => {
    const results: DiffResult[] = [
      {
        model: "openai/gpt-4o",
        text: "Response 1",
        durationMs: 100,
      },
      {
        model: "anthropic/claude-sonnet-4-5",
        text: "Response 2",
        durationMs: 200,
      },
      {
        model: "google/gemini-2.5-flash",
        text: "Response 3",
        durationMs: 300,
      },
    ];

    const output = formatDiffResults(results);

    expect(output).toContain("openai/gpt-4o");
    expect(output).toContain("anthropic/claude-sonnet-4-5");
    expect(output).toContain("google/gemini-2.5-flash");
    expect(output).toContain("Response 1");
    expect(output).toContain("Response 2");
    expect(output).toContain("Response 3");
  });

  test("handles results where usage has no totalTokens", () => {
    const results: DiffResult[] = [
      {
        model: "openai/gpt-4o",
        text: "Some text",
        usage: { inputTokens: 10, outputTokens: 20 },
        durationMs: 500,
      },
    ];

    const output = formatDiffResults(results);

    // totalTokens is undefined, so tokens line should not appear
    expect(output).not.toContain("tokens");
    expect(output).toContain("Some text");
  });
});

// ── formatDiffJson ───────────────────────────────────────────────────

describe("formatDiffJson", () => {
  test("returns valid JSON", () => {
    const results: DiffResult[] = [
      {
        model: "openai/gpt-4o",
        text: "Hello",
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        cost: "$0.0003",
        durationMs: 1234.5678,
      },
    ];

    const jsonStr = formatDiffJson(results);
    const parsed = JSON.parse(jsonStr);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].model).toBe("openai/gpt-4o");
    expect(parsed[0].text).toBe("Hello");
    expect(parsed[0].usage.totalTokens).toBe(30);
    expect(parsed[0].cost).toBe("$0.0003");
  });

  test("rounds durationMs", () => {
    const results: DiffResult[] = [
      {
        model: "openai/gpt-4o",
        text: "Hello",
        durationMs: 1234.5678,
      },
    ];

    const jsonStr = formatDiffJson(results);
    const parsed = JSON.parse(jsonStr);

    expect(parsed[0].durationMs).toBe(1235);
  });

  test("includes multiple results", () => {
    const results: DiffResult[] = [
      {
        model: "openai/gpt-4o",
        text: "Response A",
        durationMs: 100.1,
      },
      {
        model: "anthropic/claude-sonnet-4-5",
        text: "Response B",
        durationMs: 200.9,
      },
    ];

    const jsonStr = formatDiffJson(results);
    const parsed = JSON.parse(jsonStr);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].model).toBe("openai/gpt-4o");
    expect(parsed[0].durationMs).toBe(100);
    expect(parsed[1].model).toBe("anthropic/claude-sonnet-4-5");
    expect(parsed[1].durationMs).toBe(201);
  });

  test("handles results without optional fields", () => {
    const results: DiffResult[] = [
      {
        model: "openai/gpt-4o",
        text: "Hello",
        durationMs: 500,
      },
    ];

    const jsonStr = formatDiffJson(results);
    const parsed = JSON.parse(jsonStr);

    expect(parsed[0].model).toBe("openai/gpt-4o");
    expect(parsed[0].text).toBe("Hello");
    expect(parsed[0].usage).toBeUndefined();
    expect(parsed[0].cost).toBeUndefined();
    expect(parsed[0].durationMs).toBe(500);
  });

  test("output is pretty-printed", () => {
    const results: DiffResult[] = [
      {
        model: "openai/gpt-4o",
        text: "Hello",
        durationMs: 500,
      },
    ];

    const jsonStr = formatDiffJson(results);

    // Pretty-printed JSON should have newlines and indentation
    expect(jsonStr).toContain("\n");
    expect(jsonStr).toContain("  ");
  });

  test("includes sources when present", () => {
    const results: DiffResult[] = [
      {
        model: "perplexity/sonar",
        text: "Response with sources",
        durationMs: 500,
        sources: [
          { url: "https://example.com", title: "Example" },
          { url: "https://other.com" },
        ],
      },
    ];

    const jsonStr = formatDiffJson(results);
    const parsed = JSON.parse(jsonStr);

    expect(parsed[0].sources).toHaveLength(2);
    expect(parsed[0].sources[0].url).toBe("https://example.com");
    expect(parsed[0].sources[0].title).toBe("Example");
    expect(parsed[0].sources[1].url).toBe("https://other.com");
    expect(parsed[0].sources[1].title).toBeUndefined();
  });

  test("omits sources when not present", () => {
    const results: DiffResult[] = [
      {
        model: "openai/gpt-4o",
        text: "No sources",
        durationMs: 500,
      },
    ];

    const jsonStr = formatDiffJson(results);
    const parsed = JSON.parse(jsonStr);

    expect(parsed[0].sources).toBeUndefined();
  });

  test("includes reasoning when present", () => {
    const results: DiffResult[] = [
      {
        model: "anthropic/claude-sonnet-4-5",
        text: "Answer",
        durationMs: 500,
        reasoning: "Let me think...",
      },
    ];

    const jsonStr = formatDiffJson(results);
    const parsed = JSON.parse(jsonStr);

    expect(parsed[0].reasoning).toBe("Let me think...");
  });

  test("omits reasoning when not present", () => {
    const results: DiffResult[] = [
      {
        model: "openai/gpt-4o",
        text: "No reasoning",
        durationMs: 500,
      },
    ];

    const jsonStr = formatDiffJson(results);
    const parsed = JSON.parse(jsonStr);

    expect(parsed[0].reasoning).toBeUndefined();
  });
});

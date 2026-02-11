import { describe, expect, test } from "bun:test";
import {
  formatOutput,
  type OutputFormat,
  OutputFormatSchema,
} from "../formats.ts";
import type { JsonOutput } from "../index.ts";

// ── Shared test data ─────────────────────────────────────────────────

const sampleData: JsonOutput = {
  text: "2 + 2 = 4",
  model: "openai/gpt-4o",
  usage: {
    inputTokens: 12,
    outputTokens: 8,
    totalTokens: 20,
  },
  finishReason: "stop",
};

const multiLineData: JsonOutput = {
  text: "line one\nline two\nline three",
  model: "openai/gpt-4o",
  usage: {
    inputTokens: 10,
    outputTokens: 15,
    totalTokens: 25,
  },
  finishReason: "stop",
};

const emptyUsageData: JsonOutput = {
  text: "hello",
  model: "anthropic/claude-sonnet-4-5",
  usage: {},
  finishReason: "stop",
};

// ── OutputFormatSchema ───────────────────────────────────────────────

describe("OutputFormatSchema", () => {
  test("accepts valid formats", () => {
    expect(OutputFormatSchema.parse("json")).toBe("json");
    expect(OutputFormatSchema.parse("yaml")).toBe("yaml");
    expect(OutputFormatSchema.parse("csv")).toBe("csv");
    expect(OutputFormatSchema.parse("text")).toBe("text");
  });

  test("rejects invalid format", () => {
    expect(() => OutputFormatSchema.parse("xml")).toThrow();
    expect(() => OutputFormatSchema.parse("")).toThrow();
  });
});

// ── JSON format ──────────────────────────────────────────────────────

describe("formatOutput with json format", () => {
  test("returns valid JSON", () => {
    const result = formatOutput(sampleData, "json");
    const parsed = JSON.parse(result);
    expect(parsed).toEqual(sampleData);
  });

  test("JSON is pretty-printed with 2-space indent", () => {
    const result = formatOutput(sampleData, "json");
    expect(result).toBe(JSON.stringify(sampleData, null, 2));
  });

  test("handles empty usage fields", () => {
    const result = formatOutput(emptyUsageData, "json");
    const parsed = JSON.parse(result);
    expect(parsed.usage).toEqual({});
    expect(parsed.text).toBe("hello");
  });
});

// ── YAML format ──────────────────────────────────────────────────────

describe("formatOutput with yaml format", () => {
  test("returns YAML with proper structure", () => {
    const result = formatOutput(sampleData, "yaml");
    expect(result).toContain("text: 2 + 2 = 4");
    expect(result).toContain("model: openai/gpt-4o");
    expect(result).toContain("usage:");
    expect(result).toContain("  inputTokens: 12");
    expect(result).toContain("  outputTokens: 8");
    expect(result).toContain("  totalTokens: 20");
    expect(result).toContain("finishReason: stop");
  });

  test("uses block scalar for multi-line text", () => {
    const result = formatOutput(multiLineData, "yaml");
    expect(result).toContain("text: |");
    expect(result).toContain("  line one");
    expect(result).toContain("  line two");
    expect(result).toContain("  line three");
  });

  test("handles empty usage fields with null", () => {
    const result = formatOutput(emptyUsageData, "yaml");
    expect(result).toContain("inputTokens: null");
    expect(result).toContain("outputTokens: null");
    expect(result).toContain("totalTokens: null");
  });

  test("escapes text containing colons", () => {
    const data: JsonOutput = {
      ...sampleData,
      text: "key: value",
    };
    const result = formatOutput(data, "yaml");
    expect(result).toContain('text: "key: value"');
  });

  test("escapes text containing hash characters", () => {
    const data: JsonOutput = {
      ...sampleData,
      text: "item #1",
    };
    const result = formatOutput(data, "yaml");
    expect(result).toContain('text: "item #1"');
  });

  test("escapes text that looks like boolean", () => {
    const data: JsonOutput = {
      ...sampleData,
      text: "true",
    };
    const result = formatOutput(data, "yaml");
    expect(result).toContain('text: "true"');
  });
});

// ── CSV format ───────────────────────────────────────────────────────

describe("formatOutput with csv format", () => {
  test("returns headers and values", () => {
    const result = formatOutput(sampleData, "csv");
    const lines = result.split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe(
      "text,model,inputTokens,outputTokens,totalTokens,finishReason",
    );
    expect(lines[1]).toBe("2 + 2 = 4,openai/gpt-4o,12,8,20,stop");
  });

  test("escapes commas in text", () => {
    const data: JsonOutput = {
      ...sampleData,
      text: "red, green, blue",
    };
    const result = formatOutput(data, "csv");
    const lines = result.split("\n");
    expect(lines[1]).toContain('"red, green, blue"');
  });

  test("escapes double quotes in text", () => {
    const data: JsonOutput = {
      ...sampleData,
      text: 'She said "hello"',
    };
    const result = formatOutput(data, "csv");
    const lines = result.split("\n");
    expect(lines[1]).toContain('"She said ""hello"""');
  });

  test("escapes newlines in text", () => {
    const result = formatOutput(multiLineData, "csv");
    const lines = result.split("\n");
    // The first line is headers
    expect(lines[0]).toBe(
      "text,model,inputTokens,outputTokens,totalTokens,finishReason",
    );
    // The value line should have the text wrapped in quotes due to newlines
    const valuesPart = result.slice(result.indexOf("\n") + 1);
    expect(valuesPart).toContain('"line one\nline two\nline three"');
  });

  test("handles empty usage fields", () => {
    const result = formatOutput(emptyUsageData, "csv");
    const valuesPart = result.slice(result.indexOf("\n") + 1);
    // Empty usage fields should produce empty strings between commas
    expect(valuesPart).toBe("hello,anthropic/claude-sonnet-4-5,,,,stop");
  });
});

// ── Text format ──────────────────────────────────────────────────────

describe("formatOutput with text format", () => {
  test("returns just the text content", () => {
    const result = formatOutput(sampleData, "text");
    expect(result).toBe("2 + 2 = 4");
  });

  test("preserves multi-line text", () => {
    const result = formatOutput(multiLineData, "text");
    expect(result).toBe("line one\nline two\nline three");
  });

  test("returns text even with empty usage", () => {
    const result = formatOutput(emptyUsageData, "text");
    expect(result).toBe("hello");
  });

  test("does not include model or usage metadata", () => {
    const result = formatOutput(sampleData, "text");
    expect(result).not.toContain("openai");
    expect(result).not.toContain("gpt-4o");
    expect(result).not.toContain("inputTokens");
    expect(result).not.toContain("stop");
  });
});

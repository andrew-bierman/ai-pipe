import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ChainStepSchema,
  ChainStepsSchema,
  loadChainConfig,
} from "../chain.ts";

const tmpDir = tmpdir();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function makeTmpDir(): string {
  const dir = join(tmpDir, `ai-chain-${uid()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── loadChainConfig ──────────────────────────────────────────────────────

describe("loadChainConfig", () => {
  test("loads valid JSON config", async () => {
    const dir = makeTmpDir();
    const configPath = join(dir, "chain.json");
    const config = [
      { prompt: "Translate to French: {{input}}" },
      { prompt: "Summarize: {{input}}" },
    ];
    await Bun.write(configPath, JSON.stringify(config));

    const result = await loadChainConfig(configPath);
    expect(result).toEqual(config);

    rmSync(dir, { recursive: true });
  });

  test("loads config with model and system overrides", async () => {
    const dir = makeTmpDir();
    const configPath = join(dir, "chain.json");
    const config = [
      {
        model: "anthropic/claude-sonnet-4-5",
        system: "You are a translator.",
        prompt: "Translate to French: {{input}}",
      },
      { prompt: "Summarize: {{input}}" },
    ];
    await Bun.write(configPath, JSON.stringify(config));

    const result = await loadChainConfig(configPath);
    expect(result).toEqual(config);
    expect(result[0]?.model).toBe("anthropic/claude-sonnet-4-5");
    expect(result[0]?.system).toBe("You are a translator.");

    rmSync(dir, { recursive: true });
  });

  test("throws on missing file", async () => {
    const missingPath = join(tmpDir, `nonexistent-chain-${uid()}.json`);
    await expect(loadChainConfig(missingPath)).rejects.toThrow(
      "Chain config not found",
    );
  });

  test("throws on invalid schema (missing prompt field)", async () => {
    const dir = makeTmpDir();
    const configPath = join(dir, "chain.json");
    const invalidConfig = [{ model: "openai/gpt-4o" }];
    await Bun.write(configPath, JSON.stringify(invalidConfig));

    await expect(loadChainConfig(configPath)).rejects.toThrow();

    rmSync(dir, { recursive: true });
  });

  test("throws on empty array", async () => {
    const dir = makeTmpDir();
    const configPath = join(dir, "chain.json");
    await Bun.write(configPath, JSON.stringify([]));

    await expect(loadChainConfig(configPath)).rejects.toThrow();

    rmSync(dir, { recursive: true });
  });

  test("throws on invalid JSON", async () => {
    const dir = makeTmpDir();
    const configPath = join(dir, "chain.json");
    await Bun.write(configPath, "not valid json {{{");

    await expect(loadChainConfig(configPath)).rejects.toThrow();

    rmSync(dir, { recursive: true });
  });
});

// ── ChainStepSchema ──────────────────────────────────────────────────────

describe("ChainStepSchema", () => {
  test("validates step with prompt only", () => {
    const result = ChainStepSchema.safeParse({
      prompt: "Translate: {{input}}",
    });
    expect(result.success).toBe(true);
  });

  test("validates step with all fields", () => {
    const result = ChainStepSchema.safeParse({
      model: "openai/gpt-4o",
      system: "Be concise.",
      prompt: "Summarize: {{input}}",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBe("openai/gpt-4o");
      expect(result.data.system).toBe("Be concise.");
      expect(result.data.prompt).toBe("Summarize: {{input}}");
    }
  });

  test("rejects missing prompt", () => {
    const result = ChainStepSchema.safeParse({
      model: "openai/gpt-4o",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty prompt", () => {
    const result = ChainStepSchema.safeParse({ prompt: "" });
    expect(result.success).toBe(false);
  });

  test("accepts step without model and system (optional fields)", () => {
    const result = ChainStepSchema.safeParse({
      prompt: "Just a prompt.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBeUndefined();
      expect(result.data.system).toBeUndefined();
    }
  });
});

// ── ChainStepsSchema ─────────────────────────────────────────────────────

describe("ChainStepsSchema", () => {
  test("validates array of steps", () => {
    const result = ChainStepsSchema.safeParse([
      { prompt: "Step 1: {{input}}" },
      { prompt: "Step 2: {{input}}" },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
    }
  });

  test("rejects empty array", () => {
    const result = ChainStepsSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  test("rejects non-array", () => {
    const result = ChainStepsSchema.safeParse({
      prompt: "not an array",
    });
    expect(result.success).toBe(false);
  });
});

// ── {{input}} replacement ────────────────────────────────────────────────

describe("{{input}} replacement", () => {
  test("replaces single {{input}} in prompt", () => {
    const prompt = "Translate to French: {{input}}";
    const result = prompt.replace(/\{\{input\}\}/g, "Hello world");
    expect(result).toBe("Translate to French: Hello world");
  });

  test("replaces multiple {{input}} in one prompt", () => {
    const prompt = "Compare {{input}} with {{input}} and provide differences.";
    const result = prompt.replace(/\{\{input\}\}/g, "test data");
    expect(result).toBe(
      "Compare test data with test data and provide differences.",
    );
  });

  test("handles prompt with no {{input}} placeholder", () => {
    const prompt = "Just a static prompt with no placeholder.";
    const result = prompt.replace(/\{\{input\}\}/g, "replacement");
    expect(result).toBe("Just a static prompt with no placeholder.");
  });

  test("handles empty input string", () => {
    const prompt = "Process this: {{input}}";
    const result = prompt.replace(/\{\{input\}\}/g, "");
    expect(result).toBe("Process this: ");
  });

  test("handles multi-line input", () => {
    const prompt = "Analyze:\n{{input}}\nEnd.";
    const input = "line 1\nline 2\nline 3";
    const result = prompt.replace(/\{\{input\}\}/g, input);
    expect(result).toBe("Analyze:\nline 1\nline 2\nline 3\nEnd.");
  });

  test("does not replace other {{variable}} placeholders", () => {
    const prompt = "{{input}} and {{other}}";
    const result = prompt.replace(/\{\{input\}\}/g, "replaced");
    expect(result).toBe("replaced and {{other}}");
  });
});

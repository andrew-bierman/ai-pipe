import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigSchema, loadConfig } from "../config.ts";

const tmpDir = tmpdir();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function makeTmpDir(): string {
  const dir = join(tmpDir, `ai-cfg-${uid()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("ConfigSchema", () => {
  test("accepts empty object", () => {
    expect(ConfigSchema.parse({})).toEqual({});
  });

  test("accepts full valid config", () => {
    const result = ConfigSchema.parse({
      model: "anthropic/claude-sonnet-4-5",
      system: "Be concise.",
      temperature: 0.7,
      maxOutputTokens: 500,
    });
    expect(result.model).toBe("anthropic/claude-sonnet-4-5");
    expect(result.system).toBe("Be concise.");
    expect(result.temperature).toBe(0.7);
    expect(result.maxOutputTokens).toBe(500);
  });

  test("accepts temperature at lower bound (0)", () => {
    expect(ConfigSchema.parse({ temperature: 0 }).temperature).toBe(0);
  });

  test("accepts temperature at upper bound (2)", () => {
    expect(ConfigSchema.parse({ temperature: 2 }).temperature).toBe(2);
  });

  test("accepts temperature at midpoint (1)", () => {
    expect(ConfigSchema.parse({ temperature: 1 }).temperature).toBe(1);
  });

  test("rejects temperature below 0", () => {
    expect(() => ConfigSchema.parse({ temperature: -0.1 })).toThrow();
  });

  test("rejects temperature above 2", () => {
    expect(() => ConfigSchema.parse({ temperature: 2.1 })).toThrow();
  });

  test("rejects non-number temperature", () => {
    expect(() => ConfigSchema.parse({ temperature: "hot" })).toThrow();
  });

  test("accepts maxOutputTokens = 1", () => {
    expect(ConfigSchema.parse({ maxOutputTokens: 1 }).maxOutputTokens).toBe(1);
  });

  test("rejects maxOutputTokens = 0", () => {
    expect(() => ConfigSchema.parse({ maxOutputTokens: 0 })).toThrow();
  });

  test("rejects negative maxOutputTokens", () => {
    expect(() => ConfigSchema.parse({ maxOutputTokens: -100 })).toThrow();
  });

  test("rejects float maxOutputTokens", () => {
    expect(() => ConfigSchema.parse({ maxOutputTokens: 99.5 })).toThrow();
  });

  test("rejects non-number maxOutputTokens", () => {
    expect(() => ConfigSchema.parse({ maxOutputTokens: "many" })).toThrow();
  });

  test("rejects non-string model", () => {
    expect(() => ConfigSchema.parse({ model: 123 })).toThrow();
  });

  test("rejects non-string system", () => {
    expect(() => ConfigSchema.parse({ system: true })).toThrow();
  });

  test("strips unknown properties", () => {
    const result = ConfigSchema.parse({
      model: "openai/gpt-4o",
      unknown: true,
    });
    expect((result as Record<string, unknown>).unknown).toBeUndefined();
  });

  test("does not accept apiKeys (moved to separate file)", () => {
    const result = ConfigSchema.parse({
      model: "openai/gpt-4o",
      apiKeys: { openai: "sk-test" },
    });
    expect((result as Record<string, unknown>).apiKeys).toBeUndefined();
  });
});

describe("loadConfig", () => {
  test("returns empty object when directory does not exist", async () => {
    const config = await loadConfig("/nonexistent/path/config-dir");
    expect(config).toEqual({});
  });

  test("returns empty object for empty directory", async () => {
    const dir = makeTmpDir();
    const config = await loadConfig(dir);
    expect(config).toEqual({});
  });

  test("loads config.json only", async () => {
    const dir = makeTmpDir();
    await Bun.write(
      join(dir, "config.json"),
      JSON.stringify({
        model: "anthropic/claude-sonnet-4-5",
        system: "Be concise.",
        temperature: 0.7,
        maxOutputTokens: 500,
      }),
    );

    const config = await loadConfig(dir);
    expect(config.model).toBe("anthropic/claude-sonnet-4-5");
    expect(config.system).toBe("Be concise.");
    expect(config.temperature).toBe(0.7);
    expect(config.maxOutputTokens).toBe(500);
    expect(config.apiKeys).toBeUndefined();
  });

  test("loads apiKeys.json only", async () => {
    const dir = makeTmpDir();
    await Bun.write(
      join(dir, "apiKeys.json"),
      JSON.stringify({ anthropic: "sk-ant-test", openai: "sk-test" }),
    );

    const config = await loadConfig(dir);
    expect(config.model).toBeUndefined();
    expect(config.apiKeys).toEqual({
      anthropic: "sk-ant-test",
      openai: "sk-test",
    });
  });

  test("loads both config.json and apiKeys.json", async () => {
    const dir = makeTmpDir();
    await Promise.all([
      Bun.write(
        join(dir, "config.json"),
        JSON.stringify({ model: "anthropic/claude-sonnet-4-5" }),
      ),
      Bun.write(
        join(dir, "apiKeys.json"),
        JSON.stringify({ anthropic: "sk-ant-test" }),
      ),
    ]);

    const config = await loadConfig(dir);
    expect(config.model).toBe("anthropic/claude-sonnet-4-5");
    expect(config.apiKeys).toEqual({ anthropic: "sk-ant-test" });
  });

  test("loads partial config.json (only model)", async () => {
    const dir = makeTmpDir();
    await Bun.write(
      join(dir, "config.json"),
      JSON.stringify({ model: "google/gemini-2.5-flash" }),
    );

    const config = await loadConfig(dir);
    expect(config.model).toBe("google/gemini-2.5-flash");
    expect(config.system).toBeUndefined();
    expect(config.temperature).toBeUndefined();
    expect(config.maxOutputTokens).toBeUndefined();
  });

  test("loads empty JSON object config.json", async () => {
    const dir = makeTmpDir();
    await Bun.write(join(dir, "config.json"), "{}");

    const config = await loadConfig(dir);
    expect(config).toEqual({});
  });

  test("ignores invalid JSON in config.json", async () => {
    const dir = makeTmpDir();
    await Bun.write(join(dir, "config.json"), "not valid json {{{");

    const config = await loadConfig(dir);
    expect(config).toEqual({});
  });

  test("ignores invalid JSON in apiKeys.json", async () => {
    const dir = makeTmpDir();
    await Bun.write(join(dir, "apiKeys.json"), "not valid json");

    const config = await loadConfig(dir);
    expect(config).toEqual({});
  });

  test("ignores zod-invalid config.json (temperature out of range)", async () => {
    const dir = makeTmpDir();
    await Bun.write(
      join(dir, "config.json"),
      JSON.stringify({ temperature: 5 }),
    );

    const config = await loadConfig(dir);
    expect(config).toEqual({});
  });

  test("ignores zod-invalid config.json (bad type)", async () => {
    const dir = makeTmpDir();
    await Bun.write(join(dir, "config.json"), JSON.stringify({ model: 42 }));

    const config = await loadConfig(dir);
    expect(config).toEqual({});
  });

  test("ignores array JSON in config.json", async () => {
    const dir = makeTmpDir();
    await Bun.write(join(dir, "config.json"), "[1, 2, 3]");

    const config = await loadConfig(dir);
    expect(config).toEqual({});
  });

  test("ignores apiKeys.json with unknown provider", async () => {
    const dir = makeTmpDir();
    await Bun.write(
      join(dir, "apiKeys.json"),
      JSON.stringify({ fakeprovider: "sk-test" }),
    );

    const config = await loadConfig(dir);
    expect(config).toEqual({});
  });

  test("valid apiKeys.json with all providers", async () => {
    const dir = makeTmpDir();
    const keys = {
      openai: "sk-1",
      anthropic: "sk-2",
      google: "sk-3",
      perplexity: "sk-4",
      xai: "sk-5",
      mistral: "sk-6",
      groq: "sk-7",
      deepseek: "sk-8",
      cohere: "sk-9",
      openrouter: "sk-10",
    };
    await Bun.write(join(dir, "apiKeys.json"), JSON.stringify(keys));

    const config = await loadConfig(dir);
    expect(config.apiKeys).toEqual(keys);
  });

  test("invalid config.json does not affect valid apiKeys.json", async () => {
    const dir = makeTmpDir();
    await Promise.all([
      Bun.write(join(dir, "config.json"), "bad json"),
      Bun.write(
        join(dir, "apiKeys.json"),
        JSON.stringify({ openai: "sk-test" }),
      ),
    ]);

    const config = await loadConfig(dir);
    expect(config.model).toBeUndefined();
    expect(config.apiKeys).toEqual({ openai: "sk-test" });
  });

  test("invalid apiKeys.json does not affect valid config.json", async () => {
    const dir = makeTmpDir();
    await Promise.all([
      Bun.write(
        join(dir, "config.json"),
        JSON.stringify({ model: "openai/gpt-4o" }),
      ),
      Bun.write(join(dir, "apiKeys.json"), "bad json"),
    ]);

    const config = await loadConfig(dir);
    expect(config.model).toBe("openai/gpt-4o");
    expect(config.apiKeys).toBeUndefined();
  });

  test("uses default directory when none specified", async () => {
    const config = await loadConfig(undefined);
    expect(config).toBeDefined();
  });
});

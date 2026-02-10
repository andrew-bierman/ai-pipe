import { test, expect, describe } from "bun:test";
import { loadConfig, ConfigSchema } from "../config.ts";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tmpDir = tmpdir();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
    const result = ConfigSchema.parse({ model: "openai/gpt-4o", unknown: true });
    expect((result as Record<string, unknown>).unknown).toBeUndefined();
  });

  test("accepts apiKeys with valid provider names", () => {
    const result = ConfigSchema.parse({
      apiKeys: { anthropic: "sk-ant-test", openai: "sk-test" },
    });
    expect(result.apiKeys).toEqual({ anthropic: "sk-ant-test", openai: "sk-test" });
  });

  test("accepts empty apiKeys object", () => {
    const result = ConfigSchema.parse({ apiKeys: {} });
    expect(result.apiKeys).toEqual({});
  });

  test("accepts apiKeys with all providers", () => {
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
    const result = ConfigSchema.parse({ apiKeys: keys });
    expect(result.apiKeys).toEqual(keys);
  });

  test("rejects apiKeys with unknown provider", () => {
    expect(() =>
      ConfigSchema.parse({ apiKeys: { fakeprovider: "sk-test" } })
    ).toThrow();
  });

  test("rejects apiKeys with non-string value", () => {
    expect(() =>
      ConfigSchema.parse({ apiKeys: { openai: 123 } })
    ).toThrow();
  });

  test("config without apiKeys has undefined apiKeys", () => {
    const result = ConfigSchema.parse({ model: "openai/gpt-4o" });
    expect(result.apiKeys).toBeUndefined();
  });
});

describe("loadConfig", () => {
  test("returns empty object when file does not exist", async () => {
    const config = await loadConfig("/nonexistent/path/config.json");
    expect(config).toEqual({});
  });

  test("loads valid full config file", async () => {
    const path = join(tmpDir, `ai-cfg-${uid()}.json`);
    await Bun.write(
      path,
      JSON.stringify({
        model: "anthropic/claude-sonnet-4-5",
        system: "Be concise.",
        temperature: 0.7,
        maxOutputTokens: 500,
      })
    );

    const config = await loadConfig(path);
    expect(config.model).toBe("anthropic/claude-sonnet-4-5");
    expect(config.system).toBe("Be concise.");
    expect(config.temperature).toBe(0.7);
    expect(config.maxOutputTokens).toBe(500);
  });

  test("loads partial config (only model)", async () => {
    const path = join(tmpDir, `ai-cfg-${uid()}.json`);
    await Bun.write(path, JSON.stringify({ model: "google/gemini-2.5-flash" }));

    const config = await loadConfig(path);
    expect(config.model).toBe("google/gemini-2.5-flash");
    expect(config.system).toBeUndefined();
    expect(config.temperature).toBeUndefined();
    expect(config.maxOutputTokens).toBeUndefined();
  });

  test("loads empty JSON object config", async () => {
    const path = join(tmpDir, `ai-cfg-${uid()}.json`);
    await Bun.write(path, "{}");

    const config = await loadConfig(path);
    expect(config).toEqual({});
  });

  test("returns empty object for invalid JSON syntax", async () => {
    const path = join(tmpDir, `ai-cfg-${uid()}.json`);
    await Bun.write(path, "not valid json {{{");

    const config = await loadConfig(path);
    expect(config).toEqual({});
  });

  test("returns empty object for zod-invalid config (temperature out of range)", async () => {
    const path = join(tmpDir, `ai-cfg-${uid()}.json`);
    await Bun.write(path, JSON.stringify({ temperature: 5 }));

    const config = await loadConfig(path);
    expect(config).toEqual({});
  });

  test("returns empty object for zod-invalid config (bad type)", async () => {
    const path = join(tmpDir, `ai-cfg-${uid()}.json`);
    await Bun.write(path, JSON.stringify({ model: 42 }));

    const config = await loadConfig(path);
    expect(config).toEqual({});
  });

  test("returns empty object for array JSON", async () => {
    const path = join(tmpDir, `ai-cfg-${uid()}.json`);
    await Bun.write(path, "[1, 2, 3]");

    const config = await loadConfig(path);
    expect(config).toEqual({});
  });

  test("loads config with apiKeys", async () => {
    const path = join(tmpDir, `ai-cfg-${uid()}.json`);
    await Bun.write(
      path,
      JSON.stringify({
        model: "anthropic/claude-sonnet-4-5",
        apiKeys: { anthropic: "sk-ant-test", openai: "sk-test" },
      })
    );

    const config = await loadConfig(path);
    expect(config.model).toBe("anthropic/claude-sonnet-4-5");
    expect(config.apiKeys).toEqual({ anthropic: "sk-ant-test", openai: "sk-test" });
  });

  test("returns empty object for config with invalid apiKeys provider", async () => {
    const path = join(tmpDir, `ai-cfg-${uid()}.json`);
    await Bun.write(
      path,
      JSON.stringify({ apiKeys: { fakeprovider: "sk-test" } })
    );

    const config = await loadConfig(path);
    expect(config).toEqual({});
  });

  test("uses default path when none specified", async () => {
    const config = await loadConfig(undefined);
    expect(config).toBeDefined();
  });
});

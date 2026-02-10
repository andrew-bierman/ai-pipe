import { test, expect, describe, afterEach } from "bun:test";
import { loadConfig } from "../config.ts";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tmpDir = tmpdir();

describe("loadConfig", () => {
  test("returns empty object when file does not exist", async () => {
    const config = await loadConfig("/nonexistent/path/config.json");
    expect(config).toEqual({});
  });

  test("loads valid config file", async () => {
    const path = join(tmpDir, `ai-cli-test-config-${Date.now()}.json`);
    await Bun.write(
      path,
      JSON.stringify({
        model: "anthropic/claude-sonnet-4-5",
        system: "Be concise.",
        temperature: 0.7,
      })
    );

    const config = await loadConfig(path);
    expect(config.model).toBe("anthropic/claude-sonnet-4-5");
    expect(config.system).toBe("Be concise.");
    expect(config.temperature).toBe(0.7);
  });

  test("loads config with maxOutputTokens", async () => {
    const path = join(tmpDir, `ai-cli-test-config-tokens-${Date.now()}.json`);
    await Bun.write(
      path,
      JSON.stringify({ maxOutputTokens: 500 })
    );

    const config = await loadConfig(path);
    expect(config.maxOutputTokens).toBe(500);
  });

  test("loads partial config (only model)", async () => {
    const path = join(tmpDir, `ai-cli-test-config-partial-${Date.now()}.json`);
    await Bun.write(path, JSON.stringify({ model: "google/gemini-2.5-flash" }));

    const config = await loadConfig(path);
    expect(config.model).toBe("google/gemini-2.5-flash");
    expect(config.system).toBeUndefined();
    expect(config.temperature).toBeUndefined();
  });

  test("returns empty object for invalid JSON", async () => {
    const path = join(tmpDir, `ai-cli-test-config-invalid-${Date.now()}.json`);
    await Bun.write(path, "not valid json {{{");

    const config = await loadConfig(path);
    expect(config).toEqual({});
  });

  test("uses default path when none specified", async () => {
    const config = await loadConfig(undefined);
    // Should not throw, returns empty or whatever is at ~/.ai-cli.json
    expect(config).toBeDefined();
  });
});

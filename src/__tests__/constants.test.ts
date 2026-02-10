import { describe, expect, test } from "bun:test";
import { APP, AppSchema, ShellSchema } from "../constants.ts";

describe("APP", () => {
  test("validates against AppSchema", () => {
    expect(AppSchema.parse(APP)).toEqual(APP);
  });

  test("has expected name", () => {
    expect(APP.name).toBe("ai-pipe");
  });

  test("has expected default model", () => {
    expect(APP.defaultModel).toBe("openai/gpt-4o");
  });

  test("has expected default provider", () => {
    expect(APP.defaultProvider).toBe("openai");
  });

  test("temperature has valid range", () => {
    expect(APP.temperature.min).toBeLessThan(APP.temperature.max);
    expect(APP.temperature.min).toBe(0);
    expect(APP.temperature.max).toBe(2);
  });

  test("has config directory and file names", () => {
    expect(APP.configDirName).toBe(".ai-pipe");
    expect(APP.configFile).toBe("config.json");
    expect(APP.apiKeysFile).toBe("apiKeys.json");
  });

  test("has supported shells", () => {
    expect(APP.supportedShells).toContain("bash");
    expect(APP.supportedShells).toContain("zsh");
    expect(APP.supportedShells).toContain("fish");
    expect(APP.supportedShells).toHaveLength(3);
  });
});

describe("ShellSchema", () => {
  for (const shell of APP.supportedShells) {
    test(`accepts "${shell}"`, () => {
      expect(ShellSchema.parse(shell)).toBe(shell);
    });
  }

  test("rejects unknown shell", () => {
    expect(ShellSchema.safeParse("powershell").success).toBe(false);
  });

  test("rejects empty string", () => {
    expect(ShellSchema.safeParse("").success).toBe(false);
  });
});

describe("AppSchema", () => {
  test("rejects invalid config", () => {
    const result = AppSchema.safeParse({ name: 123 });
    expect(result.success).toBe(false);
  });

  test("rejects missing fields", () => {
    const result = AppSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

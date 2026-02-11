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

describe("ShellSchema edge cases", () => {
  test("rejects null", () => {
    expect(ShellSchema.safeParse(null).success).toBe(false);
  });

  test("rejects undefined", () => {
    expect(ShellSchema.safeParse(undefined).success).toBe(false);
  });

  test("rejects number", () => {
    expect(ShellSchema.safeParse(42).success).toBe(false);
  });

  test("rejects boolean", () => {
    expect(ShellSchema.safeParse(true).success).toBe(false);
  });

  test("rejects object", () => {
    expect(ShellSchema.safeParse({}).success).toBe(false);
  });

  test("rejects array", () => {
    expect(ShellSchema.safeParse(["bash"]).success).toBe(false);
  });

  test("is case-sensitive (rejects 'Bash')", () => {
    expect(ShellSchema.safeParse("Bash").success).toBe(false);
  });

  test("is case-sensitive (rejects 'FISH')", () => {
    expect(ShellSchema.safeParse("FISH").success).toBe(false);
  });

  test("rejects shell with whitespace", () => {
    expect(ShellSchema.safeParse(" bash").success).toBe(false);
    expect(ShellSchema.safeParse("bash ").success).toBe(false);
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

  test("rejects partial config (missing temperature)", () => {
    const result = AppSchema.safeParse({
      name: "test",
      description: "desc",
      defaultModel: "openai/gpt-4o",
      defaultProvider: "openai",
      configDirName: ".test",
      configFile: "config.json",
      apiKeysFile: "apiKeys.json",
      supportedShells: ["bash"],
    });
    expect(result.success).toBe(false);
  });

  test("rejects config with invalid shell in supportedShells", () => {
    const result = AppSchema.safeParse({
      name: "test",
      description: "desc",
      defaultModel: "openai/gpt-4o",
      defaultProvider: "openai",
      temperature: { min: 0, max: 2 },
      configDirName: ".test",
      configFile: "config.json",
      apiKeysFile: "apiKeys.json",
      supportedShells: ["bash", "powershell"],
    });
    expect(result.success).toBe(false);
  });

  test("rejects config with non-number temperature values", () => {
    const result = AppSchema.safeParse({
      name: "test",
      description: "desc",
      defaultModel: "openai/gpt-4o",
      defaultProvider: "openai",
      temperature: { min: "low", max: "high" },
      configDirName: ".test",
      configFile: "config.json",
      apiKeysFile: "apiKeys.json",
      supportedShells: ["bash"],
    });
    expect(result.success).toBe(false);
  });

  test("accepts valid full config", () => {
    const result = AppSchema.safeParse({
      name: "test-cli",
      description: "A test CLI",
      defaultModel: "openai/gpt-4o",
      defaultProvider: "openai",
      temperature: { min: 0, max: 2 },
      configDirName: ".test-cli",
      configFile: "config.json",
      apiKeysFile: "apiKeys.json",
      supportedShells: ["bash", "zsh", "fish"],
    });
    expect(result.success).toBe(true);
  });

  test("accepts config with empty supportedShells", () => {
    const result = AppSchema.safeParse({
      name: "test",
      description: "desc",
      defaultModel: "openai/gpt-4o",
      defaultProvider: "openai",
      temperature: { min: 0, max: 2 },
      configDirName: ".test",
      configFile: "config.json",
      apiKeysFile: "apiKeys.json",
      supportedShells: [],
    });
    // Empty array is accepted by z.array(ShellSchema) since no minLength constraint
    expect(result.success).toBe(true);
  });
});

describe("APP immutability", () => {
  test("APP has a non-empty description", () => {
    expect(APP.description.length).toBeGreaterThan(0);
  });

  test("APP defaultModel contains a slash (provider/model format)", () => {
    expect(APP.defaultModel).toContain("/");
  });

  test("APP configDirName starts with a dot", () => {
    expect(APP.configDirName.startsWith(".")).toBe(true);
  });

  test("APP configFile ends with .json", () => {
    expect(APP.configFile.endsWith(".json")).toBe(true);
  });

  test("APP apiKeysFile ends with .json", () => {
    expect(APP.apiKeysFile.endsWith(".json")).toBe(true);
  });
});

import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigSchema,
  getProviderDefaults,
  listRoles,
  loadConfig,
  loadRole,
  ProviderConfigSchema,
  resolveAlias,
} from "../config.ts";

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

// ── Roles ───────────────────────────────────────────────────────────────

describe("loadRole", () => {
  test("loads role with .md extension", async () => {
    const rolesTmpDir = join(tmpDir, `ai-roles-${uid()}`);
    const roleName = `test-role-${uid()}`;
    const roleContent = "You are a helpful assistant.";
    mkdirSync(join(rolesTmpDir, "roles"), { recursive: true });
    await Bun.write(join(rolesTmpDir, "roles", `${roleName}.md`), roleContent);

    const result = await loadRole(roleName, rolesTmpDir);
    expect(result).toBe(roleContent);

    rmSync(rolesTmpDir, { recursive: true });
  });

  test("strips .md extension from role name", async () => {
    const rolesTmpDir = join(tmpDir, `ai-roles-ext-${uid()}`);
    const roleName = `reviewer`;
    mkdirSync(join(rolesTmpDir, "roles"), { recursive: true });
    await Bun.write(
      join(rolesTmpDir, "roles", `${roleName}.md`),
      "Review code carefully.",
    );

    // Pass roleName with .md extension - should still work
    const result = await loadRole(`${roleName}.md`, rolesTmpDir);
    expect(result).toBe("Review code carefully.");

    rmSync(rolesTmpDir, { recursive: true });
  });

  test("returns null for non-existent role", async () => {
    const rolesTmpDir = makeTmpDir();
    const result = await loadRole("non-existent-role-xyz", rolesTmpDir);
    expect(result).toBeNull();

    rmSync(rolesTmpDir, { recursive: true });
  });

  test("prevents path traversal with ../", async () => {
    const rolesTmpDir = makeTmpDir();
    const result = await loadRole("../etc/passwd", rolesTmpDir);
    expect(result).toBeNull();

    rmSync(rolesTmpDir, { recursive: true });
  });

  test("prevents path traversal with absolute path", async () => {
    const rolesTmpDir = makeTmpDir();
    const result = await loadRole("/etc/passwd", rolesTmpDir);
    expect(result).toBeNull();

    rmSync(rolesTmpDir, { recursive: true });
  });

  test("returns null for empty role name", async () => {
    const rolesTmpDir = makeTmpDir();
    mkdirSync(join(rolesTmpDir, "roles"), { recursive: true });
    const result = await loadRole("", rolesTmpDir);
    expect(result).toBeNull();

    rmSync(rolesTmpDir, { recursive: true });
  });

  test("prevents path traversal with deeply nested ../", async () => {
    const rolesTmpDir = makeTmpDir();
    const result = await loadRole(
      "../../../../../../../etc/passwd",
      rolesTmpDir,
    );
    expect(result).toBeNull();
    rmSync(rolesTmpDir, { recursive: true });
  });

  test("handles role name with special characters", async () => {
    const rolesTmpDir = makeTmpDir();
    mkdirSync(join(rolesTmpDir, "roles"), { recursive: true });
    // A role name with dots and special chars (sanitized by basename)
    const result = await loadRole("some.role.name", rolesTmpDir);
    expect(result).toBeNull();
    rmSync(rolesTmpDir, { recursive: true });
  });

  test("handles role file with unicode content", async () => {
    const rolesTmpDir = join(tmpDir, `ai-roles-unicode-${uid()}`);
    mkdirSync(join(rolesTmpDir, "roles"), { recursive: true });
    const roleName = `unicode-${uid()}`;
    const roleContent = "You are a helpful assistant. \u2603 \u00e9l\u00e8ve.";
    await Bun.write(join(rolesTmpDir, "roles", `${roleName}.md`), roleContent);
    const result = await loadRole(roleName, rolesTmpDir);
    expect(result).toBe(roleContent);
    rmSync(rolesTmpDir, { recursive: true });
  });

  test("handles role with .MD extension (case insensitive strip)", async () => {
    const rolesTmpDir = join(tmpDir, `ai-roles-case-${uid()}`);
    mkdirSync(join(rolesTmpDir, "roles"), { recursive: true });
    const roleName = "CaseTest";
    await Bun.write(
      join(rolesTmpDir, "roles", `${roleName}.md`),
      "Case test content",
    );
    // Pass with uppercase .MD extension
    const result = await loadRole(`${roleName}.MD`, rolesTmpDir);
    expect(result).toBe("Case test content");
    rmSync(rolesTmpDir, { recursive: true });
  });
});

describe("listRoles", () => {
  test("returns empty array when roles directory does not exist", async () => {
    const rolesTmpDir = join(tmpDir, `ai-empty-roles-${uid()}`);
    mkdirSync(rolesTmpDir, { recursive: true });

    const result = await listRoles(rolesTmpDir);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);

    rmSync(rolesTmpDir, { recursive: true });
  });

  test("lists only .md files and ignores other extensions", async () => {
    const rolesTmpDir = join(tmpDir, `ai-list-roles-${uid()}`);
    const roleName1 = `role1-${uid()}`;
    const roleName2 = `role2-${uid()}`;
    const roleNameTxt = `ignored-${uid()}`;
    mkdirSync(join(rolesTmpDir, "roles"), { recursive: true });

    await Bun.write(
      join(rolesTmpDir, "roles", `${roleName1}.md`),
      "Role 1 content",
    );
    await Bun.write(
      join(rolesTmpDir, "roles", `${roleName2}.md`),
      "Role 2 content",
    );
    // Add a .txt file that should be ignored
    await Bun.write(
      join(rolesTmpDir, "roles", `${roleNameTxt}.txt`),
      "This should be ignored",
    );

    const result = await listRoles(rolesTmpDir);
    expect(result).toContain(roleName1);
    expect(result).toContain(roleName2);
    expect(result).not.toContain(roleNameTxt);

    rmSync(rolesTmpDir, { recursive: true });
  });

  test("returns sorted roles", async () => {
    const rolesTmpDir = join(tmpDir, `ai-sorted-roles-${uid()}`);
    const roleNameA = `aaa-role-${uid()}`;
    const roleNameZ = `zzz-role-${uid()}`;
    mkdirSync(join(rolesTmpDir, "roles"), { recursive: true });

    await Bun.write(join(rolesTmpDir, "roles", `${roleNameZ}.md`), "Z role");
    await Bun.write(join(rolesTmpDir, "roles", `${roleNameA}.md`), "A role");

    const result = await listRoles(rolesTmpDir);
    const aIndex = result.indexOf(roleNameA);
    const zIndex = result.indexOf(roleNameZ);
    expect(aIndex).toBeLessThan(zIndex);

    rmSync(rolesTmpDir, { recursive: true });
  });

  test("returns empty array for nonexistent config directory", async () => {
    const result = await listRoles("/nonexistent/path/to/config");
    expect(result).toEqual([]);
  });

  test("returns unique role names (no duplicates)", async () => {
    const rolesTmpDir = join(tmpDir, `ai-unique-roles-${uid()}`);
    mkdirSync(join(rolesTmpDir, "roles"), { recursive: true });

    const roleName = `unique-role-${uid()}`;
    await Bun.write(join(rolesTmpDir, "roles", `${roleName}.md`), "Content");

    const result = await listRoles(rolesTmpDir);
    const count = result.filter((r) => r === roleName).length;
    expect(count).toBe(1);

    rmSync(rolesTmpDir, { recursive: true });
  });

  test("handles empty roles directory (exists but no files)", async () => {
    const rolesTmpDir = join(tmpDir, `ai-empty-roles-dir-${uid()}`);
    mkdirSync(join(rolesTmpDir, "roles"), { recursive: true });

    const result = await listRoles(rolesTmpDir);
    expect(result).toEqual([]);

    rmSync(rolesTmpDir, { recursive: true });
  });

  test("uses default directory when none specified", async () => {
    const result = await listRoles(undefined);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── ConfigSchema additional edge cases ───────────────────────────────────

describe("ConfigSchema edge cases", () => {
  test("accepts model as empty string", () => {
    const result = ConfigSchema.parse({ model: "" });
    expect(result.model).toBe("");
  });

  test("accepts system as empty string", () => {
    const result = ConfigSchema.parse({ system: "" });
    expect(result.system).toBe("");
  });

  test("accepts very large maxOutputTokens", () => {
    const result = ConfigSchema.parse({ maxOutputTokens: 1000000 });
    expect(result.maxOutputTokens).toBe(1000000);
  });

  test("rejects null", () => {
    expect(() => ConfigSchema.parse(null)).toThrow();
  });

  test("rejects string", () => {
    expect(() => ConfigSchema.parse("invalid")).toThrow();
  });

  test("rejects number", () => {
    expect(() => ConfigSchema.parse(42)).toThrow();
  });

  test("rejects array", () => {
    expect(() => ConfigSchema.parse([1, 2, 3])).toThrow();
  });
});

// ── Provider-specific config ─────────────────────────────────────────────

describe("ProviderConfigSchema", () => {
  test("accepts empty object", () => {
    expect(ProviderConfigSchema.parse({})).toEqual({});
  });

  test("accepts full valid provider config", () => {
    const result = ProviderConfigSchema.parse({
      model: "claude-sonnet-4-5",
      system: "You are Claude.",
      temperature: 0.5,
      maxOutputTokens: 4096,
    });
    expect(result.model).toBe("claude-sonnet-4-5");
    expect(result.system).toBe("You are Claude.");
    expect(result.temperature).toBe(0.5);
    expect(result.maxOutputTokens).toBe(4096);
  });

  test("accepts partial provider config (only temperature)", () => {
    const result = ProviderConfigSchema.parse({ temperature: 1.0 });
    expect(result.temperature).toBe(1.0);
    expect(result.model).toBeUndefined();
  });

  test("rejects temperature out of range", () => {
    expect(() => ProviderConfigSchema.parse({ temperature: 5.0 })).toThrow();
  });

  test("rejects negative maxOutputTokens", () => {
    expect(() => ProviderConfigSchema.parse({ maxOutputTokens: -1 })).toThrow();
  });
});

describe("ConfigSchema with providers", () => {
  test("accepts config with providers section", () => {
    const result = ConfigSchema.parse({
      model: "openai/gpt-4o",
      temperature: 0.7,
      providers: {
        anthropic: {
          model: "claude-sonnet-4-5",
          temperature: 0.5,
          maxOutputTokens: 4096,
          system: "You are Claude.",
        },
        openai: {
          temperature: 1.0,
        },
      },
    });
    expect(result.providers).toBeDefined();
    expect(result.providers?.anthropic?.temperature).toBe(0.5);
    expect(result.providers?.openai?.temperature).toBe(1.0);
  });

  test("accepts config without providers key (backward compatible)", () => {
    const result = ConfigSchema.parse({
      model: "openai/gpt-4o",
      temperature: 0.7,
    });
    expect(result.providers).toBeUndefined();
  });

  test("accepts empty providers object", () => {
    const result = ConfigSchema.parse({ providers: {} });
    expect(result.providers).toEqual({});
  });

  test("rejects providers with invalid temperature", () => {
    expect(() =>
      ConfigSchema.parse({
        providers: {
          openai: { temperature: 5.0 },
        },
      }),
    ).toThrow();
  });

  test("rejects providers with invalid maxOutputTokens", () => {
    expect(() =>
      ConfigSchema.parse({
        providers: {
          openai: { maxOutputTokens: -1 },
        },
      }),
    ).toThrow();
  });

  test("strips unknown properties from provider entries", () => {
    const result = ConfigSchema.parse({
      providers: {
        openai: { temperature: 0.5, unknownField: true },
      },
    });
    expect(
      (result.providers?.openai as Record<string, unknown>)?.unknownField,
    ).toBeUndefined();
  });
});

describe("getProviderDefaults", () => {
  test("returns provider-specific overrides when they exist", () => {
    const config = {
      model: "openai/gpt-4o",
      temperature: 0.7,
      providers: {
        anthropic: {
          temperature: 0.5,
          system: "You are Claude.",
        },
      },
    };
    const result = getProviderDefaults(config, "anthropic");
    expect(result.temperature).toBe(0.5);
    expect(result.system).toBe("You are Claude.");
  });

  test("returns empty object when provider is not in config", () => {
    const config = {
      model: "openai/gpt-4o",
      providers: {
        anthropic: { temperature: 0.5 },
      },
    };
    const result = getProviderDefaults(config, "openai");
    expect(result).toEqual({});
  });

  test("returns empty object when providers key is missing", () => {
    const config = { model: "openai/gpt-4o" };
    const result = getProviderDefaults(config, "anthropic");
    expect(result).toEqual({});
  });

  test("returns empty object for empty config", () => {
    const result = getProviderDefaults({}, "openai");
    expect(result).toEqual({});
  });

  test("returns correct overrides for multiple providers", () => {
    const config = {
      providers: {
        anthropic: { temperature: 0.5, model: "claude-sonnet-4-5" },
        openai: { temperature: 1.0 },
        ollama: { model: "llama3", temperature: 0.8 },
      },
    };
    expect(getProviderDefaults(config, "anthropic").temperature).toBe(0.5);
    expect(getProviderDefaults(config, "openai").temperature).toBe(1.0);
    expect(getProviderDefaults(config, "ollama").model).toBe("llama3");
  });
});

describe("loadConfig with providers", () => {
  test("loads config.json with providers section", async () => {
    const dir = makeTmpDir();
    await Bun.write(
      join(dir, "config.json"),
      JSON.stringify({
        model: "openai/gpt-4o",
        temperature: 0.7,
        providers: {
          anthropic: {
            model: "claude-sonnet-4-5",
            temperature: 0.5,
            system: "You are Claude.",
          },
          openai: {
            temperature: 1.0,
          },
        },
      }),
    );

    const config = await loadConfig(dir);
    expect(config.model).toBe("openai/gpt-4o");
    expect(config.providers?.anthropic?.temperature).toBe(0.5);
    expect(config.providers?.anthropic?.system).toBe("You are Claude.");
    expect(config.providers?.openai?.temperature).toBe(1.0);
  });

  test("ignores config.json with invalid provider section", async () => {
    const dir = makeTmpDir();
    await Bun.write(
      join(dir, "config.json"),
      JSON.stringify({
        model: "openai/gpt-4o",
        providers: {
          openai: { temperature: 99 }, // out of range
        },
      }),
    );

    // Should silently ignore the invalid config
    const config = await loadConfig(dir);
    expect(config).toEqual({});
  });

  test("loads config without providers key (backward compatible)", async () => {
    const dir = makeTmpDir();
    await Bun.write(
      join(dir, "config.json"),
      JSON.stringify({
        model: "anthropic/claude-sonnet-4-5",
        temperature: 0.7,
      }),
    );

    const config = await loadConfig(dir);
    expect(config.model).toBe("anthropic/claude-sonnet-4-5");
    expect(config.temperature).toBe(0.7);
    expect(config.providers).toBeUndefined();
  });
});

// ── Model Aliases ─────────────────────────────────────────────────────

describe("ConfigSchema with aliases", () => {
  test("accepts config with aliases field", () => {
    const result = ConfigSchema.parse({
      model: "claude",
      aliases: {
        claude: "anthropic/claude-sonnet-4-5",
        gpt: "openai/gpt-4o",
      },
    });
    expect(result.aliases).toBeDefined();
    expect(result.aliases?.claude).toBe("anthropic/claude-sonnet-4-5");
    expect(result.aliases?.gpt).toBe("openai/gpt-4o");
  });

  test("accepts config without aliases key (backward compatible)", () => {
    const result = ConfigSchema.parse({
      model: "openai/gpt-4o",
      temperature: 0.7,
    });
    expect(result.aliases).toBeUndefined();
  });

  test("accepts empty aliases object", () => {
    const result = ConfigSchema.parse({ aliases: {} });
    expect(result.aliases).toEqual({});
  });

  test("alias values can be any valid model string", () => {
    const result = ConfigSchema.parse({
      aliases: {
        short: "provider/some-long-model-id-v2.5",
        local: "ollama/llama3",
        bedrock: "bedrock/anthropic.claude-sonnet-4-2025-02-19",
      },
    });
    expect(result.aliases?.short).toBe("provider/some-long-model-id-v2.5");
    expect(result.aliases?.local).toBe("ollama/llama3");
    expect(result.aliases?.bedrock).toBe(
      "bedrock/anthropic.claude-sonnet-4-2025-02-19",
    );
  });

  test("rejects non-string alias values", () => {
    expect(() =>
      ConfigSchema.parse({
        aliases: { claude: 123 },
      }),
    ).toThrow();
  });

  test("rejects non-string alias keys with non-string values", () => {
    expect(() =>
      ConfigSchema.parse({
        aliases: { claude: true },
      }),
    ).toThrow();
  });
});

describe("resolveAlias", () => {
  test("returns the target when alias matches", () => {
    const config = {
      aliases: {
        claude: "anthropic/claude-sonnet-4-5",
        gpt: "openai/gpt-4o",
      },
    };
    expect(resolveAlias(config, "claude")).toBe("anthropic/claude-sonnet-4-5");
    expect(resolveAlias(config, "gpt")).toBe("openai/gpt-4o");
  });

  test("returns the input unchanged when no alias matches", () => {
    const config = {
      aliases: {
        claude: "anthropic/claude-sonnet-4-5",
      },
    };
    expect(resolveAlias(config, "openai/gpt-4o")).toBe("openai/gpt-4o");
    expect(resolveAlias(config, "unknown-model")).toBe("unknown-model");
  });

  test("returns input when config has no aliases", () => {
    const config = {};
    expect(resolveAlias(config, "claude")).toBe("claude");
    expect(resolveAlias(config, "openai/gpt-4o")).toBe("openai/gpt-4o");
  });

  test("returns input when aliases is undefined", () => {
    const config = { aliases: undefined };
    expect(resolveAlias(config, "claude")).toBe("claude");
  });

  test("returns input when aliases is empty object", () => {
    const config = { aliases: {} };
    expect(resolveAlias(config, "claude")).toBe("claude");
  });

  test("alias keys are case-sensitive", () => {
    const config = {
      aliases: {
        claude: "anthropic/claude-sonnet-4-5",
      },
    };
    expect(resolveAlias(config, "Claude")).toBe("Claude");
    expect(resolveAlias(config, "CLAUDE")).toBe("CLAUDE");
  });

  test("does not recursively resolve aliases", () => {
    const config = {
      aliases: {
        a: "b",
        b: "openai/gpt-4o",
      },
    };
    // "a" resolves to "b", not to "openai/gpt-4o"
    expect(resolveAlias(config, "a")).toBe("b");
  });

  test("handles alias with special characters in value", () => {
    const config = {
      aliases: {
        bedrock: "bedrock/anthropic.claude-sonnet-4-2025-02-19",
      },
    };
    expect(resolveAlias(config, "bedrock")).toBe(
      "bedrock/anthropic.claude-sonnet-4-2025-02-19",
    );
  });
});

describe("loadConfig with aliases", () => {
  test("loads config.json with aliases section", async () => {
    const dir = makeTmpDir();
    await Bun.write(
      join(dir, "config.json"),
      JSON.stringify({
        model: "claude",
        aliases: {
          claude: "anthropic/claude-sonnet-4-5",
          gpt: "openai/gpt-4o",
          gemini: "google/gemini-2.5-flash",
        },
      }),
    );

    const config = await loadConfig(dir);
    expect(config.model).toBe("claude");
    expect(config.aliases?.claude).toBe("anthropic/claude-sonnet-4-5");
    expect(config.aliases?.gpt).toBe("openai/gpt-4o");
    expect(config.aliases?.gemini).toBe("google/gemini-2.5-flash");
  });

  test("loads config without aliases key (backward compatible)", async () => {
    const dir = makeTmpDir();
    await Bun.write(
      join(dir, "config.json"),
      JSON.stringify({
        model: "anthropic/claude-sonnet-4-5",
        temperature: 0.7,
      }),
    );

    const config = await loadConfig(dir);
    expect(config.model).toBe("anthropic/claude-sonnet-4-5");
    expect(config.aliases).toBeUndefined();
  });
});

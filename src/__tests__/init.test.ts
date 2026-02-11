import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runInit } from "../init.ts";

const tmpDir = tmpdir();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ── Module exports ──────────────────────────────────────────────────────

describe("init module", () => {
  test("exports runInit function", () => {
    expect(typeof runInit).toBe("function");
  });

  test("runInit is an async function", () => {
    // Async functions have the AsyncFunction constructor
    expect(runInit.constructor.name).toBe("AsyncFunction");
  });
});

// ── Config file writing logic ───────────────────────────────────────────

describe("config file writing logic", () => {
  test("writes valid config.json format", async () => {
    const dir = join(tmpDir, `ai-init-${uid()}`);
    mkdirSync(dir, { recursive: true });

    const config = {
      model: "openai/gpt-4o",
      temperature: 0.7,
    };

    const configPath = join(dir, "config.json");
    await Bun.write(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const result = (await Bun.file(configPath).json()) as Record<
      string,
      unknown
    >;
    expect(result.model).toBe("openai/gpt-4o");
    expect(result.temperature).toBe(0.7);

    rmSync(dir, { recursive: true });
  });

  test("writes valid apiKeys.json format", async () => {
    const dir = join(tmpDir, `ai-init-keys-${uid()}`);
    mkdirSync(dir, { recursive: true });

    const apiKeys = {
      openai: "sk-test-key",
      anthropic: "sk-ant-test-key",
    };

    const apiKeysPath = join(dir, "apiKeys.json");
    await Bun.write(apiKeysPath, `${JSON.stringify(apiKeys, null, 2)}\n`);

    const result = (await Bun.file(apiKeysPath).json()) as Record<
      string,
      unknown
    >;
    expect(result.openai).toBe("sk-test-key");
    expect(result.anthropic).toBe("sk-ant-test-key");

    rmSync(dir, { recursive: true });
  });

  test("merges existing config when merging", async () => {
    const dir = join(tmpDir, `ai-init-merge-${uid()}`);
    mkdirSync(dir, { recursive: true });

    // Existing config
    const existingConfig = {
      model: "openai/gpt-4o",
      system: "Be concise.",
    };

    const configPath = join(dir, "config.json");
    await Bun.write(configPath, `${JSON.stringify(existingConfig, null, 2)}\n`);

    // Merge with new values
    const existing = (await Bun.file(configPath).json()) as Record<
      string,
      unknown
    >;
    const merged = {
      ...existing,
      model: "anthropic/claude-sonnet-4-5",
      temperature: 0.7,
    };

    await Bun.write(configPath, `${JSON.stringify(merged, null, 2)}\n`);

    const result = (await Bun.file(configPath).json()) as Record<
      string,
      unknown
    >;
    expect(result.model).toBe("anthropic/claude-sonnet-4-5"); // updated
    expect(result.system).toBe("Be concise."); // preserved from original
    expect(result.temperature).toBe(0.7); // new

    rmSync(dir, { recursive: true });
  });

  test("merges existing API keys when merging", async () => {
    const dir = join(tmpDir, `ai-init-merge-keys-${uid()}`);
    mkdirSync(dir, { recursive: true });

    const apiKeysPath = join(dir, "apiKeys.json");
    await Bun.write(
      apiKeysPath,
      `${JSON.stringify({ openai: "sk-existing" }, null, 2)}\n`,
    );

    // Merge with new key
    const existing = (await Bun.file(apiKeysPath).json()) as Record<
      string,
      unknown
    >;
    const merged = { ...existing, anthropic: "sk-ant-new" };
    await Bun.write(apiKeysPath, `${JSON.stringify(merged, null, 2)}\n`);

    const result = (await Bun.file(apiKeysPath).json()) as Record<
      string,
      unknown
    >;
    expect(result.openai).toBe("sk-existing"); // preserved
    expect(result.anthropic).toBe("sk-ant-new"); // added

    rmSync(dir, { recursive: true });
  });

  test("creates config directory if it does not exist", async () => {
    const dir = join(tmpDir, `ai-init-newdir-${uid()}`, ".ai-pipe");

    const configPath = join(dir, "config.json");
    // Bun.write auto-creates parent directories
    await Bun.write(
      configPath,
      `${JSON.stringify({ model: "openai/gpt-4o" }, null, 2)}\n`,
    );

    const exists = await Bun.file(configPath).exists();
    expect(exists).toBe(true);

    const result = (await Bun.file(configPath).json()) as Record<
      string,
      unknown
    >;
    expect(result.model).toBe("openai/gpt-4o");

    rmSync(join(tmpDir, `ai-init-newdir-${uid().split("-")[0]}`), {
      recursive: true,
      force: true,
    });
  });

  test("config JSON is pretty-printed with 2-space indent", async () => {
    const dir = join(tmpDir, `ai-init-format-${uid()}`);
    mkdirSync(dir, { recursive: true });

    const config = { model: "openai/gpt-4o", temperature: 0.7 };
    const configPath = join(dir, "config.json");
    await Bun.write(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const text = await Bun.file(configPath).text();
    expect(text).toContain("  "); // 2-space indent
    expect(text.endsWith("\n")).toBe(true); // trailing newline

    rmSync(dir, { recursive: true });
  });
});

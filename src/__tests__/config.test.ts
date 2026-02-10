import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { ConfigSchema, listRoles, loadConfig, loadRole } from "../config.ts";

const tmpDir = tmpdir();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("loadConfig", () => {
  test("loads config from directory", async () => {
    const dir = join(tmpDir, `ai-config-${uid()}`);
    mkdirSync(dir, { recursive: true });
    await Bun.write(
      join(dir, "config.json"),
      JSON.stringify({ model: "openai/gpt-4o" }),
    );

    const config = await loadConfig(dir);
    expect(config.model).toBe("openai/gpt-4o");

    rmSync(dir, { recursive: true });
  });

  test("loads apiKeys from directory", async () => {
    const dir = join(tmpDir, `ai-keys-${uid()}`);
    mkdirSync(dir, { recursive: true });
    await Bun.write(join(dir, "config.json"), JSON.stringify({}));
    await Bun.write(
      join(dir, "apiKeys.json"),
      JSON.stringify({ openai: "sk-1234" }),
    );

    const config = await loadConfig(dir);
    expect(config.apiKeys?.openai).toBe("sk-1234");

    rmSync(dir, { recursive: true });
  });

  test("handles missing config directory", async () => {
    const dir = join(tmpDir, `ai-missing-${uid()}`);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true });
    }

    const config = await loadConfig(dir);
    expect(config).toEqual({});
  });

  test("handles bad JSON in config file", async () => {
    const dir = join(tmpDir, `ai-bad-json-${uid()}`);
    mkdirSync(dir, { recursive: true });
    await Bun.write(join(dir, "config.json"), "bad json");

    const config = await loadConfig(dir);
    expect(config).toEqual({});

    rmSync(dir, { recursive: true });
  });

  test("handles bad JSON in apiKeys file", async () => {
    const dir = join(tmpDir, `ai-bad-keys-${uid()}`);
    mkdirSync(dir, { recursive: true });
    await Bun.write(join(dir, "config.json"), JSON.stringify({}));
    await Bun.write(join(dir, "apiKeys.json"), "bad json");

    const config = await loadConfig(dir);
    expect(config.apiKeys).toBeUndefined();

    rmSync(dir, { recursive: true });
  });

  test("uses default directory when none specified", async () => {
    const config = await loadConfig(undefined);
    expect(config).toBeDefined();
  });
});

// ── Roles ─────────────────────────────────────────────────────────

describe("loadRole", () => {
  test("loads role with .txt extension", async () => {
    const rolesTmpDir = join(tmpDir, `ai-roles-${uid()}`);
    const roleName = `test-role-${uid()}`;
    mkdirSync(join(rolesTmpDir, "roles"), { recursive: true });
    await Bun.write(
      join(rolesTmpDir, "roles", `${roleName}.txt`),
      "You are a helpful assistant.",
    );

    const result = await loadRole(roleName, rolesTmpDir);
    expect(result).toBe("You are a helpful assistant.");

    rmSync(rolesTmpDir, { recursive: true });
  });

  test("returns null for non-existent role", async () => {
    const result = await loadRole("non-existent-role-xyz");
    expect(result).toBeNull();
  });

  test("prevents path traversal with ../", async () => {
    const result = await loadRole("../etc/passwd");
    expect(result).toBeNull();
  });

  test("prevents path traversal with absolute path", async () => {
    const result = await loadRole("/etc/passwd");
    expect(result).toBeNull();
  });
});

describe("listRoles", () => {
  test("returns empty array when roles directory does not exist", async () => {
    // Use a fresh temp dir that doesn't have roles subdir
    const rolesTmpDir = join(tmpDir, `ai-empty-roles-${uid()}`);
    mkdirSync(rolesTmpDir, { recursive: true });

    const result = await listRoles(rolesTmpDir);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);

    rmSync(rolesTmpDir, { recursive: true });
  });

  test("lists only .txt files", async () => {
    const rolesTmpDir = join(tmpDir, `ai-list-roles-${uid()}`);
    const roleName1 = `role1-${uid()}`;
    const roleName2 = `role2-${uid()}`;
    mkdirSync(join(rolesTmpDir, "roles"), { recursive: true });

    await Bun.write(
      join(rolesTmpDir, "roles", `${roleName1}.txt`),
      "Role 1 content",
    );
    await Bun.write(
      join(rolesTmpDir, "roles", `${roleName2}.txt`),
      "Role 2 content",
    );

    const result = await listRoles(rolesTmpDir);
    expect(result).toContain(roleName1);
    expect(result).toContain(roleName2);

    rmSync(rolesTmpDir, { recursive: true });
  });

  test("returns sorted roles", async () => {
    const rolesTmpDir = join(tmpDir, `ai-sorted-roles-${uid()}`);
    const roleNameA = `aaa-role-${uid()}`;
    const roleNameZ = `zzz-role-${uid()}`;
    mkdirSync(join(rolesTmpDir, "roles"), { recursive: true });

    await Bun.write(join(rolesTmpDir, "roles", `${roleNameZ}.txt`), "Z role");
    await Bun.write(join(rolesTmpDir, "roles", `${roleNameA}.txt`), "A role");

    const result = await listRoles(rolesTmpDir);
    const aIndex = result.indexOf(roleNameA);
    const zIndex = result.indexOf(roleNameZ);
    expect(aIndex).toBeLessThan(zIndex);

    rmSync(rolesTmpDir, { recursive: true });
  });
});

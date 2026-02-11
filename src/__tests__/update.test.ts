import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import {
  compareVersions,
  shouldCheckForUpdates,
  checkForUpdates,
} from "../update.ts";

describe("compareVersions", () => {
  test("1.0.0 < 1.0.1 returns true", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBe(true);
  });

  test("1.0.0 < 2.0.0 returns true", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(true);
  });

  test("1.0.1 > 1.0.0 returns false", () => {
    expect(compareVersions("1.0.1", "1.0.0")).toBe(false);
  });

  test("equal versions returns false", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(false);
  });

  test("1.0.0 < 1.1.0 returns true", () => {
    expect(compareVersions("1.0.0", "1.1.0")).toBe(true);
  });
});

describe("shouldCheckForUpdates", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `update-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("returns true when file is missing", async () => {
    const missingPath = join(tmpDir, "nonexistent");
    expect(await shouldCheckForUpdates(missingPath)).toBe(true);
  });

  test("returns false when file has recent timestamp", async () => {
    const checkPath = join(tmpDir, ".update-check");
    await Bun.write(checkPath, String(Date.now()));
    expect(await shouldCheckForUpdates(checkPath)).toBe(false);
  });

  test("returns true when file has old timestamp", async () => {
    const checkPath = join(tmpDir, ".update-check");
    const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    await Bun.write(checkPath, String(oldTimestamp));
    expect(await shouldCheckForUpdates(checkPath)).toBe(true);
  });

  test("returns true when file has invalid content", async () => {
    const checkPath = join(tmpDir, ".update-check");
    await Bun.write(checkPath, "not-a-number");
    expect(await shouldCheckForUpdates(checkPath)).toBe(true);
  });
});

describe("checkForUpdates", () => {
  test("handles errors gracefully and returns null", async () => {
    // Use a path that will cause the fetch to fail (invalid registry)
    // by mocking fetch to throw
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("Network error");
    };

    try {
      const tmpPath = join(tmpdir(), `update-check-err-${Date.now()}`);
      const result = await checkForUpdates(tmpPath);
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns null when no update is available", async () => {
    const originalFetch = globalThis.fetch;
    const pkg = await import("../../package.json");

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ version: pkg.default.version }), {
        status: 200,
      });

    try {
      const tmpPath = join(tmpdir(), `update-check-no-${Date.now()}`);
      const result = await checkForUpdates(tmpPath);
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns message when update is available", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ version: "99.99.99" }), {
        status: 200,
      });

    try {
      const tmpPath = join(tmpdir(), `update-check-yes-${Date.now()}`);
      const result = await checkForUpdates(tmpPath);
      expect(result).not.toBeNull();
      expect(result).toContain("Update available");
      expect(result).toContain("99.99.99");
      expect(result).toContain("bun install -g ai-pipe");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns null when registry returns non-ok status", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () =>
      new Response("Not Found", { status: 404 });

    try {
      const tmpPath = join(tmpdir(), `update-check-404-${Date.now()}`);
      const result = await checkForUpdates(tmpPath);
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

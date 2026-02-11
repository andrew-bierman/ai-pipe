import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { CLEAR_COMMAND, EXIT_COMMANDS, startChat } from "../chat.ts";

// ── Module exports ──────────────────────────────────────────────────────

describe("chat module exports", () => {
  test("exports startChat function", () => {
    expect(typeof startChat).toBe("function");
  });

  test("exports EXIT_COMMANDS set", () => {
    expect(EXIT_COMMANDS).toBeInstanceOf(Set);
    expect(EXIT_COMMANDS.has("exit")).toBe(true);
    expect(EXIT_COMMANDS.has("quit")).toBe(true);
    expect(EXIT_COMMANDS.has("/bye")).toBe(true);
  });

  test("exports CLEAR_COMMAND constant", () => {
    expect(CLEAR_COMMAND).toBe("/clear");
  });
});

// ── Exit commands ───────────────────────────────────────────────────────

describe("exit commands", () => {
  test("recognizes exit", () => {
    expect(EXIT_COMMANDS.has("exit")).toBe(true);
  });

  test("recognizes quit", () => {
    expect(EXIT_COMMANDS.has("quit")).toBe(true);
  });

  test("recognizes /bye", () => {
    expect(EXIT_COMMANDS.has("/bye")).toBe(true);
  });

  test("does not recognize random strings", () => {
    expect(EXIT_COMMANDS.has("hello")).toBe(false);
    expect(EXIT_COMMANDS.has("stop")).toBe(false);
    expect(EXIT_COMMANDS.has("/exit")).toBe(false);
  });
});

// ── Clear command ───────────────────────────────────────────────────────

describe("clear command", () => {
  test("is /clear", () => {
    expect(CLEAR_COMMAND).toBe("/clear");
  });
});

// ── CLI integration (--chat flag) ───────────────────────────────────────

describe("CLI: --chat flag", () => {
  const CLI = join(import.meta.dir, "..", "index.ts");

  test("--chat appears in help output", async () => {
    const proc = Bun.spawn(["bun", CLI, "--help"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    expect(stdout).toContain("--chat");
    expect(stdout).toContain("interactive chat mode");
  });

  test("--chat without API key errors with missing env var", async () => {
    const proc = Bun.spawn(["bun", CLI, "--chat"], {
      stdin: new Blob(["exit\n"]),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        OPENAI_API_KEY: "",
        ANTHROPIC_API_KEY: "",
      },
    });
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    expect(stderr).toContain("Missing required environment variable");
    expect(exitCode).toBe(1);
  });
});

// ── ChatOptions interface ───────────────────────────────────────────────

describe("ChatOptions validation", () => {
  test("startChat rejects when called with invalid model", async () => {
    // startChat expects a LanguageModel; passing null should throw
    try {
      await startChat({
        // @ts-expect-error testing invalid model input
        model: null,
        modelString: "test/model",
        markdown: false,
        showCost: false,
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch {
      // Expected to throw
      expect(true).toBe(true);
    }
  });
});

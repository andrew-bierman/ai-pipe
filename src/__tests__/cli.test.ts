import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../../package.json";

const CLI = join(import.meta.dir, "..", "index.ts");
const tmpDir = tmpdir();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function makeTmpDir(): string {
  const dir = join(tmpDir, `ai-cfg-${uid()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const CLEAN_ENV = {
  OPENAI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  GOOGLE_GENERATIVE_AI_API_KEY: "",
  PERPLEXITY_API_KEY: "",
  XAI_API_KEY: "",
  MISTRAL_API_KEY: "",
  GROQ_API_KEY: "",
  DEEPSEEK_API_KEY: "",
  COHERE_API_KEY: "",
  OPENROUTER_API_KEY: "",
  AZURE_AI_API_KEY: "",
  TOGETHERAI_API_KEY: "",
  AWS_ACCESS_KEY_ID: "",
  AWS_SECRET_ACCESS_KEY: "",
  GOOGLE_VERTEX_PROJECT: "",
  GOOGLE_VERTEX_LOCATION: "",
  OLLAMA_HOST: "",
  HF_TOKEN: "",
};

async function runCLI(
  args: string[],
  opts?: { stdin?: string; env?: Record<string, string> },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", CLI, ...args], {
    stdin: opts?.stdin ? new Blob([opts.stdin]) : undefined,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...opts?.env },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

// ── Help & Version ─────────────────────────────────────────────────────

describe("CLI: help and version", () => {
  test("prints help with --help", async () => {
    const { stdout, exitCode } = await runCLI(["--help"]);
    expect(stdout).toContain("Usage: ai-pipe");
    expect(exitCode).toBe(0);
  });

  test("prints help with -h", async () => {
    const { stdout, exitCode } = await runCLI(["-h"]);
    expect(stdout).toContain("Usage: ai-pipe");
    expect(exitCode).toBe(0);
  });

  test("help contains all flags", async () => {
    const { stdout } = await runCLI(["--help"]);
    for (const flag of [
      "--model",
      "--system",
      "--file",
      "--json",
      "--no-stream",
      "--temperature",
      "--max-output-tokens",
      "--config",
      "--providers",
      "--completions",
    ]) {
      expect(stdout).toContain(flag);
    }
  });

  test("prints version with --version", async () => {
    const { stdout, exitCode } = await runCLI(["--version"]);
    expect(stdout.trim()).toBe(pkg.version);
    expect(exitCode).toBe(0);
  });

  test("prints version with -V", async () => {
    const { stdout, exitCode } = await runCLI(["-V"]);
    expect(stdout.trim()).toBe(pkg.version);
    expect(exitCode).toBe(0);
  });
});

// ── Provider Validation ────────────────────────────────────────────────

describe("CLI: provider validation", () => {
  test("errors on unknown provider", async () => {
    const { stderr, exitCode } = await runCLI(
      ["-m", "fakeprovider/model", "hello"],
      { env: CLEAN_ENV },
    );
    expect(stderr).toContain('Unknown provider "fakeprovider"');
    expect(stderr).toContain("Supported:");
    expect(exitCode).toBe(1);
  });

  test("lists all providers in error message", async () => {
    const { stderr } = await runCLI(["-m", "bad/model", "hello"], {
      env: CLEAN_ENV,
    });
    for (const p of [
      "openai",
      "anthropic",
      "google",
      "perplexity",
      "xai",
      "mistral",
      "groq",
      "deepseek",
      "cohere",
    ]) {
      expect(stderr).toContain(p);
    }
  });
});

// ── API Key Validation (all 9 providers) ───────────────────────────────

describe("CLI: API key validation", () => {
  const cases = [
    { provider: "openai", model: "openai/gpt-4o", envVar: "OPENAI_API_KEY" },
    {
      provider: "anthropic",
      model: "anthropic/claude-sonnet-4-5",
      envVar: "ANTHROPIC_API_KEY",
    },
    {
      provider: "google",
      model: "google/gemini-2.5-flash",
      envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    },
    {
      provider: "perplexity",
      model: "perplexity/sonar",
      envVar: "PERPLEXITY_API_KEY",
    },
    { provider: "xai", model: "xai/grok-3", envVar: "XAI_API_KEY" },
    {
      provider: "mistral",
      model: "mistral/mistral-large-latest",
      envVar: "MISTRAL_API_KEY",
    },
    {
      provider: "groq",
      model: "groq/llama-3.3-70b-versatile",
      envVar: "GROQ_API_KEY",
    },
    {
      provider: "deepseek",
      model: "deepseek/deepseek-chat",
      envVar: "DEEPSEEK_API_KEY",
    },
    {
      provider: "cohere",
      model: "cohere/command-r-plus",
      envVar: "COHERE_API_KEY",
    },
  ];

  for (const { provider, model, envVar } of cases) {
    test(`errors on missing ${provider} API key`, async () => {
      const { stderr, exitCode } = await runCLI(["-m", model, "hello"], {
        env: CLEAN_ENV,
      });
      expect(stderr).toContain("Missing required environment variable");
      expect(stderr).toContain(envVar);
      expect(exitCode).toBe(1);
    });
  }
});

// ── Model Defaulting ───────────────────────────────────────────────────

describe("CLI: model defaulting", () => {
  test("model defaults to openai when no prefix", async () => {
    const { stderr, exitCode } = await runCLI(["-m", "gpt-4o-mini", "hello"], {
      env: CLEAN_ENV,
    });
    expect(stderr).toContain("OPENAI_API_KEY");
    expect(exitCode).toBe(1);
  });

  test("defaults to openai/gpt-4o when no -m flag at all", async () => {
    const { stderr, exitCode } = await runCLI(["hello"], { env: CLEAN_ENV });
    expect(stderr).toContain("OPENAI_API_KEY");
    expect(exitCode).toBe(1);
  });
});

// ── Short Flags ────────────────────────────────────────────────────────

describe("CLI: short flags", () => {
  test("-m sets model", async () => {
    const { stderr, exitCode } = await runCLI(
      ["-m", "anthropic/claude-sonnet-4-5", "hello"],
      { env: CLEAN_ENV },
    );
    expect(stderr).toContain("ANTHROPIC_API_KEY");
    expect(exitCode).toBe(1);
  });

  test("-s sets system prompt (reaches API key check)", async () => {
    const { stderr, exitCode } = await runCLI(
      ["-s", "you are a poet", "hello"],
      { env: CLEAN_ENV },
    );
    expect(stderr).toContain("Missing required environment variable");
    expect(exitCode).toBe(1);
  });
});

// ── Config Directory ───────────────────────────────────────────────────

describe("CLI: config directory", () => {
  test("uses config directory when specified with -c", async () => {
    const dir = makeTmpDir();
    await Bun.write(
      join(dir, "config.json"),
      JSON.stringify({ model: "fakeprovider/model" }),
    );

    const { stderr, exitCode } = await runCLI(["-c", dir, "hello"], {
      env: CLEAN_ENV,
    });
    expect(stderr).toContain('Unknown provider "fakeprovider"');
    expect(exitCode).toBe(1);
  });

  test("CLI flag overrides config directory model", async () => {
    const dir = makeTmpDir();
    await Bun.write(
      join(dir, "config.json"),
      JSON.stringify({ model: "openai/gpt-4o" }),
    );

    const { stderr, exitCode } = await runCLI(
      ["-c", dir, "-m", "badprovider/model", "hello"],
      { env: { ...CLEAN_ENV, OPENAI_API_KEY: "fake" } },
    );
    expect(stderr).toContain('Unknown provider "badprovider"');
    expect(exitCode).toBe(1);
  });

  test("ignores missing config directory gracefully", async () => {
    const { stderr, exitCode } = await runCLI(
      ["-c", "/nonexistent/config-dir", "hello"],
      { env: CLEAN_ENV },
    );
    // Should get to API key error, not config directory error
    expect(stderr).toContain("Missing required environment variable");
    expect(exitCode).toBe(1);
  });

  test("ignores invalid config.json gracefully", async () => {
    const dir = makeTmpDir();
    await Bun.write(join(dir, "config.json"), "not json");

    const { stderr, exitCode } = await runCLI(["-c", dir, "hello"], {
      env: CLEAN_ENV,
    });
    expect(stderr).toContain("Missing required environment variable");
    expect(exitCode).toBe(1);
  });

  test("apiKeys.json provides API key (bypasses missing key error)", async () => {
    const dir = makeTmpDir();
    await Promise.all([
      Bun.write(
        join(dir, "config.json"),
        JSON.stringify({ model: "openai/gpt-4o" }),
      ),
      Bun.write(
        join(dir, "apiKeys.json"),
        JSON.stringify({ openai: "sk-fake-config-key" }),
      ),
    ]);

    const { stderr } = await runCLI(["-c", dir, "hello"], { env: CLEAN_ENV });
    // Should NOT get "Missing required environment variable" — the config key was injected
    expect(stderr).not.toContain("Missing required environment variable");
  });

  test("env var takes precedence over apiKeys.json", async () => {
    const dir = makeTmpDir();
    await Promise.all([
      Bun.write(
        join(dir, "config.json"),
        JSON.stringify({ model: "anthropic/claude-sonnet-4-5" }),
      ),
      Bun.write(
        join(dir, "apiKeys.json"),
        JSON.stringify({ anthropic: "sk-config-key" }),
      ),
    ]);

    const { stderr } = await runCLI(["-c", dir, "hello"], {
      env: { ...CLEAN_ENV, ANTHROPIC_API_KEY: "sk-env-key" },
    });
    // Should NOT get "Missing required environment variable" — env var is set
    expect(stderr).not.toContain("Missing required environment variable");
  });
});

// ── --providers ────────────────────────────────────────────────────────

describe("CLI: --providers flag", () => {
  test("lists all providers", async () => {
    const { stdout, exitCode } = await runCLI(["--providers"]);
    expect(stdout).toContain("Provider");
    expect(stdout).toContain("Env Variable");
    expect(stdout).toContain("Status");
    for (const p of [
      "openai",
      "anthropic",
      "google",
      "perplexity",
      "xai",
      "mistral",
      "groq",
      "deepseek",
      "cohere",
    ]) {
      expect(stdout).toContain(p);
    }
    expect(exitCode).toBe(0);
  });

  test("shows ✓ set when API key is present", async () => {
    const { stdout } = await runCLI(["--providers"], {
      env: { OPENAI_API_KEY: "sk-test" },
    });
    expect(stdout).toContain("✓ set");
  });

  test("shows ✗ missing when API key is absent", async () => {
    const { stdout } = await runCLI(["--providers"], {
      env: CLEAN_ENV,
    });
    expect(stdout).toContain("✗ missing");
  });
});

// ── --completions ──────────────────────────────────────────────────────

describe("CLI: --completions flag", () => {
  test("generates bash completions", async () => {
    const { stdout, exitCode } = await runCLI(["--completions", "bash"]);
    expect(stdout).toContain("_ai_pipe_completions");
    expect(stdout).toContain("complete -F");
    expect(exitCode).toBe(0);
  });

  test("generates zsh completions", async () => {
    const { stdout, exitCode } = await runCLI(["--completions", "zsh"]);
    expect(stdout).toContain("compdef _ai_pipe ai-pipe");
    expect(exitCode).toBe(0);
  });

  test("generates fish completions", async () => {
    const { stdout, exitCode } = await runCLI(["--completions", "fish"]);
    expect(stdout).toContain("complete -c ai-pipe");
    expect(exitCode).toBe(0);
  });

  test("errors on unknown shell", async () => {
    const { stderr, exitCode } = await runCLI(["--completions", "powershell"]);
    expect(stderr).toContain('Unknown shell "powershell"');
    expect(exitCode).toBe(1);
  });
});

// ── Stdin Handling ─────────────────────────────────────────────────────

describe("CLI: stdin handling", () => {
  test("reads stdin when piped", async () => {
    const { stderr, exitCode } = await runCLI([], {
      stdin: "hello from stdin",
      env: CLEAN_ENV,
    });
    expect(stderr).toContain("Missing required environment variable");
    expect(exitCode).toBe(1);
  });

  test("combines stdin with arg prompt", async () => {
    const { stderr, exitCode } = await runCLI(["review this"], {
      stdin: "const x = 1;",
      env: CLEAN_ENV,
    });
    expect(stderr).toContain("Missing required environment variable");
    expect(exitCode).toBe(1);
  });
});

// ── File Attachments ──────────────────────────────────────────────────

describe("CLI: file attachments", () => {
  test("--file appears in help", async () => {
    const { stdout } = await runCLI(["--help"]);
    expect(stdout).toContain("--file");
    expect(stdout).toContain("-f");
  });

  test("-f with nonexistent file errors to stderr", async () => {
    const { stderr, exitCode } = await runCLI(
      ["-f", "/nonexistent/file.txt", "hello"],
      { env: CLEAN_ENV },
    );
    expect(stderr).toContain("File not found");
    expect(exitCode).toBe(1);
  });

  test("-f with valid file reaches API key check", async () => {
    const path = join(tmpDir, `cli-test-${uid()}.txt`);
    await Bun.write(path, "file content");
    const { stderr, exitCode } = await runCLI(["-f", path, "review this"], {
      env: CLEAN_ENV,
    });
    expect(stderr).toContain("Missing required environment variable");
    expect(exitCode).toBe(1);
  });

  test("multiple -f flags accepted", async () => {
    const path1 = join(tmpDir, `cli-test-${uid()}-a.txt`);
    const path2 = join(tmpDir, `cli-test-${uid()}-b.txt`);
    await Bun.write(path1, "file one");
    await Bun.write(path2, "file two");
    const { stderr, exitCode } = await runCLI(
      ["-f", path1, "-f", path2, "review"],
      { env: CLEAN_ENV },
    );
    expect(stderr).toContain("Missing required environment variable");
    expect(exitCode).toBe(1);
  });

  test("-f combined with stdin", async () => {
    const path = join(tmpDir, `cli-test-${uid()}.txt`);
    await Bun.write(path, "file content");
    const { stderr, exitCode } = await runCLI(["-f", path, "review"], {
      stdin: "stdin content",
      env: CLEAN_ENV,
    });
    expect(stderr).toContain("Missing required environment variable");
    expect(exitCode).toBe(1);
  });

  test("-f alone (no prompt, no stdin) reaches API key check", async () => {
    const path = join(tmpDir, `cli-test-${uid()}.txt`);
    await Bun.write(path, "file content");
    const { stderr, exitCode } = await runCLI(["-f", path], { env: CLEAN_ENV });
    expect(stderr).toContain("Missing required environment variable");
    expect(exitCode).toBe(1);
  });
});

// ── Multi-Word Prompts ─────────────────────────────────────────────────

describe("CLI: prompt joining", () => {
  test("joins multiple words into prompt", async () => {
    const { stderr, exitCode } = await runCLI(
      ["explain", "monads", "in", "one", "sentence"],
      { env: CLEAN_ENV },
    );
    // Reaches API key check, meaning prompt was successfully constructed
    expect(stderr).toContain("Missing required environment variable");
    expect(exitCode).toBe(1);
  });
});

// ── Errors to stderr ───────────────────────────────────────────────────

describe("CLI: errors go to stderr", () => {
  test("API key error goes to stderr, not stdout", async () => {
    const { stdout, stderr, exitCode } = await runCLI(["hello"], {
      env: CLEAN_ENV,
    });
    expect(stdout).toBe("");
    expect(stderr).toContain("Error:");
    expect(exitCode).toBe(1);
  });

  test("unknown provider error goes to stderr", async () => {
    const { stdout, stderr, exitCode } = await runCLI(
      ["-m", "bad/model", "hello"],
      { env: CLEAN_ENV },
    );
    expect(stdout).toBe("");
    expect(stderr).toContain("Error:");
    expect(exitCode).toBe(1);
  });
});

import { test, expect, describe } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI = join(import.meta.dir, "..", "index.ts");
const tmpDir = tmpdir();

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
};

async function runCLI(
  args: string[],
  opts?: { stdin?: string; env?: Record<string, string> }
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

describe("CLI: help and version", () => {
  test("prints help with --help", async () => {
    const { stdout, exitCode } = await runCLI(["--help"]);
    expect(stdout).toContain("Usage: ai");
    expect(stdout).toContain("--model");
    expect(stdout).toContain("--system");
    expect(stdout).toContain("--json");
    expect(stdout).toContain("--no-stream");
    expect(exitCode).toBe(0);
  });

  test("prints version with --version", async () => {
    const { stdout, exitCode } = await runCLI(["--version"]);
    expect(stdout.trim()).toBe("1.0.0");
    expect(exitCode).toBe(0);
  });
});

describe("CLI: provider validation", () => {
  test("errors on unknown provider", async () => {
    const { stderr, exitCode } = await runCLI(
      ["-m", "fakeprovider/model", "hello"],
      { env: CLEAN_ENV }
    );
    expect(stderr).toContain('Unknown provider "fakeprovider"');
    expect(stderr).toContain("Supported:");
    expect(exitCode).toBe(1);
  });

  test("lists all providers in error message", async () => {
    const { stderr } = await runCLI(
      ["-m", "bad/model", "hello"],
      { env: CLEAN_ENV }
    );
    for (const p of ["openai", "anthropic", "google", "perplexity", "xai", "mistral", "groq", "deepseek", "cohere"]) {
      expect(stderr).toContain(p);
    }
  });
});

describe("CLI: API key validation", () => {
  const cases = [
    { provider: "openai", model: "openai/gpt-4o", envVar: "OPENAI_API_KEY" },
    { provider: "anthropic", model: "anthropic/claude-sonnet-4-5", envVar: "ANTHROPIC_API_KEY" },
    { provider: "google", model: "google/gemini-2.5-flash", envVar: "GOOGLE_GENERATIVE_AI_API_KEY" },
    { provider: "perplexity", model: "perplexity/sonar", envVar: "PERPLEXITY_API_KEY" },
    { provider: "xai", model: "xai/grok-3", envVar: "XAI_API_KEY" },
    { provider: "mistral", model: "mistral/mistral-large-latest", envVar: "MISTRAL_API_KEY" },
    { provider: "groq", model: "groq/llama-3.3-70b-versatile", envVar: "GROQ_API_KEY" },
    { provider: "deepseek", model: "deepseek/deepseek-chat", envVar: "DEEPSEEK_API_KEY" },
    { provider: "cohere", model: "cohere/command-r-plus", envVar: "COHERE_API_KEY" },
  ];

  for (const { provider, model, envVar } of cases) {
    test(`errors on missing ${provider} API key`, async () => {
      const { stderr, exitCode } = await runCLI(
        ["-m", model, "hello"],
        { env: CLEAN_ENV }
      );
      expect(stderr).toContain("Missing API key");
      expect(stderr).toContain(envVar);
      expect(exitCode).toBe(1);
    });
  }
});

describe("CLI: model defaulting", () => {
  test("model defaults to openai when no prefix", async () => {
    const { stderr, exitCode } = await runCLI(
      ["-m", "gpt-4o-mini", "hello"],
      { env: CLEAN_ENV }
    );
    expect(stderr).toContain("OPENAI_API_KEY");
    expect(exitCode).toBe(1);
  });
});

describe("CLI: config file", () => {
  test("uses config file when specified", async () => {
    const configPath = join(tmpDir, `ai-cli-test-cfg-${Date.now()}.json`);
    await Bun.write(configPath, JSON.stringify({ model: "fakeprovider/model" }));

    const { stderr, exitCode } = await runCLI(
      ["-c", configPath, "hello"],
      { env: CLEAN_ENV }
    );
    expect(stderr).toContain('Unknown provider "fakeprovider"');
    expect(exitCode).toBe(1);
  });

  test("CLI flag overrides config file model", async () => {
    const configPath = join(tmpDir, `ai-cli-test-override-${Date.now()}.json`);
    await Bun.write(configPath, JSON.stringify({ model: "openai/gpt-4o" }));

    const { stderr, exitCode } = await runCLI(
      ["-c", configPath, "-m", "badprovider/model", "hello"],
      { env: { ...CLEAN_ENV, OPENAI_API_KEY: "fake" } }
    );
    expect(stderr).toContain('Unknown provider "badprovider"');
    expect(exitCode).toBe(1);
  });
});

describe("CLI: stdin handling", () => {
  test("reads stdin when piped", async () => {
    const { stderr, exitCode } = await runCLI([], {
      stdin: "hello from stdin",
      env: CLEAN_ENV,
    });
    expect(stderr).toContain("Missing API key");
    expect(exitCode).toBe(1);
  });

  test("combines stdin with arg prompt", async () => {
    const { stderr, exitCode } = await runCLI(["review this"], {
      stdin: "const x = 1;",
      env: CLEAN_ENV,
    });
    expect(stderr).toContain("Missing API key");
    expect(exitCode).toBe(1);
  });
});

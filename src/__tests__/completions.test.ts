import { test, expect, describe } from "bun:test";
import { generateCompletions } from "../completions.ts";

describe("generateCompletions", () => {
  test("generates bash completions", () => {
    const result = generateCompletions("bash");
    expect(result).toContain("_ai_completions");
    expect(result).toContain("complete -F _ai_completions ai");
    expect(result).toContain("--model");
    expect(result).toContain("--providers");
    expect(result).toContain("openai");
    expect(result).toContain("anthropic");
    expect(result).toContain("perplexity");
  });

  test("generates zsh completions", () => {
    const result = generateCompletions("zsh");
    expect(result).toContain("compdef _ai ai");
    expect(result).toContain("_arguments");
    expect(result).toContain("--model");
    expect(result).toContain("--completions");
    expect(result).toContain("openai/");
    expect(result).toContain("perplexity/");
  });

  test("generates fish completions", () => {
    const result = generateCompletions("fish");
    expect(result).toContain("complete -c ai");
    expect(result).toContain("-l model");
    expect(result).toContain("openai/");
    expect(result).toContain("perplexity/");
    expect(result).toContain("xai/");
  });

  test("includes all providers in bash completions", () => {
    const result = generateCompletions("bash");
    for (const p of ["openai", "anthropic", "google", "perplexity", "xai", "mistral", "groq", "deepseek", "cohere"]) {
      expect(result).toContain(p);
    }
  });
});

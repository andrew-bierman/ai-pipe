import { test, expect, describe } from "bun:test";
import { generateCompletions } from "../completions.ts";
import { SUPPORTED_PROVIDERS } from "../provider.ts";

describe("generateCompletions", () => {
  // ── bash ─────────────────────────────────────────────────────────

  describe("bash", () => {
    test("generates valid bash completions", () => {
      const result = generateCompletions("bash");
      expect(result).toContain("_ai_completions");
      expect(result).toContain("complete -F _ai_completions ai");
    });

    test("includes all flags", () => {
      const result = generateCompletions("bash");
      expect(result).toContain("--model");
      expect(result).toContain("--system");
      expect(result).toContain("--json");
      expect(result).toContain("--no-stream");
      expect(result).toContain("--temperature");
      expect(result).toContain("--max-output-tokens");
      expect(result).toContain("--config");
      expect(result).toContain("--providers");
      expect(result).toContain("--completions");
      expect(result).toContain("--version");
      expect(result).toContain("--help");
    });

    test("includes all providers", () => {
      const result = generateCompletions("bash");
      for (const p of SUPPORTED_PROVIDERS) {
        expect(result).toContain(p);
      }
    });

    test("includes install instructions", () => {
      const result = generateCompletions("bash");
      expect(result).toContain('eval "$(ai --completions bash)"');
    });
  });

  // ── zsh ──────────────────────────────────────────────────────────

  describe("zsh", () => {
    test("generates valid zsh completions", () => {
      const result = generateCompletions("zsh");
      expect(result).toContain("compdef _ai ai");
      expect(result).toContain("_arguments");
    });

    test("includes provider suggestions with trailing slash", () => {
      const result = generateCompletions("zsh");
      for (const p of SUPPORTED_PROVIDERS) {
        expect(result).toContain(`'${p}/'`);
      }
    });

    test("includes install instructions", () => {
      const result = generateCompletions("zsh");
      expect(result).toContain('eval "$(ai --completions zsh)"');
    });
  });

  // ── fish ─────────────────────────────────────────────────────────

  describe("fish", () => {
    test("generates valid fish completions", () => {
      const result = generateCompletions("fish");
      expect(result).toContain("complete -c ai");
    });

    test("includes all flags", () => {
      const result = generateCompletions("fish");
      expect(result).toContain("-l model");
      expect(result).toContain("-l system");
      expect(result).toContain("-l json");
      expect(result).toContain("-l no-stream");
      expect(result).toContain("-l temperature");
      expect(result).toContain("-l max-output-tokens");
      expect(result).toContain("-l config");
      expect(result).toContain("-l providers");
      expect(result).toContain("-l completions");
      expect(result).toContain("-l version");
      expect(result).toContain("-l help");
    });

    test("includes provider suggestions with trailing slash", () => {
      const result = generateCompletions("fish");
      for (const p of SUPPORTED_PROVIDERS) {
        expect(result).toContain(`${p}/`);
      }
    });

    test("includes install instructions", () => {
      const result = generateCompletions("fish");
      expect(result).toContain("~/.config/fish/completions/ai.fish");
    });
  });
});

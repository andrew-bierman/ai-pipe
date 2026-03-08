import { describe, expect, test } from "bun:test";
import { generateCompletions } from "../completions.ts";
import { SUPPORTED_PROVIDERS } from "../provider.ts";

describe("generateCompletions", () => {
  // ── bash ─────────────────────────────────────────────────────────

  describe("bash", () => {
    test("generates valid bash completions", () => {
      const result = generateCompletions("bash");
      expect(result).toContain("_ai_pipe_completions");
      expect(result).toContain("complete -F _ai_pipe_completions ai-pipe");
    });

    test("includes all flags", () => {
      const result = generateCompletions("bash");
      expect(result).toContain("--model");
      expect(result).toContain("--system");
      expect(result).toContain("--role");
      expect(result).toContain("--roles");
      expect(result).toContain("--file");
      expect(result).toContain("--image");
      expect(result).toContain("--json");
      expect(result).toContain("--no-stream");
      expect(result).toContain("--temperature");
      expect(result).toContain("--max-output-tokens");
      expect(result).toContain("--config");
      expect(result).toContain("--cost");
      expect(result).toContain("--markdown");
      expect(result).toContain("--session");
      expect(result).toContain("--providers");
      expect(result).toContain("--completions");
      expect(result).toContain("--version");
      expect(result).toContain("--help");
    });

    test("includes short flags", () => {
      const result = generateCompletions("bash");
      for (const flag of [
        "-m",
        "-s",
        "-r",
        "-f",
        "-i",
        "-j",
        "-t",
        "-c",
        "-C",
        "-V",
        "-h",
      ]) {
        expect(result).toContain(flag);
      }
    });

    test("includes all providers", () => {
      const result = generateCompletions("bash");
      for (const p of SUPPORTED_PROVIDERS) {
        expect(result).toContain(p);
      }
    });

    test("includes install instructions", () => {
      const result = generateCompletions("bash");
      expect(result).toContain('eval "$(ai-pipe --completions bash)"');
    });

    test("registers completions for ai alias", () => {
      const result = generateCompletions("bash");
      expect(result).toContain("complete -F _ai_pipe_completions ai");
    });
  });

  // ── zsh ──────────────────────────────────────────────────────────

  describe("zsh", () => {
    test("generates valid zsh completions", () => {
      const result = generateCompletions("zsh");
      expect(result).toContain("compdef _ai_pipe ai-pipe");
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
      expect(result).toContain('eval "$(ai-pipe --completions zsh)"');
    });

    test("does not define phantom -R short flag for --roles", () => {
      const result = generateCompletions("zsh");
      expect(result).not.toContain("-R,--roles");
      expect(result).not.toContain("-R --roles");
    });

    test("includes new option entries", () => {
      const result = generateCompletions("zsh");
      expect(result).toContain("--image");
      expect(result).toContain("--cost");
      expect(result).toContain("--markdown");
      expect(result).toContain("--session");
    });

    test("registers completions for ai alias", () => {
      const result = generateCompletions("zsh");
      expect(result).toContain("compdef _ai_pipe ai");
    });
  });

  // ── fish ─────────────────────────────────────────────────────────

  describe("fish", () => {
    test("generates valid fish completions", () => {
      const result = generateCompletions("fish");
      expect(result).toContain("complete -c ai-pipe");
    });

    test("includes all flags", () => {
      const result = generateCompletions("fish");
      expect(result).toContain("-l model");
      expect(result).toContain("-l system");
      expect(result).toContain("-l role");
      expect(result).toContain("-l roles");
      expect(result).toContain("-l file");
      expect(result).toContain("-l image");
      expect(result).toContain("-l json");
      expect(result).toContain("-l no-stream");
      expect(result).toContain("-l temperature");
      expect(result).toContain("-l max-output-tokens");
      expect(result).toContain("-l config");
      expect(result).toContain("-l cost");
      expect(result).toContain("-l markdown");
      expect(result).toContain("-l session");
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
      expect(result).toContain("~/.config/fish/completions/ai-pipe.fish");
    });

    test("includes short flags", () => {
      const result = generateCompletions("fish");
      expect(result).toContain("-s m");
      expect(result).toContain("-s s");
      expect(result).toContain("-s r");
      expect(result).toContain("-s f");
      expect(result).toContain("-s j");
      expect(result).toContain("-s t");
      expect(result).toContain("-s c");
      expect(result).toContain("-s V");
      expect(result).toContain("-s h");
    });

    test("does not define phantom -R short flag for --roles", () => {
      const result = generateCompletions("fish");
      expect(result).not.toContain("-s R -l roles");
    });

    test("includes completions for ai alias", () => {
      const result = generateCompletions("fish");
      expect(result).toContain("complete -c ai");
    });
  });

  // ── cross-shell consistency ─────────────────────────────────────

  describe("cross-shell consistency", () => {
    test("all shells include the app name", () => {
      for (const shell of ["bash", "zsh", "fish"]) {
        const result = generateCompletions(shell);
        expect(result).toContain("ai-pipe");
      }
    });

    test("all shells are non-empty strings", () => {
      for (const shell of ["bash", "zsh", "fish"]) {
        const result = generateCompletions(shell);
        expect(result.length).toBeGreaterThan(0);
      }
    });

    test("all shells include comment at the start", () => {
      for (const shell of ["bash", "zsh", "fish"]) {
        const result = generateCompletions(shell);
        expect(result.startsWith("#")).toBe(true);
      }
    });

    test("bash includes shell-specific COMPREPLY", () => {
      const result = generateCompletions("bash");
      expect(result).toContain("COMPREPLY");
      expect(result).toContain("compgen");
    });

    test("zsh includes shell-specific _arguments", () => {
      const result = generateCompletions("zsh");
      expect(result).toContain("_arguments");
      expect(result).toContain("_describe");
    });

    test("fish uses complete -c syntax", () => {
      const result = generateCompletions("fish");
      expect(result).toContain("complete -c");
    });
  });

  // ── zsh additional ──────────────────────────────────────────────

  describe("zsh additional", () => {
    test("includes all flags in zsh format", () => {
      const result = generateCompletions("zsh");
      expect(result).toContain("--model");
      expect(result).toContain("--system");
      expect(result).toContain("--role");
      expect(result).toContain("--roles");
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

    test("includes temperature range in description", () => {
      const result = generateCompletions("zsh");
      expect(result).toContain("0-2");
    });
  });

  // ── bash additional ──────────────────────────────────────────────

  describe("bash additional", () => {
    test("includes case statement for completions", () => {
      const result = generateCompletions("bash");
      expect(result).toContain("case");
      expect(result).toContain("esac");
    });

    test("includes file completion for --file flag", () => {
      const result = generateCompletions("bash");
      expect(result).toContain("compgen -f");
    });

    test("includes directory completion for --config flag", () => {
      const result = generateCompletions("bash");
      expect(result).toContain("compgen -d");
    });

    test("includes shell completions for --completions flag", () => {
      const result = generateCompletions("bash");
      expect(result).toContain("bash zsh fish");
    });
  });
});

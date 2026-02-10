import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "../markdown.ts";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";

describe("renderMarkdown", () => {
  test("renders headings with ANSI bold + magenta", () => {
    const result = renderMarkdown("# Hello");
    expect(result).toContain(BOLD);
    expect(result).toContain(MAGENTA);
    expect(result).toContain("# Hello");
    expect(result).toContain(RESET);
  });

  test("renders bold text", () => {
    const result = renderMarkdown("**bold**");
    expect(result).toContain(BOLD);
    expect(result).toContain("bold");
  });

  test("renders italic text", () => {
    const result = renderMarkdown("*italic*");
    expect(result).toContain(ITALIC);
    expect(result).toContain("italic");
  });

  test("renders inline code with cyan", () => {
    const result = renderMarkdown("`code`");
    expect(result).toContain(CYAN);
    expect(result).toContain("`code`");
  });

  test("renders code blocks with green", () => {
    const result = renderMarkdown("```js\nconsole.log('hi')\n```");
    expect(result).toContain(GREEN);
    expect(result).toContain("console.log('hi')");
    expect(result).toContain(DIM);
  });

  test("renders code blocks with language label", () => {
    const result = renderMarkdown("```typescript\nconst x = 1;\n```");
    expect(result).toContain("typescript");
  });

  test("renders unordered list items with bullets", () => {
    const result = renderMarkdown("- one\n- two");
    expect(result).toContain(YELLOW);
    expect(result).toContain("•");
    expect(result).toContain("one");
    expect(result).toContain("two");
  });

  test("renders blockquotes with dim bar", () => {
    const result = renderMarkdown("> quoted text");
    expect(result).toContain("│");
    expect(result).toContain("quoted text");
  });

  test("renders horizontal rules", () => {
    const result = renderMarkdown("---");
    expect(result).toContain("─".repeat(40));
  });

  test("renders links with href", () => {
    const result = renderMarkdown("[click](https://example.com)");
    expect(result).toContain(CYAN);
    expect(result).toContain("click");
    expect(result).toContain("https://example.com");
  });

  test("returns plain text for no markdown", () => {
    const result = renderMarkdown("just plain text");
    expect(result).toContain("just plain text");
  });

  test("handles task lists", () => {
    const result = renderMarkdown("- [x] done\n- [ ] pending");
    expect(result).toContain(GREEN);
    expect(result).toContain("✓");
    expect(result).toContain("done");
    expect(result).toContain("○");
    expect(result).toContain("pending");
  });
});

import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "../markdown.ts";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const BOLD_OFF = "\x1b[22m";
const DIM = "\x1b[2m";
const DIM_OFF = "\x1b[22m";
const ITALIC = "\x1b[3m";
const ITALIC_OFF = "\x1b[23m";
const UNDERLINE = "\x1b[4m";
const UNDERLINE_OFF = "\x1b[24m";
const STRIKETHROUGH = "\x1b[9m";
const STRIKETHROUGH_OFF = "\x1b[29m";
const CYAN = "\x1b[36m";
const COLOR_OFF = "\x1b[39m";
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

describe("renderMarkdown: headings", () => {
  test("renders h1 with single #", () => {
    const result = renderMarkdown("# Title");
    expect(result).toContain("# Title");
    expect(result).toContain(MAGENTA);
  });

  test("renders h2 with ##", () => {
    const result = renderMarkdown("## Subtitle");
    expect(result).toContain("## Subtitle");
    expect(result).toContain(MAGENTA);
  });

  test("renders h3 with ###", () => {
    const result = renderMarkdown("### Section");
    expect(result).toContain("### Section");
  });

  test("renders h4 with ####", () => {
    const result = renderMarkdown("#### Subsection");
    expect(result).toContain("#### Subsection");
  });

  test("renders h5 with #####", () => {
    const result = renderMarkdown("##### Deep");
    expect(result).toContain("##### Deep");
  });

  test("renders h6 with ######", () => {
    const result = renderMarkdown("###### Deepest");
    expect(result).toContain("###### Deepest");
  });
});

describe("renderMarkdown: strikethrough", () => {
  test("renders strikethrough text with ANSI code", () => {
    const result = renderMarkdown("~~deleted~~");
    expect(result).toContain(STRIKETHROUGH);
    expect(result).toContain("deleted");
    expect(result).toContain(STRIKETHROUGH_OFF);
  });
});

describe("renderMarkdown: images", () => {
  test("renders images with alt text and src", () => {
    const result = renderMarkdown("![alt text](https://example.com/img.png)");
    expect(result).toContain("alt text");
    expect(result).toContain("https://example.com/img.png");
    expect(result).toContain(DIM);
  });
});

describe("renderMarkdown: links", () => {
  test("renders links with underline and cyan", () => {
    const result = renderMarkdown("[link text](https://example.com)");
    expect(result).toContain(UNDERLINE);
    expect(result).toContain(CYAN);
    expect(result).toContain("link text");
    expect(result).toContain("https://example.com");
  });
});

describe("renderMarkdown: tables", () => {
  test("renders table with headers and cells", () => {
    const md = "| Name | Age |\n| --- | --- |\n| Alice | 30 |";
    const result = renderMarkdown(md);
    expect(result).toContain("Name");
    expect(result).toContain("Age");
    expect(result).toContain("Alice");
    expect(result).toContain("30");
    expect(result).toContain(BOLD);
  });
});

describe("renderMarkdown: code blocks", () => {
  test("renders code block without language label", () => {
    const result = renderMarkdown("```\nplain code\n```");
    expect(result).toContain(GREEN);
    expect(result).toContain("plain code");
    expect(result).toContain("───");
  });

  test("code block contains delimiter lines", () => {
    const result = renderMarkdown("```python\nprint('hi')\n```");
    expect(result).toContain("───");
    expect(result).toContain("python");
    expect(result).toContain("print('hi')");
  });
});

describe("renderMarkdown: edge cases", () => {
  test("handles empty string", () => {
    const result = renderMarkdown("");
    expect(typeof result).toBe("string");
  });

  test("handles only whitespace", () => {
    const result = renderMarkdown("   \n   ");
    expect(typeof result).toBe("string");
  });

  test("handles multiple paragraphs", () => {
    const result = renderMarkdown("First paragraph.\n\nSecond paragraph.");
    expect(result).toContain("First paragraph.");
    expect(result).toContain("Second paragraph.");
  });

  test("handles nested formatting (bold in list)", () => {
    const result = renderMarkdown("- **bold item**\n- normal item");
    expect(result).toContain(BOLD);
    expect(result).toContain("bold item");
    expect(result).toContain("normal item");
  });

  test("nested bold with inline code uses specific off codes (not full reset)", () => {
    const result = renderMarkdown("**bold with `code` inside**");
    // The code span should end with COLOR_OFF + DIM_OFF, not a full RESET
    // that would kill the parent bold context
    expect(result).toContain(COLOR_OFF);
    expect(result).toContain(DIM_OFF);
    // Bold should use BOLD_OFF at the end, not full RESET
    expect(result).toContain(BOLD_OFF);
  });

  test("nested italic with inline code preserves italic after code", () => {
    const result = renderMarkdown("*italic with `code` inside*");
    expect(result).toContain(ITALIC);
    expect(result).toContain(ITALIC_OFF);
    expect(result).toContain(CYAN);
  });

  test("handles inline code in paragraph", () => {
    const result = renderMarkdown("Use `console.log` for debugging.");
    expect(result).toContain(CYAN);
    expect(result).toContain("`console.log`");
    expect(result).toContain("for debugging");
  });

  test("handles multi-line blockquote", () => {
    const result = renderMarkdown("> line one\n> line two");
    expect(result).toContain("│");
    expect(result).toContain("line one");
    expect(result).toContain("line two");
  });

  test("handles multiple horizontal rules", () => {
    const result = renderMarkdown("---\n\n---");
    const hrPart = "─".repeat(40);
    const count = result.split(hrPart).length - 1;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("handles ordered list items", () => {
    const result = renderMarkdown("1. first\n2. second\n3. third");
    expect(result).toContain("first");
    expect(result).toContain("second");
    expect(result).toContain("third");
  });

  test("handles mixed content: heading, paragraph, code, list", () => {
    const md = "# Title\n\nParagraph text.\n\n```js\ncode();\n```\n\n- item";
    const result = renderMarkdown(md);
    expect(result).toContain("# Title");
    expect(result).toContain("Paragraph text.");
    expect(result).toContain("code();");
    expect(result).toContain("item");
  });
});

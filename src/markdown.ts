/**
 * ANSI escape codes for terminal styling.
 *
 * Uses specific "off" codes (e.g. \x1b[22m for bold-off) instead of a full
 * reset (\x1b[0m) so that nested formatting works correctly — e.g. bold text
 * containing inline code won't lose the bold after the code span ends.
 */
const ANSI = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  BOLD_OFF: "\x1b[22m",
  DIM: "\x1b[2m",
  DIM_OFF: "\x1b[22m",
  ITALIC: "\x1b[3m",
  ITALIC_OFF: "\x1b[23m",
  UNDERLINE: "\x1b[4m",
  UNDERLINE_OFF: "\x1b[24m",
  STRIKETHROUGH: "\x1b[9m",
  STRIKETHROUGH_OFF: "\x1b[29m",
  CYAN: "\x1b[36m",
  COLOR_OFF: "\x1b[39m",
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  MAGENTA: "\x1b[35m",
} as const;

/** Width of horizontal rules in characters */
const HR_WIDTH = 40;

/**
 * Render a markdown string as ANSI-styled terminal output.
 *
 * Uses Bun's built-in markdown parser when available, with custom ANSI escape
 * code renderers for headings, bold, italic, code blocks, links, lists,
 * blockquotes, tables, strikethrough, and task lists.
 *
 * Falls back to a regex-based renderer when Bun.markdown is not available
 * (e.g. older Bun versions).
 *
 * @param text - Raw markdown string to render.
 * @returns The markdown rendered with ANSI escape codes for terminal display.
 */
export function renderMarkdown(text: string): string {
  try {
    return Bun.markdown.render(
      text,
      {
        heading: (children, { level }) => {
          const prefix = "#".repeat(level);
          return `${ANSI.BOLD}${ANSI.MAGENTA}${prefix} ${children}${ANSI.RESET}\n\n`;
        },
        paragraph: (children) => `${children}\n\n`,
        strong: (children) => `${ANSI.BOLD}${children}${ANSI.BOLD_OFF}`,
        emphasis: (children) => `${ANSI.ITALIC}${children}${ANSI.ITALIC_OFF}`,
        codespan: (children) =>
          `${ANSI.DIM}${ANSI.CYAN}\`${children}\`${ANSI.COLOR_OFF}${ANSI.DIM_OFF}`,
        code: (children, meta) => {
          // Trim trailing newline from parser to avoid blank line before closing fence
          const code = children.endsWith("\n")
            ? children.slice(0, -1)
            : children;
          const lang = meta?.language
            ? `${ANSI.DIM}${meta.language}${ANSI.DIM_OFF}\n`
            : "";
          return `${lang}${ANSI.DIM}───${ANSI.DIM_OFF}\n${ANSI.GREEN}${code}${ANSI.COLOR_OFF}\n${ANSI.DIM}───${ANSI.DIM_OFF}\n\n`;
        },
        link: (children, { href }) =>
          `${ANSI.UNDERLINE}${ANSI.CYAN}${children}${ANSI.COLOR_OFF}${ANSI.UNDERLINE_OFF} (${ANSI.DIM}${href}${ANSI.DIM_OFF})`,
        image: (children, { src }) =>
          `${ANSI.DIM}[image: ${children}]${ANSI.DIM_OFF} (${src})`,
        blockquote: (children) => {
          const lines = children.trimEnd().split("\n");
          return `${lines.map((l) => `${ANSI.DIM}│${ANSI.DIM_OFF} ${ANSI.ITALIC}${l}${ANSI.ITALIC_OFF}`).join("\n")}\n\n`;
        },
        hr: () => `${ANSI.DIM}${"─".repeat(HR_WIDTH)}${ANSI.DIM_OFF}\n\n`,
        list: (children) => `${children}\n`,
        listItem: (children, meta) => {
          if (meta?.checked === true)
            return `  ${ANSI.GREEN}✓${ANSI.COLOR_OFF} ${children.trimEnd()}\n`;
          if (meta?.checked === false)
            return `  ${ANSI.DIM}○${ANSI.DIM_OFF} ${children.trimEnd()}\n`;
          return `  ${ANSI.YELLOW}•${ANSI.COLOR_OFF} ${children.trimEnd()}\n`;
        },
        strikethrough: (children) =>
          `${ANSI.STRIKETHROUGH}${children}${ANSI.STRIKETHROUGH_OFF}`,
        table: (children) => `${children}\n`,
        thead: (children) => `${ANSI.BOLD}${children}${ANSI.BOLD_OFF}`,
        tr: (children) => `${children}\n`,
        th: (children) => `${ANSI.BOLD}${children}${ANSI.BOLD_OFF}\t`,
        td: (children) => `${children}\t`,
      },
      { tables: true, strikethrough: true, tasklists: true },
    );
  } catch {
    return renderMarkdownFallback(text);
  }
}

/**
 * Regex-based fallback markdown renderer for environments where Bun.markdown
 * is unavailable. Produces output matching the Bun.markdown renderer above.
 */
function renderMarkdownFallback(text: string): string {
  let result = text;

  // 1. Extract fenced code blocks into placeholders
  const codeBlocks: string[] = [];
  result = result.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_match, lang: string | undefined, code: string) => {
      const trimmed = code.endsWith("\n") ? code.slice(0, -1) : code;
      const langLine = lang ? `${ANSI.DIM}${lang}${ANSI.DIM_OFF}\n` : "";
      const rendered = `${langLine}${ANSI.DIM}───${ANSI.DIM_OFF}\n${ANSI.GREEN}${trimmed}${ANSI.COLOR_OFF}\n${ANSI.DIM}───${ANSI.DIM_OFF}\n\n`;
      const idx = codeBlocks.length;
      codeBlocks.push(rendered);
      return `\x00CODEBLOCK_${idx}\x00`;
    },
  );

  // 2. Extract inline code into placeholders
  const inlineCode: string[] = [];
  result = result.replace(/`([^`]+)`/g, (_match, code: string) => {
    const rendered = `${ANSI.DIM}${ANSI.CYAN}\`${code}\`${ANSI.COLOR_OFF}${ANSI.DIM_OFF}`;
    const idx = inlineCode.length;
    inlineCode.push(rendered);
    return `\x00INLINECODE_${idx}\x00`;
  });

  // 3. Run all other markdown replacements

  // Headings (# ... ######)
  result = result.replace(
    /^(#{1,6}) (.+)$/gm,
    (_match, hashes: string, content: string) => {
      return `${ANSI.BOLD}${ANSI.MAGENTA}${hashes} ${content}${ANSI.RESET}\n`;
    },
  );

  // Images ![alt](src) — must come before links
  result = result.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_match, alt: string, src: string) =>
      `${ANSI.DIM}[image: ${alt}]${ANSI.DIM_OFF} (${src})`,
  );

  // Links [text](href)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, txt: string, href: string) =>
      `${ANSI.UNDERLINE}${ANSI.CYAN}${txt}${ANSI.COLOR_OFF}${ANSI.UNDERLINE_OFF} (${ANSI.DIM}${href}${ANSI.DIM_OFF})`,
  );

  // Strikethrough ~~text~~
  result = result.replace(
    /~~(.+?)~~/g,
    (_match, content: string) =>
      `${ANSI.STRIKETHROUGH}${content}${ANSI.STRIKETHROUGH_OFF}`,
  );

  // Tables: simple | col | col | format
  result = result.replace(
    /^(\|.+\|)\n\|[\s\-:|]+\|\n((?:\|.+\|\n?)+)/gm,
    (_match, headerRow: string, bodyRows: string) => {
      const headers = headerRow
        .split("|")
        .filter((c) => c.trim())
        .map((c) => `${ANSI.BOLD}${c.trim()}${ANSI.BOLD_OFF}\t`)
        .join("");
      const rows = bodyRows
        .trim()
        .split("\n")
        .map((row) =>
          row
            .split("|")
            .filter((c) => c.trim())
            .map((c) => `${c.trim()}\t`)
            .join(""),
        )
        .join("\n");
      return `${ANSI.BOLD}${headers}${ANSI.BOLD_OFF}\n${rows}\n\n`;
    },
  );

  // Task list items - [x] and - [ ]
  result = result.replace(
    /^[-*] \[x\] (.+)$/gm,
    (_match, content: string) => `  ${ANSI.GREEN}✓${ANSI.COLOR_OFF} ${content}`,
  );
  result = result.replace(
    /^[-*] \[ \] (.+)$/gm,
    (_match, content: string) => `  ${ANSI.DIM}○${ANSI.DIM_OFF} ${content}`,
  );

  // Unordered list items (- or * but not task lists)
  result = result.replace(
    /^[-*] (?!\[[ x]\])(.+)$/gm,
    (_match, content: string) =>
      `  ${ANSI.YELLOW}•${ANSI.COLOR_OFF} ${content}`,
  );

  // Ordered list items (1. 2. etc.)
  result = result.replace(
    /^\d+\. (.+)$/gm,
    (_match, content: string) =>
      `  ${ANSI.YELLOW}•${ANSI.COLOR_OFF} ${content}`,
  );

  // Blockquotes
  result = result.replace(
    /^> (.+)$/gm,
    (_match, content: string) =>
      `${ANSI.DIM}│${ANSI.DIM_OFF} ${ANSI.ITALIC}${content}${ANSI.ITALIC_OFF}`,
  );

  // Horizontal rules
  result = result.replace(
    /^---$/gm,
    `${ANSI.DIM}${"─".repeat(HR_WIDTH)}${ANSI.DIM_OFF}\n`,
  );

  // Bold **text**
  result = result.replace(
    /\*\*(.+?)\*\*/g,
    (_match, content: string) => `${ANSI.BOLD}${content}${ANSI.BOLD_OFF}`,
  );

  // Italic *text*
  result = result.replace(
    /\*(.+?)\*/g,
    (_match, content: string) => `${ANSI.ITALIC}${content}${ANSI.ITALIC_OFF}`,
  );

  // Paragraphs: double newlines become paragraph breaks
  // Ensure trailing newlines for paragraph spacing
  result = result.replace(/\n\n+/g, "\n\n");

  // 4. Reinsert inline code
  for (let i = 0; i < inlineCode.length; i++) {
    result = result.replace(`\x00INLINECODE_${i}\x00`, inlineCode[i] as string);
  }

  // 5. Reinsert code blocks
  for (let i = 0; i < codeBlocks.length; i++) {
    result = result.replace(`\x00CODEBLOCK_${i}\x00`, codeBlocks[i] as string);
  }

  return result;
}

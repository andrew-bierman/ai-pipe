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
 * Uses Bun's built-in markdown parser with custom ANSI escape code renderers
 * for headings, bold, italic, code blocks, links, lists, blockquotes, tables,
 * strikethrough, and task lists.
 *
 * @param text - Raw markdown string to render.
 * @returns The markdown rendered with ANSI escape codes for terminal display.
 */
export function renderMarkdown(text: string): string {
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
        const code = children.endsWith("\n") ? children.slice(0, -1) : children;
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
}

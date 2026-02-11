/**
 * ANSI escape codes for terminal styling.
 * NOTE: Bun.color() converts named colors to hex/rgb but does not produce ANSI
 * escape sequences for bold/dim/italic/underline/strikethrough. Manual ANSI codes
 * are still the right approach here for full terminal formatting control.
 */
const ANSI = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  ITALIC: "\x1b[3m",
  UNDERLINE: "\x1b[4m",
  STRIKETHROUGH: "\x1b[9m",
  CYAN: "\x1b[36m",
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
      strong: (children) => `${ANSI.BOLD}${children}${ANSI.RESET}`,
      emphasis: (children) => `${ANSI.ITALIC}${children}${ANSI.RESET}`,
      codespan: (children) =>
        `${ANSI.DIM}${ANSI.CYAN}\`${children}\`${ANSI.RESET}`,
      code: (children, meta) => {
        const lang = meta?.language
          ? `${ANSI.DIM}${meta.language}${ANSI.RESET}\n`
          : "";
        return `${lang}${ANSI.DIM}───${ANSI.RESET}\n${ANSI.GREEN}${children}${ANSI.RESET}\n${ANSI.DIM}───${ANSI.RESET}\n\n`;
      },
      link: (children, { href }) =>
        `${ANSI.UNDERLINE}${ANSI.CYAN}${children}${ANSI.RESET} (${ANSI.DIM}${href}${ANSI.RESET})`,
      image: (children, { src }) =>
        `${ANSI.DIM}[image: ${children}]${ANSI.RESET} (${src})`,
      blockquote: (children) => {
        const lines = children.trimEnd().split("\n");
        return `${lines.map((l) => `${ANSI.DIM}│${ANSI.RESET} ${ANSI.ITALIC}${l}${ANSI.RESET}`).join("\n")}\n\n`;
      },
      hr: () => `${ANSI.DIM}${"─".repeat(HR_WIDTH)}${ANSI.RESET}\n\n`,
      list: (children) => `${children}\n`,
      listItem: (children, meta) => {
        if (meta?.checked === true)
          return `  ${ANSI.GREEN}✓${ANSI.RESET} ${children.trimEnd()}\n`;
        if (meta?.checked === false)
          return `  ${ANSI.DIM}○${ANSI.RESET} ${children.trimEnd()}\n`;
        return `  ${ANSI.YELLOW}•${ANSI.RESET} ${children.trimEnd()}\n`;
      },
      strikethrough: (children) =>
        `${ANSI.STRIKETHROUGH}${children}${ANSI.RESET}`,
      table: (children) => `${children}\n`,
      thead: (children) => `${ANSI.BOLD}${children}${ANSI.RESET}`,
      tr: (children) => `${children}\n`,
      th: (children) => `${ANSI.BOLD}${children}${ANSI.RESET}\t`,
      td: (children) => `${children}\t`,
    },
    { tables: true, strikethrough: true, tasklists: true },
  );
}

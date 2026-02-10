// ANSI escape codes
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";
const UNDERLINE = "\x1b[4m";
const STRIKETHROUGH = "\x1b[9m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";

export function renderMarkdown(text: string): string {
  return Bun.markdown.render(
    text,
    {
      heading: (children, { level }) => {
        const prefix = "#".repeat(level);
        return `${BOLD}${MAGENTA}${prefix} ${children}${RESET}\n\n`;
      },
      paragraph: (children) => `${children}\n\n`,
      strong: (children) => `${BOLD}${children}${RESET}`,
      emphasis: (children) => `${ITALIC}${children}${RESET}`,
      codespan: (children) => `${DIM}${CYAN}\`${children}\`${RESET}`,
      code: (children, meta) => {
        const lang = meta?.language ? `${DIM}${meta.language}${RESET}\n` : "";
        return `${lang}${DIM}───${RESET}\n${GREEN}${children}${RESET}\n${DIM}───${RESET}\n\n`;
      },
      link: (children, { href }) =>
        `${UNDERLINE}${CYAN}${children}${RESET} (${DIM}${href}${RESET})`,
      image: (children, { src }) =>
        `${DIM}[image: ${children}]${RESET} (${src})`,
      blockquote: (children) => {
        const lines = children.trimEnd().split("\n");
        return `${lines.map((l) => `${DIM}│${RESET} ${ITALIC}${l}${RESET}`).join("\n")}\n\n`;
      },
      hr: () => `${DIM}${"─".repeat(40)}${RESET}\n\n`,
      list: (children) => `${children}\n`,
      listItem: (children, meta) => {
        if (meta?.checked === true)
          return `  ${GREEN}✓${RESET} ${children.trimEnd()}\n`;
        if (meta?.checked === false)
          return `  ${DIM}○${RESET} ${children.trimEnd()}\n`;
        return `  ${YELLOW}•${RESET} ${children.trimEnd()}\n`;
      },
      strikethrough: (children) => `${STRIKETHROUGH}${children}${RESET}`,
      table: (children) => `${children}\n`,
      thead: (children) => `${BOLD}${children}${RESET}`,
      tr: (children) => `${children}\n`,
      th: (children) => `${BOLD}${children}${RESET}\t`,
      td: (children) => `${children}\t`,
    },
    { tables: true, strikethrough: true, tasklists: true },
  );
}

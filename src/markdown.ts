export function renderMarkdown(
  text: string,
  columns = process.stdout.columns || 80,
): string {
  return Bun.markdown.ansi(Bun.stripANSI(text), {
    colors: Boolean(process.stdout.isTTY && Bun.env.NO_COLOR === undefined),
    columns: Math.max(1, columns),
    hyperlinks: false,
    kittyGraphics: false,
  });
}

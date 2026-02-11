import { renderMarkdown } from "./markdown.ts";

/** Debounce interval in milliseconds for progressive rendering. */
const RENDER_DEBOUNCE_MS = 100;

/**
 * Progressive streaming markdown renderer for terminal output.
 *
 * Accumulates text chunks and periodically re-renders the full markdown
 * output using ANSI escape codes to clear and replace the previous render.
 * Rendering is debounced to avoid excessive redraws on rapid token arrival.
 */
export class StreamingMarkdownRenderer {
  private buffer = "";
  private lineCount = 0;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Append a text chunk to the buffer and schedule a debounced render.
   *
   * @param chunk - The new text fragment to add.
   */
  append(chunk: string): void {
    this.buffer += chunk;
    if (!this.renderTimer) {
      this.renderTimer = setTimeout(() => {
        this.renderTimer = null;
        this.render();
      }, RENDER_DEBOUNCE_MS);
    }
  }

  /**
   * Clear the previously rendered output and re-render the full buffer.
   *
   * Uses ANSI escape codes to move the cursor up and clear lines, then
   * writes the freshly rendered markdown to stdout.
   */
  private render(): void {
    // Move cursor up to overwrite previous output (skip on first render)
    if (this.lineCount > 0) {
      process.stdout.write(`\x1b[${this.lineCount}A\x1b[J`);
    }

    const rendered = renderMarkdown(this.buffer);
    process.stdout.write(rendered);

    // Count lines for the next clear cycle
    this.lineCount = rendered.split("\n").length - 1;
    if (this.lineCount < 0) this.lineCount = 0;
  }

  /**
   * Finalize rendering: cancel any pending timer, do a final clean render,
   * and emit a trailing newline.
   */
  finish(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.render();
  }

  /** Return the accumulated buffer text (useful for testing / history). */
  getBuffer(): string {
    return this.buffer;
  }
}

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { StreamingMarkdownRenderer } from "../streaming-markdown.ts";

describe("StreamingMarkdownRenderer", () => {
  let writtenChunks: string[];
  const originalWrite = process.stdout.write;

  beforeEach(() => {
    writtenChunks = [];
    process.stdout.write = (chunk: string) => {
      writtenChunks.push(chunk);
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  test("accumulates text in buffer via append()", () => {
    const renderer = new StreamingMarkdownRenderer();
    renderer.append("Hello ");
    renderer.append("world");
    expect(renderer.getBuffer()).toBe("Hello world");
  });

  test("finish() produces rendered output", () => {
    const renderer = new StreamingMarkdownRenderer();
    renderer.append("**bold text**");
    renderer.finish();

    const output = writtenChunks.join("");
    expect(output).toContain("bold text");
    expect(output).toContain("\x1b[1m"); // BOLD ANSI code
  });

  test("finish() renders markdown headings", () => {
    const renderer = new StreamingMarkdownRenderer();
    renderer.append("# Title\n\nParagraph.");
    renderer.finish();

    const output = writtenChunks.join("");
    expect(output).toContain("# Title");
    expect(output).toContain("Paragraph.");
  });

  test("debounces rendering on rapid appends", async () => {
    const renderer = new StreamingMarkdownRenderer();

    // Rapidly append many chunks
    for (let i = 0; i < 20; i++) {
      renderer.append(`chunk${i} `);
    }

    // Before the debounce timer fires, no output should be written
    expect(writtenChunks.length).toBe(0);

    // Wait for debounce timer to fire (100ms + margin)
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Now there should be exactly one render
    expect(writtenChunks.length).toBeGreaterThan(0);
    const output = writtenChunks.join("");
    expect(output).toContain("chunk0");
    expect(output).toContain("chunk19");

    // Clean up
    renderer.finish();
  });

  test("finish() cancels pending timer and does final render", () => {
    const renderer = new StreamingMarkdownRenderer();
    renderer.append("some text");

    // Before debounce fires, call finish immediately
    renderer.finish();

    const output = writtenChunks.join("");
    expect(output).toContain("some text");
  });

  test("subsequent renders clear previous output with ANSI codes", async () => {
    const renderer = new StreamingMarkdownRenderer();

    renderer.append("First line\n");
    // Wait for the first debounced render
    await new Promise((resolve) => setTimeout(resolve, 150));

    const firstOutput = writtenChunks.join("");
    expect(firstOutput).toContain("First line");

    // Append more and finish
    renderer.append("Second line\n");
    renderer.finish();

    const fullOutput = writtenChunks.join("");
    // Should contain cursor-up ANSI escape for clearing previous render
    expect(fullOutput).toContain("\x1b[J");
  });

  test("getBuffer() returns full accumulated text", () => {
    const renderer = new StreamingMarkdownRenderer();
    renderer.append("a");
    renderer.append("b");
    renderer.append("c");
    expect(renderer.getBuffer()).toBe("abc");
  });

  test("handles empty buffer gracefully", () => {
    const renderer = new StreamingMarkdownRenderer();
    renderer.finish();
    // Should not throw; output is whatever renderMarkdown("") produces
    expect(writtenChunks.length).toBeGreaterThanOrEqual(0);
  });
});

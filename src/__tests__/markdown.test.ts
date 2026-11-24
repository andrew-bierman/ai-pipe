import { expect, test } from "bun:test";
import { renderMarkdown } from "../markdown.ts";

test("renders Markdown headings, tables, and literal fenced code", () => {
  const result = renderMarkdown(
    "## Summary\n\n| Key | Value |\n| --- | --- |\n| Mode | local |\n\n```sh\nprintf '%s' '**literal**'\n```",
  );
  expect(result).toContain("Summary");
  expect(result).toContain("Value");
  expect(result).toContain("local");
  expect(result).toContain("printf '%s' '**literal**'");
});

test("preserves a fence that is incomplete at the end of the response", () => {
  expect(renderMarkdown("```sh\necho '*literal*'")).toContain(
    "echo '*literal*'",
  );
});

test("strips terminal control sequences from model Markdown", () => {
  const result = renderMarkdown("safe\x1b[2J text");
  expect(result).toContain("safe text");
  expect(result).not.toContain("\x1b[2J");
});

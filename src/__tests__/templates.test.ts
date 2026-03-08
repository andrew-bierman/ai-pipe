import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyTemplate, listTemplates, loadTemplate } from "../templates.ts";

const tmpDir = tmpdir();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function makeTmpDir(): string {
  const dir = join(tmpDir, `ai-tpl-${uid()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── loadTemplate ────────────────────────────────────────────────────────

describe("loadTemplate", () => {
  test("returns template content when file exists", async () => {
    const tplDir = join(tmpDir, `ai-tpl-load-${uid()}`);
    const templateName = `review-${uid()}`;
    const content =
      "Review the following code:\n\n{{input}}\n\nProvide feedback.";
    mkdirSync(join(tplDir, "templates"), { recursive: true });
    await Bun.write(join(tplDir, "templates", `${templateName}.md`), content);

    const result = await loadTemplate(templateName, tplDir);
    expect(result).toBe(content);

    rmSync(tplDir, { recursive: true });
  });

  test("returns null when template does not exist", async () => {
    const tplDir = makeTmpDir();
    const result = await loadTemplate("nonexistent-template-xyz", tplDir);
    expect(result).toBeNull();

    rmSync(tplDir, { recursive: true });
  });

  test("strips .md extension from template name", async () => {
    const tplDir = join(tmpDir, `ai-tpl-ext-${uid()}`);
    const templateName = "summarize";
    mkdirSync(join(tplDir, "templates"), { recursive: true });
    await Bun.write(
      join(tplDir, "templates", `${templateName}.md`),
      "Summarize: {{input}}",
    );

    // Pass templateName with .md extension - should still work
    const result = await loadTemplate(`${templateName}.md`, tplDir);
    expect(result).toBe("Summarize: {{input}}");

    rmSync(tplDir, { recursive: true });
  });

  test("prevents path traversal with ../", async () => {
    const tplDir = makeTmpDir();
    const result = await loadTemplate("../etc/passwd", tplDir);
    expect(result).toBeNull();

    rmSync(tplDir, { recursive: true });
  });

  test("prevents path traversal with absolute path", async () => {
    const tplDir = makeTmpDir();
    const result = await loadTemplate("/etc/passwd", tplDir);
    expect(result).toBeNull();

    rmSync(tplDir, { recursive: true });
  });

  test("returns null for empty template name", async () => {
    const tplDir = makeTmpDir();
    mkdirSync(join(tplDir, "templates"), { recursive: true });
    const result = await loadTemplate("", tplDir);
    expect(result).toBeNull();

    rmSync(tplDir, { recursive: true });
  });

  test("handles template with .MD extension (case insensitive strip)", async () => {
    const tplDir = join(tmpDir, `ai-tpl-case-${uid()}`);
    mkdirSync(join(tplDir, "templates"), { recursive: true });
    const templateName = "CaseTest";
    await Bun.write(
      join(tplDir, "templates", `${templateName}.md`),
      "Case test content",
    );
    // Pass with uppercase .MD extension
    const result = await loadTemplate(`${templateName}.MD`, tplDir);
    expect(result).toBe("Case test content");

    rmSync(tplDir, { recursive: true });
  });

  test("handles template file with unicode content", async () => {
    const tplDir = join(tmpDir, `ai-tpl-unicode-${uid()}`);
    mkdirSync(join(tplDir, "templates"), { recursive: true });
    const templateName = `unicode-${uid()}`;
    const content = "Translate this: {{input}} \u2603 \u00e9l\u00e8ve.";
    await Bun.write(join(tplDir, "templates", `${templateName}.md`), content);
    const result = await loadTemplate(templateName, tplDir);
    expect(result).toBe(content);

    rmSync(tplDir, { recursive: true });
  });
});

// ── listTemplates ───────────────────────────────────────────────────────

describe("listTemplates", () => {
  test("returns sorted template names", async () => {
    const tplDir = join(tmpDir, `ai-tpl-list-${uid()}`);
    const nameA = `aaa-template-${uid()}`;
    const nameZ = `zzz-template-${uid()}`;
    mkdirSync(join(tplDir, "templates"), { recursive: true });

    await Bun.write(join(tplDir, "templates", `${nameZ}.md`), "Z template");
    await Bun.write(join(tplDir, "templates", `${nameA}.md`), "A template");

    const result = await listTemplates(tplDir);
    const aIndex = result.indexOf(nameA);
    const zIndex = result.indexOf(nameZ);
    expect(aIndex).toBeLessThan(zIndex);

    rmSync(tplDir, { recursive: true });
  });

  test("returns empty array when templates directory does not exist", async () => {
    const tplDir = join(tmpDir, `ai-no-templates-${uid()}`);
    mkdirSync(tplDir, { recursive: true });

    const result = await listTemplates(tplDir);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);

    rmSync(tplDir, { recursive: true });
  });

  test("returns empty array for nonexistent config directory", async () => {
    const result = await listTemplates("/nonexistent/path/to/config");
    expect(result).toEqual([]);
  });

  test("lists only .md files and ignores other extensions", async () => {
    const tplDir = join(tmpDir, `ai-tpl-filter-${uid()}`);
    const name1 = `template1-${uid()}`;
    const name2 = `template2-${uid()}`;
    const nameTxt = `ignored-${uid()}`;
    mkdirSync(join(tplDir, "templates"), { recursive: true });

    await Bun.write(join(tplDir, "templates", `${name1}.md`), "Template 1");
    await Bun.write(join(tplDir, "templates", `${name2}.md`), "Template 2");
    await Bun.write(
      join(tplDir, "templates", `${nameTxt}.txt`),
      "This should be ignored",
    );

    const result = await listTemplates(tplDir);
    expect(result).toContain(name1);
    expect(result).toContain(name2);
    expect(result).not.toContain(nameTxt);

    rmSync(tplDir, { recursive: true });
  });

  test("returns unique template names (no duplicates)", async () => {
    const tplDir = join(tmpDir, `ai-tpl-unique-${uid()}`);
    mkdirSync(join(tplDir, "templates"), { recursive: true });

    const templateName = `unique-tpl-${uid()}`;
    await Bun.write(join(tplDir, "templates", `${templateName}.md`), "Content");

    const result = await listTemplates(tplDir);
    const count = result.filter((t) => t === templateName).length;
    expect(count).toBe(1);

    rmSync(tplDir, { recursive: true });
  });

  test("handles empty templates directory (exists but no files)", async () => {
    const tplDir = join(tmpDir, `ai-tpl-empty-${uid()}`);
    mkdirSync(join(tplDir, "templates"), { recursive: true });

    const result = await listTemplates(tplDir);
    expect(result).toEqual([]);

    rmSync(tplDir, { recursive: true });
  });

  test("uses default directory when none specified", async () => {
    const result = await listTemplates(undefined);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── applyTemplate ───────────────────────────────────────────────────────

describe("applyTemplate", () => {
  test("replaces {{input}} placeholder", () => {
    const template = "Review this code:\n\n{{input}}\n\nProvide feedback.";
    const result = applyTemplate(template, { input: "const x = 1;" });
    expect(result).toBe(
      "Review this code:\n\nconst x = 1;\n\nProvide feedback.",
    );
  });

  test("replaces multiple variables", () => {
    const template = "Hello {{name}}, your role is {{role}}.";
    const result = applyTemplate(template, {
      name: "Alice",
      role: "developer",
    });
    expect(result).toBe("Hello Alice, your role is developer.");
  });

  test("leaves unreplaced variables as-is", () => {
    const template = "Hello {{name}}, welcome to {{place}}.";
    const result = applyTemplate(template, { name: "Bob" });
    expect(result).toBe("Hello Bob, welcome to {{place}}.");
  });

  test("handles template with no variables", () => {
    const template = "This is a plain template with no placeholders.";
    const result = applyTemplate(template, { input: "unused" });
    expect(result).toBe("This is a plain template with no placeholders.");
  });

  test("replaces multiple occurrences of the same variable", () => {
    const template = "{{input}} and {{input}} again.";
    const result = applyTemplate(template, { input: "hello" });
    expect(result).toBe("hello and hello again.");
  });

  test("handles empty variables record", () => {
    const template = "Nothing to replace: {{input}}.";
    const result = applyTemplate(template, {});
    expect(result).toBe("Nothing to replace: {{input}}.");
  });

  test("handles empty template string", () => {
    const result = applyTemplate("", { input: "something" });
    expect(result).toBe("");
  });

  test("replaces {{input}} with multi-line content", () => {
    const template = "Code:\n{{input}}\nEnd.";
    const multiLine = "line 1\nline 2\nline 3";
    const result = applyTemplate(template, { input: multiLine });
    expect(result).toBe("Code:\nline 1\nline 2\nline 3\nEnd.");
  });
});

import { basename, join } from "node:path";

import { APP } from "./constants.ts";

const HOME_DIR = Bun.env.HOME ?? Bun.env.USERPROFILE ?? "";
const DEFAULT_CONFIG_DIR = join(HOME_DIR, APP.configDirName);
const TEMPLATES_DIR = "templates";

/**
 * Load a template's content from a `.md` file in the templates directory.
 *
 * Template files are stored as `~/.ai-pipe/templates/<name>.md`. The template
 * name is sanitized to prevent path traversal attacks. If the template name
 * includes a `.md` extension, it is stripped to avoid double-extension issues.
 *
 * @param templateName - The template name (e.g., "review" or "review.md").
 * @param configDir - Optional config directory. Defaults to `~/.ai-pipe/`.
 * @returns The template file contents, or `null` if the template does not exist.
 */
export async function loadTemplate(
  templateName: string,
  configDir?: string,
): Promise<string | null> {
  const dir = configDir ?? DEFAULT_CONFIG_DIR;
  // Sanitize templateName to prevent path traversal attacks
  const sanitizedName = basename(templateName);
  // Strip .md extension if present to avoid double extension
  const nameWithoutExt = sanitizedName.replace(/\.md$/i, "");
  const templatesPath = join(dir, TEMPLATES_DIR, nameWithoutExt);

  // Only load .md template files
  const mdFile = Bun.file(`${templatesPath}.md`);
  if (await mdFile.exists()) {
    return mdFile.text();
  }

  return null;
}

/**
 * List all available template names from the templates directory.
 *
 * Scans `~/.ai-pipe/templates/` for `.md` files and returns their names
 * (without extension), sorted alphabetically and deduplicated.
 *
 * @param configDir - Optional config directory. Defaults to `~/.ai-pipe/`.
 * @returns A sorted array of template names, or an empty array if none exist.
 */
export async function listTemplates(configDir?: string): Promise<string[]> {
  const dir = configDir ?? DEFAULT_CONFIG_DIR;
  const templatesPath = join(dir, TEMPLATES_DIR);

  try {
    // Only scan for .md template files
    const glob = new Bun.Glob("*.md");
    const templateFiles = await Array.fromAsync(glob.scan(templatesPath));
    const templates: string[] = templateFiles.map((path) =>
      basename(path, ".md"),
    );

    return [...new Set(templates)].sort();
  } catch {
    return [];
  }
}

/**
 * Apply template substitutions: replace `{{variable}}` placeholders with values.
 *
 * Supports `{{input}}` as a special variable that gets the user's prompt text.
 * Any `{{variable}}` placeholders without a matching key in `variables` are
 * left as-is in the output.
 *
 * @param template - The template string containing `{{variable}}` placeholders.
 * @param variables - A record of variable names to their replacement values.
 * @returns The template string with matched placeholders replaced.
 */
export function applyTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (key in variables) {
      return variables[key] as string;
    }
    return match;
  });
}

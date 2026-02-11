import { z } from "zod";
import type { JsonOutput } from "./index.ts";

/** Zod schema for validating output format values. */
export const OutputFormatSchema = z.enum(["json", "yaml", "csv", "text"]);

/** Supported output format types. */
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

/**
 * Format the response in the specified output format.
 *
 * Dispatches to the appropriate serializer based on the format string.
 * All serializers are implemented inline with no external dependencies.
 *
 * @param data - The structured JSON output from the LLM call.
 * @param format - The desired output format (json, yaml, csv, text).
 * @returns The formatted string representation of the data.
 */
export function formatOutput(data: JsonOutput, format: OutputFormat): string {
  switch (format) {
    case "json":
      return JSON.stringify(data, null, 2);
    case "yaml":
      return toYaml(data);
    case "csv":
      return toCsv(data);
    case "text":
      return data.text;
  }
}

/**
 * Convert to YAML format (simple implementation, no external dependency).
 *
 * Handles the known JsonOutput shape with special treatment for:
 * - Multi-line text fields using YAML block scalar (|) notation
 * - Nested usage object with proper indentation
 *
 * @param data - The structured JSON output to serialize.
 * @returns A YAML-formatted string.
 */
function toYaml(data: JsonOutput): string {
  const lines: string[] = [];

  // text field — use block scalar for multi-line, quoted for single-line
  if (data.text.includes("\n")) {
    lines.push("text: |");
    for (const line of data.text.split("\n")) {
      lines.push(`  ${line}`);
    }
  } else {
    lines.push(`text: ${yamlEscapeValue(data.text)}`);
  }

  // model field
  lines.push(`model: ${yamlEscapeValue(data.model)}`);

  // usage object (nested)
  lines.push("usage:");
  lines.push(`  inputTokens: ${data.usage.inputTokens ?? "null"}`);
  lines.push(`  outputTokens: ${data.usage.outputTokens ?? "null"}`);
  lines.push(`  totalTokens: ${data.usage.totalTokens ?? "null"}`);

  // finishReason field
  lines.push(`finishReason: ${yamlEscapeValue(data.finishReason)}`);

  return lines.join("\n");
}

/**
 * Escape a string value for safe YAML output.
 *
 * Wraps the value in double quotes if it contains characters that could
 * be misinterpreted by a YAML parser (colons, hashes, quotes, etc.)
 * or if it looks like a boolean/null literal.
 *
 * @param value - The string value to escape.
 * @returns The escaped YAML string, quoted if necessary.
 */
function yamlEscapeValue(value: string): string {
  // Quote if it contains special YAML characters or could be misinterpreted
  if (
    value === "" ||
    value.includes(":") ||
    value.includes("#") ||
    value.includes('"') ||
    value.includes("'") ||
    value.includes("\n") ||
    value.startsWith(" ") ||
    value.endsWith(" ") ||
    /^(true|false|null|yes|no)$/i.test(value)
  ) {
    // Double-quote and escape internal double quotes and backslashes
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}

/**
 * Convert to CSV format (headers + single row).
 *
 * Produces a two-line CSV with headers and one data row.
 * Headers: text,model,inputTokens,outputTokens,totalTokens,finishReason
 *
 * Values are properly escaped per RFC 4180:
 * - Fields containing commas, quotes, or newlines are wrapped in double quotes
 * - Double quotes within fields are escaped by doubling them
 *
 * @param data - The structured JSON output to serialize.
 * @returns A CSV-formatted string with headers and one data row.
 */
function toCsv(data: JsonOutput): string {
  const headers = [
    "text",
    "model",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "finishReason",
  ];

  const values = [
    csvEscapeField(data.text),
    csvEscapeField(data.model),
    csvEscapeField(String(data.usage.inputTokens ?? "")),
    csvEscapeField(String(data.usage.outputTokens ?? "")),
    csvEscapeField(String(data.usage.totalTokens ?? "")),
    csvEscapeField(data.finishReason),
  ];

  return `${headers.join(",")}\n${values.join(",")}`;
}

/**
 * Escape a field value for safe CSV output per RFC 4180.
 *
 * If the field contains commas, double quotes, or newlines, it is wrapped
 * in double quotes. Any internal double quotes are escaped by doubling them.
 *
 * @param field - The field value to escape.
 * @returns The escaped CSV field.
 */
function csvEscapeField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    const escaped = field.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  return field;
}

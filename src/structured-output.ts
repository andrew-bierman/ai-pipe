import { jsonSchema, Output } from "ai";
import Ajv from "ajv";

export async function loadStructuredOutput(path: string) {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`Schema file not found: ${path}`);

  let definition: unknown;
  try {
    definition = await file.json();
  } catch {
    throw new Error(`Schema file must contain valid JSON: ${path}`);
  }
  if (
    !definition ||
    typeof definition !== "object" ||
    !("type" in definition) ||
    definition.type !== "object" ||
    "$async" in definition
  ) {
    throw new Error(
      'Schema must be a synchronous JSON Schema with type "object".',
    );
  }

  const validate = new Ajv({ strict: false }).compile(definition);
  const schema = definition as Parameters<typeof jsonSchema>[0];
  return {
    output: Output.object({ schema: jsonSchema(schema) }),
    instruction: `Return only a JSON object matching this JSON Schema:\n${JSON.stringify(schema)}`,
    serialize(text: string): string {
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        throw new Error("Model output is not valid JSON.");
      }
      if (!validate(value)) {
        const issue = validate.errors?.[0];
        throw new Error(
          issue
            ? `Model output does not match the schema at ${issue.instancePath || "/"} (${issue.message}).`
            : "Model output does not match the schema.",
        );
      }
      return JSON.stringify(value);
    },
  };
}

export type StructuredOutput = Awaited<ReturnType<typeof loadStructuredOutput>>;

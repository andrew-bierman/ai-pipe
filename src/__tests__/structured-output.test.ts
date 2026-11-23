import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "index.ts");
const SCHEMA = {
  type: "object",
  properties: { count: { type: "integer" } },
  required: ["count"],
  additionalProperties: false,
};

async function runStructured(schema: object, answer: string) {
  const testHome = await mkdtemp(join(tmpdir(), "ai-pipe-structured-"));
  const requests: unknown[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (
        new URL(request.url).pathname !== "/v1/chat/completions" ||
        request.method !== "POST"
      ) {
        return new Response("Unknown endpoint", { status: 404 });
      }
      requests.push(await request.json());
      return Response.json({
        id: "chatcmpl-structured",
        created: 1,
        model: "test-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: answer },
            finish_reason: "stop",
          },
        ],
      });
    },
  });
  try {
    const schemaFile = join(testHome, "result.schema.json");
    await Bun.write(schemaFile, JSON.stringify(schema));
    const proc = Bun.spawn(
      [
        process.execPath,
        CLI,
        "--schema",
        schemaFile,
        "--no-update-check",
        "-m",
        "lmstudio/test-model",
        "Count the items",
      ],
      {
        cwd: testHome,
        env: {
          HOME: testHome,
          USERPROFILE: testHome,
          LM_STUDIO_BASE_URL: new URL("/v1", server.url).href,
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        signal: AbortSignal.timeout(4_000),
      },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, exitCode, requests };
  } finally {
    await server.stop(true);
    await rm(testHome, { recursive: true, force: true });
  }
}

test("--schema writes the validated object as compact JSON on stdout", async () => {
  const { stdout, exitCode, requests } = await runStructured(
    SCHEMA,
    '{\n  "count": 2\n}',
  );
  expect(exitCode).toBe(0);
  expect(stdout).toBe('{"count":2}\n');
  expect(requests).toHaveLength(1);
});

test("--schema rejects a response that violates the schema before writing stdout", async () => {
  const { stdout, stderr, exitCode, requests } = await runStructured(
    SCHEMA,
    '{"count": "two"}',
  );
  expect(exitCode).toBe(1);
  expect(stderr).toContain("/count");
  expect(stdout).toBe("");
  expect(requests).toHaveLength(1);
});

test("--schema rejects an array schema before contacting the endpoint", async () => {
  const { stdout, stderr, exitCode, requests } = await runStructured(
    { type: "array" },
    "[]",
  );
  expect(exitCode).toBe(1);
  expect(stderr).toContain('type "object"');
  expect(stdout).toBe("");
  expect(requests).toHaveLength(0);
});

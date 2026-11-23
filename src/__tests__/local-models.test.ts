import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "index.ts");
const MODEL = "community/example-model";
const COMPLETION = {
  id: "chatcmpl-local",
  created: 1,
  model: MODEL,
};

async function runCli(
  args: string[],
  env: Record<string, string> = {},
  {
    stdin = "",
    testHome,
    config,
  }: { stdin?: string; testHome?: string; config?: object } = {},
) {
  const configDir =
    testHome ?? (await mkdtemp(join(tmpdir(), "ai-pipe-local-")));
  try {
    if (config) {
      await Bun.write(join(configDir, "config.json"), JSON.stringify(config));
    }
    const proc = Bun.spawn(
      [
        process.execPath,
        CLI,
        "--config",
        configDir,
        "--no-update-check",
        ...args,
      ],
      {
        cwd: configDir,
        env: {
          HOME: configDir,
          USERPROFILE: configDir,
          OPENAI_API_KEY: "cloud-key-must-stay-private",
          ...env,
        },
        stdin: new Blob([stdin]),
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
    return { stdout, stderr, exitCode };
  } finally {
    if (testHome === undefined) {
      await rm(configDir, { recursive: true, force: true });
    }
  }
}

function serveModel(path: string, respond: () => Response) {
  const requests: { authorization: string | null; body: unknown }[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname !== path || request.method !== "POST") {
        return new Response("Unknown endpoint", { status: 404 });
      }
      requests.push({
        authorization: request.headers.get("authorization"),
        body: await request.json(),
      });
      return respond();
    },
  });
  return { server, requests };
}

function chatCompletion(content = "A local answer") {
  return Response.json({
    ...COMPLETION,
    object: "chat.completion",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
  });
}

test("LM Studio streams an answer for piped input without sending the OpenAI key", async () => {
  const { server, requests } = serveModel("/v1/chat/completions", () => {
    const chunks = [
      { delta: { role: "assistant", content: "Local " }, finish_reason: null },
      { delta: { content: "stream" }, finish_reason: null },
      { delta: {}, finish_reason: "stop" },
    ].map((choice) => ({
      ...COMPLETION,
      object: "chat.completion.chunk",
      choices: [{ index: 0, ...choice }],
    }));
    return new Response(
      `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  try {
    const result = await runCli(
      ["-m", `lmstudio/${MODEL}`, "Summarize this"],
      { LM_STUDIO_BASE_URL: new URL("/v1/", server.url).href },
      { stdin: "Piped source text" },
    );
    expect(result).toEqual({
      stdout: "Local stream\n",
      stderr: "",
      exitCode: 0,
    });
    expect(requests).toEqual([
      {
        authorization: null,
        body: expect.objectContaining({
          model: MODEL,
          stream: true,
          messages: [
            expect.objectContaining({
              role: "user",
              content: expect.stringContaining("Piped source text"),
            }),
          ],
        }),
      },
    ]);
  } finally {
    await server.stop(true);
  }
});

test("a custom local endpoint returns JSON using its own key", async () => {
  const { server, requests } = serveModel(
    "/inference/v1/chat/completions",
    chatCompletion,
  );
  try {
    const result = await runCli(["-m", `local/${MODEL}`, "--json", "Hello"], {
      AI_PIPE_LOCAL_BASE_URL: new URL("/inference/v1", server.url).href,
      AI_PIPE_LOCAL_API_KEY: "local-key",
      LM_STUDIO_API_KEY: "other-local-key",
    });
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      model: `local/${MODEL}`,
      text: "A local answer",
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 },
    });
    expect(requests).toEqual([
      {
        authorization: "Bearer local-key",
        body: expect.objectContaining({ model: MODEL }),
      },
    ]);
    const body = requests[0]?.body as { stream?: boolean };
    expect(body.stream).toBeUndefined();
  } finally {
    await server.stop(true);
  }
});

test("cached local responses stay with their endpoint and use the configured key", async () => {
  const testHome = await mkdtemp(join(tmpdir(), "ai-pipe-cache-"));
  const first = serveModel("/v1/chat/completions", () =>
    chatCompletion("First endpoint"),
  );
  const second = serveModel("/v1/chat/completions", () =>
    chatCompletion("Second endpoint"),
  );
  try {
    await Bun.write(
      join(testHome, "apiKeys.json"),
      JSON.stringify({ lmstudio: "configured-studio-key" }),
    );
    const args = ["-m", `lmstudio/${MODEL}`, "--no-stream", "Same prompt"];
    const firstEnv = {
      LM_STUDIO_BASE_URL: new URL("/v1", first.server.url).href,
    };
    const secondEnv = {
      LM_STUDIO_BASE_URL: new URL("/v1", second.server.url).href,
    };

    expect(await runCli(args, firstEnv, { testHome })).toEqual({
      stdout: "First endpoint\n",
      stderr: "",
      exitCode: 0,
    });
    expect(await runCli(args, secondEnv, { testHome })).toEqual({
      stdout: "Second endpoint\n",
      stderr: "",
      exitCode: 0,
    });
    expect(await runCli(args, firstEnv, { testHome })).toEqual({
      stdout: "First endpoint\n",
      stderr: "",
      exitCode: 0,
    });
    for (const { requests } of [first, second]) {
      expect(requests).toHaveLength(1);
      expect(requests[0]?.authorization).toBe("Bearer configured-studio-key");
    }
  } finally {
    await first.server.stop(true);
    await second.server.stop(true);
    await rm(testHome, { recursive: true, force: true });
  }
}, 15_000);

test("Ollama uses its native chat API through OLLAMA_HOST", async () => {
  const { server, requests } = serveModel("/api/chat", () =>
    Response.json({
      model: "test-model",
      created_at: "2026-01-01T00:00:00Z",
      message: { role: "assistant", content: "Hello from Ollama" },
      done: true,
      done_reason: "stop",
      prompt_eval_count: 2,
      eval_count: 3,
    }),
  );
  try {
    const result = await runCli(
      ["-m", "ollama/test-model", "--no-stream", "Hello"],
      {
        OLLAMA_HOST: server.url.origin,
      },
    );
    expect(result).toEqual({
      stdout: "Hello from Ollama\n",
      stderr: "",
      exitCode: 0,
    });
    expect(requests).toEqual([
      {
        authorization: null,
        body: expect.objectContaining({ model: "test-model", stream: false }),
      },
    ]);
  } finally {
    await server.stop(true);
  }
});

test("local prompts need an explicit endpoint", async () => {
  const { stdout, stderr, exitCode } = await runCli([
    "-m",
    `local/${MODEL}`,
    "Hello",
  ]);
  expect(stdout).toBe("");
  expect(stderr).toContain("AI_PIPE_LOCAL_BASE_URL");
  expect(exitCode).toBe(1);
});

test("a local server error exits nonzero without writing to stdout", async () => {
  const { server, requests } = serveModel("/v1/chat/completions", () =>
    Response.json(
      { error: { message: "The requested model is not loaded" } },
      { status: 404 },
    ),
  );
  try {
    const { stdout, stderr, exitCode } = await runCli(
      ["-m", `lmstudio/${MODEL}`, "--no-stream", "Hello"],
      {
        LM_STUDIO_BASE_URL: new URL("/v1", server.url).href,
        LM_STUDIO_API_KEY: "studio-key",
        AI_PIPE_LOCAL_API_KEY: "other-local-key",
      },
    );
    expect(stdout).toBe("");
    expect(stderr).toContain("The requested model is not loaded");
    expect(exitCode).toBe(1);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.authorization).toBe("Bearer studio-key");
  } finally {
    await server.stop(true);
  }
});

test("configured providers are listed and can be compared by alias and model ID", async () => {
  const edge = serveModel("/api/v1/chat/completions", () =>
    chatCompletion("Edge answer"),
  );
  const desk = serveModel("/v1/chat/completions", () =>
    chatCompletion("Desk answer"),
  );
  try {
    const config = {
      customProviders: {
        edge: {
          baseURL: new URL("/api/v1", edge.server.url).href,
          apiKeyEnv: "EDGE_TOKEN",
        },
        desk: { baseURL: new URL("/v1", desk.server.url).href },
      },
      aliases: { fast: `edge/${MODEL}` },
      model: "fast",
    };
    const listed = await runCli(["--providers"], {}, { config });
    expect(listed.exitCode).toBe(0);
    expect(listed.stdout).toMatch(/\bedge\b/);
    expect(listed.stdout).toMatch(/\bdesk\b/);

    const result = await runCli(
      ["--diff", `fast,desk/${MODEL}`, "--json", "Compare these models"],
      { EDGE_TOKEN: "edge-only-token" },
      { config },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject([
      { model: `edge/${MODEL}`, text: "Edge answer" },
      { model: `desk/${MODEL}`, text: "Desk answer" },
    ]);
    const chatBody = expect.objectContaining({ model: MODEL });
    expect(edge.requests).toEqual([
      { authorization: "Bearer edge-only-token", body: chatBody },
    ]);
    expect(desk.requests).toEqual([{ authorization: null, body: chatBody }]);

    const usingDefault = await runCli(
      ["--no-stream", "Use the configured default"],
      { EDGE_TOKEN: "edge-only-token" },
      { config },
    );
    expect(usingDefault).toEqual({
      stdout: "Edge answer\n",
      stderr: "",
      exitCode: 0,
    });
  } finally {
    await edge.server.stop(true);
    await desk.server.stop(true);
  }
}, 10_000);

test("a configured provider reports a missing key before contacting the endpoint", async () => {
  const { server, requests } = serveModel(
    "/v1/chat/completions",
    chatCompletion,
  );
  try {
    const { stdout, stderr, exitCode } = await runCli(
      ["-m", `edge/${MODEL}`, "--no-stream", "Hello"],
      {},
      {
        config: {
          customProviders: {
            edge: {
              baseURL: new URL("/v1", server.url).href,
              apiKeyEnv: "EDGE_TOKEN",
            },
          },
        },
      },
    );
    expect(stdout).toBe("");
    expect(stderr).toContain("EDGE_TOKEN");
    expect(exitCode).toBe(1);
    expect(requests).toHaveLength(0);
  } finally {
    await server.stop(true);
  }
});

test("a custom provider cannot replace a built-in provider name", async () => {
  const { stdout, stderr, exitCode } = await runCli(
    ["--providers"],
    {},
    {
      config: {
        customProviders: { openai: { baseURL: "http://localhost/v1" } },
      },
    },
  );
  expect(stdout).toBe("");
  expect(stderr).toContain("customProviders");
  expect(exitCode).toBe(1);
});

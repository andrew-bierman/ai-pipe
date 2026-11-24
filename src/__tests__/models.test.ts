import { expect, test } from "bun:test";
import { detectLocalModels, listModels } from "../models.ts";

test("discovers native Ollama and compatible models with per-provider settings", async () => {
  const ollamaHost = process.env.OLLAMA_HOST;
  const localBaseURL = process.env.AI_PIPE_LOCAL_BASE_URL;
  const lmStudioBaseURL = process.env.LM_STUDIO_BASE_URL;
  const lmStudioApiKey = process.env.LM_STUDIO_API_KEY;
  const requested: Array<[string, string | null]> = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      requested.push([path, request.headers.get("authorization")]);
      if (path === "/api/tags") {
        return Response.json({ models: [{ name: "gemma:local" }] });
      }
      if (path === "/v1/models") {
        return Response.json({
          data: [
            { id: "owner/model" },
            { id: "another" },
            { id: "owner/model" },
          ],
        });
      }
      return new Response(null, { status: 404 });
    },
  });

  try {
    delete process.env.OLLAMA_HOST;
    delete process.env.AI_PIPE_LOCAL_BASE_URL;
    delete process.env.LM_STUDIO_API_KEY;
    process.env.LM_STUDIO_BASE_URL = new URL("v1/", server.url).href;
    const config = {
      apiKeys: { ollama: server.url.host, lmstudio: "local-token" },
      customProviders: {
        "lab-server": { baseURL: new URL("v1", server.url).href },
      },
    };
    expect(await listModels("ollama", config)).toEqual(["ollama/gemma:local"]);
    expect(await listModels("lmstudio", config)).toEqual([
      "lmstudio/another",
      "lmstudio/owner/model",
    ]);
    expect(await listModels("lab-server", config)).toEqual([
      "lab-server/another",
      "lab-server/owner/model",
    ]);
    expect(requested).toEqual([
      ["/api/tags", null],
      ["/v1/models", "Bearer local-token"],
      ["/v1/models", null],
    ]);
    expect(
      await detectLocalModels({
        ...config,
        customProviders: {
          ...config.customProviders,
          unreachable: { baseURL: new URL("missing", server.url).href },
        },
      }),
    ).toEqual([
      "lab-server/another",
      "lab-server/owner/model",
      "lmstudio/another",
      "lmstudio/owner/model",
      "ollama/gemma:local",
    ]);
  } finally {
    if (localBaseURL === undefined) delete process.env.AI_PIPE_LOCAL_BASE_URL;
    else process.env.AI_PIPE_LOCAL_BASE_URL = localBaseURL;
    if (ollamaHost === undefined) delete process.env.OLLAMA_HOST;
    else process.env.OLLAMA_HOST = ollamaHost;
    if (lmStudioBaseURL === undefined) delete process.env.LM_STUDIO_BASE_URL;
    else process.env.LM_STUDIO_BASE_URL = lmStudioBaseURL;
    if (lmStudioApiKey === undefined) delete process.env.LM_STUDIO_API_KEY;
    else process.env.LM_STUDIO_API_KEY = lmStudioApiKey;
    await server.stop(true);
  }
});

test("OpenAI discovery uses the live endpoint and configured credentials", async () => {
  const { OPENAI_BASE_URL, OPENAI_API_KEY } = process.env;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      if (
        new URL(request.url).pathname !== "/v1/models" ||
        request.headers.get("authorization") !== "Bearer catalog-test-key"
      )
        return new Response(null, { status: 401 });
      return Response.json({ data: [{ id: "new-model" }] });
    },
  });
  try {
    process.env.OPENAI_BASE_URL = new URL("v1/", server.url).href;
    delete process.env.OPENAI_API_KEY;
    expect(
      await listModels("openai", { apiKeys: { openai: "catalog-test-key" } }),
    ).toEqual(["openai/new-model"]);
  } finally {
    if (OPENAI_BASE_URL === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = OPENAI_BASE_URL;
    if (OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = OPENAI_API_KEY;
    await server.stop(true);
  }
});

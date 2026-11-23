import { expect, test } from "bun:test";
import { listModels } from "../models.ts";

test("discovers native Ollama and compatible models with per-provider settings", async () => {
  const ollamaHost = process.env.OLLAMA_HOST;
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
  } finally {
    if (ollamaHost === undefined) delete process.env.OLLAMA_HOST;
    else process.env.OLLAMA_HOST = ollamaHost;
    if (lmStudioBaseURL === undefined) delete process.env.LM_STUDIO_BASE_URL;
    else process.env.LM_STUDIO_BASE_URL = lmStudioBaseURL;
    if (lmStudioApiKey === undefined) delete process.env.LM_STUDIO_API_KEY;
    else process.env.LM_STUDIO_API_KEY = lmStudioApiKey;
    await server.stop(true);
  }
});

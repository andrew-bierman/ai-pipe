import { existsSync } from "node:fs";
import {
  type LanguageModelV3,
  type LanguageModelV3CallOptions,
  type LanguageModelV3GenerateResult,
  type LanguageModelV3StreamPart,
  LoadSettingError,
  NoSuchModelError,
  type ProviderV3,
  UnsupportedFunctionalityError,
} from "@ai-sdk/provider";

const FM_PATH = "/usr/bin/fm";
export const APPLE_MODEL_ID = "on-device";

export function hasAppleFm(): boolean {
  return process.platform === "darwin" && existsSync(FM_PATH);
}

async function runFm(
  args: string[],
  stdin: string | undefined,
  signal: AbortSignal | undefined,
): Promise<string> {
  signal?.throwIfAborted();
  const child = Bun.spawn([FM_PATH, ...args], {
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
    signal,
  });
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  signal?.throwIfAborted();
  if (code === 69) {
    throw new Error(
      "Apple fm is unavailable or its license requires review. Run /usr/bin/fm license --status on the Mac.",
    );
  }
  if (code !== 0) {
    const detail = error.trim() || `exit status ${code}`;
    throw new Error(`Apple fm failed: ${detail}`);
  }
  return output;
}

function unsupported(functionality: string): never {
  throw new UnsupportedFunctionalityError({
    functionality,
    message: `Apple fm does not support ${functionality} through ai-pipe.`,
  });
}

export function appleResponseRequest(options: LanguageModelV3CallOptions): {
  args: string[];
  input: string;
} {
  if (options.tools?.length) unsupported("AI SDK tools");
  if (options.responseFormat?.type === "json") unsupported("JSON schemas");
  if (options.maxOutputTokens !== undefined) unsupported("max output tokens");

  // An explicit model overrides any saved default in the user's fm config.
  const args = ["respond", "--model", "system", "--no-stream"];
  if (options.temperature === 0) args.push("--greedy");
  const instructions: string[] = [];
  const transcript: Array<{ role: string; text: string }> = [];
  for (const message of options.prompt) {
    if (message.role === "system") {
      instructions.push(message.content);
      continue;
    }
    if (message.role === "tool") unsupported("tool messages");
    const text = message.content
      .map((part) =>
        part.type === "text" ? part.text : unsupported("non-text input"),
      )
      .join("\n");
    transcript.push({ role: message.role, text });
  }
  if (instructions.length > 0)
    args.push("--instructions", instructions.join("\n\n"));
  const input =
    transcript.length === 1 && transcript[0]?.role === "user"
      ? transcript[0].text
      : transcript.map(({ role, text }) => `${role}: ${text}`).join("\n\n");
  return { args, input };
}

export function createAppleModel(modelId: string): LanguageModelV3 {
  if (modelId !== APPLE_MODEL_ID) {
    throw new NoSuchModelError({
      modelId,
      modelType: "languageModel",
      message: "Apple supports only apple/on-device.",
    });
  }
  if (!hasAppleFm()) {
    throw new LoadSettingError({
      message:
        "apple/on-device requires macOS 27 and the built-in /usr/bin/fm.",
    });
  }

  async function doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const { args, input } = appleResponseRequest(options);
    // Confirm the license gate without exposing prompt text to interactive input.
    await runFm(["license", "--status"], undefined, options.abortSignal);
    const text = await runFm(args, input, options.abortSignal);
    return {
      content: [{ type: "text", text: text.replace(/\r?\n$/, "") }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: {
          total: undefined,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: undefined,
          text: undefined,
          reasoning: undefined,
        },
      },
      warnings:
        options.temperature !== undefined && options.temperature !== 0
          ? [{ type: "unsupported", feature: "nonzero temperature" }]
          : [],
    };
  }

  return {
    specificationVersion: "v3",
    provider: "apple.fm",
    modelId,
    supportedUrls: {},
    doGenerate,
    async doStream(options) {
      const result = await doGenerate(options);
      return {
        stream: new ReadableStream<LanguageModelV3StreamPart>({
          start(controller) {
            controller.enqueue({
              type: "stream-start",
              warnings: result.warnings,
            });
            controller.enqueue({ type: "text-start", id: "response" });
            for (const part of result.content) {
              if (part.type === "text") {
                controller.enqueue({
                  type: "text-delta",
                  id: "response",
                  delta: part.text,
                });
              }
            }
            controller.enqueue({ type: "text-end", id: "response" });
            controller.enqueue({
              type: "finish",
              finishReason: result.finishReason,
              usage: result.usage,
            });
            controller.close();
          },
        }),
      };
    },
  };
}

export const apple: ProviderV3 = {
  specificationVersion: "v3",
  languageModel: createAppleModel,
  embeddingModel: (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: "embeddingModel" });
  },
  imageModel: (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: "imageModel" });
  },
};

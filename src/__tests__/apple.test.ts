import { expect, test } from "bun:test";
import {
  appleResponseRequest,
  createAppleModel,
  hasAppleFm,
} from "../apple.ts";
import { listModels } from "../models.ts";
import { resolveModel } from "../provider.ts";

test("pins Apple's on-device system model and keeps user text on stdin", () => {
  expect(
    appleResponseRequest({
      prompt: [
        { role: "system", content: "Keep replies short." },
        { role: "user", content: [{ type: "text", text: "--model pcc" }] },
      ],
    }),
  ).toEqual({
    args: [
      "respond",
      "--model",
      "system",
      "--no-stream",
      "--instructions",
      "Keep replies short.",
    ],
    input: "--model pcc",
  });
});

test("preserves prior chat turns as ordered text", () => {
  const { input, args } = appleResponseRequest({
    temperature: 0,
    prompt: [
      { role: "user", content: [{ type: "text", text: "Say a color." }] },
      { role: "assistant", content: [{ type: "text", text: "Red." }] },
      { role: "user", content: [{ type: "text", text: "Say another." }] },
    ],
  });
  expect(args).toContain("--greedy");
  expect(input).toBe(
    "user: Say a color.\n\nassistant: Red.\n\nuser: Say another.",
  );
});

test("rejects unsupported requests before running fm", () => {
  expect(() => createAppleModel("pcc")).toThrow(
    "supports only apple/on-device",
  );
  expect(() =>
    appleResponseRequest({ prompt: [], responseFormat: { type: "json" } }),
  ).toThrow("does not support JSON schemas");
  expect(() =>
    appleResponseRequest({ prompt: [], maxOutputTokens: 10 }),
  ).toThrow("does not support max output tokens");
});

test("Apple discovery and model resolution share the built-in binary requirement", async () => {
  if (hasAppleFm()) {
    expect(await listModels("apple", {})).toEqual(["apple/on-device"]);
    expect(resolveModel("apple/on-device").modelId).toBe("on-device");
  } else {
    await expect(listModels("apple", {})).rejects.toThrow("requires macOS 27");
    expect(() => resolveModel("apple/on-device")).toThrow("requires macOS 27");
  }
});

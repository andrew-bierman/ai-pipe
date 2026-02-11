import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadToolsConfig, ToolsConfigSchema } from "../tools.ts";

const tmpDir = tmpdir();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("ToolsConfigSchema", () => {
  test("accepts valid tools config", () => {
    const config = {
      tools: [
        {
          name: "getWeather",
          description: "Get weather for a location",
          parameters: {
            type: "object",
            properties: { location: { type: "string" } },
            required: ["location"],
          },
        },
      ],
    };
    const result = ToolsConfigSchema.parse(config);
    expect(result.tools).toHaveLength(1);
    expect(result.tools?.[0]?.name).toBe("getWeather");
  });

  test("accepts empty tools array", () => {
    const config = { tools: [] };
    const result = ToolsConfigSchema.parse(config);
    expect(result.tools).toEqual([]);
  });

  test("accepts config without tools", () => {
    const result = ToolsConfigSchema.parse({});
    expect(result.tools).toBeUndefined();
  });
});

describe("loadToolsConfig", () => {
  test("returns empty array when no config path", async () => {
    const result = await loadToolsConfig(undefined);
    expect(result).toEqual([]);
  });

  test("returns empty array when file doesn't exist", async () => {
    const result = await loadToolsConfig("/nonexistent/path/tools.json");
    expect(result).toEqual([]);
  });

  test("loads tools from valid JSON config", async () => {
    const configPath = join(tmpDir, `ai-tools-${uid()}.json`);
    const config = {
      tools: [
        {
          name: "getWeather",
          parameters: {
            type: "object",
            properties: { location: { type: "string" } },
          },
        },
      ],
    };
    await Bun.write(configPath, JSON.stringify(config));

    const result = await loadToolsConfig(configPath);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("getWeather");

    rmSync(configPath);
  });

  test("returns empty array for invalid JSON", async () => {
    const configPath = join(tmpDir, `ai-tools-invalid-${uid()}.json`);
    await Bun.write(configPath, "not valid json");

    const result = await loadToolsConfig(configPath);
    expect(result).toEqual([]);

    rmSync(configPath);
  });
});

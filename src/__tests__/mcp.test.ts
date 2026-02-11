import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadMCPConfig,
  MCPConfigSchema,
  MCPManager,
  ServerConfigSchema,
  StdioServerConfigSchema,
  URLServerConfigSchema,
} from "../mcp.ts";

const tmpDir = tmpdir();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("MCPConfigSchema", () => {
  test("accepts valid stdio server config", () => {
    const config = {
      servers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        },
      },
    };
    const result = MCPConfigSchema.parse(config);
    expect(result.servers.filesystem).toBeDefined();
    expect((result.servers.filesystem as { command: string }).command).toBe(
      "npx",
    );
  });

  test("accepts valid URL server config", () => {
    const config = {
      servers: {
        web: {
          url: "http://localhost:3001/mcp",
        },
      },
    };
    const result = MCPConfigSchema.parse(config);
    expect(result.servers.web).toBeDefined();
    expect((result.servers.web as { url: string }).url).toBe(
      "http://localhost:3001/mcp",
    );
  });

  test("accepts config with multiple servers", () => {
    const config = {
      servers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        },
        web: {
          url: "http://localhost:3001/mcp",
        },
      },
    };
    const result = MCPConfigSchema.parse(config);
    expect(Object.keys(result.servers)).toHaveLength(2);
  });

  test("accepts config with empty servers", () => {
    const config = { servers: {} };
    const result = MCPConfigSchema.parse(config);
    expect(Object.keys(result.servers)).toHaveLength(0);
  });

  test("rejects config without servers key", () => {
    expect(() => MCPConfigSchema.parse({})).toThrow();
  });

  test("rejects invalid URL in URL server config", () => {
    const config = {
      servers: {
        web: {
          url: "not-a-url",
        },
      },
    };
    expect(() => MCPConfigSchema.parse(config)).toThrow();
  });

  test("accepts stdio config with optional env", () => {
    const config = {
      servers: {
        myserver: {
          command: "node",
          args: ["server.js"],
          env: { NODE_ENV: "production" },
        },
      },
    };
    const result = MCPConfigSchema.parse(config);
    expect(
      (result.servers.myserver as { env: Record<string, string> }).env.NODE_ENV,
    ).toBe("production");
  });
});

describe("StdioServerConfigSchema", () => {
  test("accepts minimal stdio config", () => {
    const result = StdioServerConfigSchema.parse({ command: "node" });
    expect(result.command).toBe("node");
    expect(result.args).toBeUndefined();
  });

  test("accepts stdio config with args", () => {
    const result = StdioServerConfigSchema.parse({
      command: "npx",
      args: ["-y", "some-package"],
    });
    expect(result.args).toEqual(["-y", "some-package"]);
  });

  test("rejects config without command", () => {
    expect(() => StdioServerConfigSchema.parse({})).toThrow();
  });
});

describe("URLServerConfigSchema", () => {
  test("accepts valid URL config", () => {
    const result = URLServerConfigSchema.parse({
      url: "https://example.com/mcp",
    });
    expect(result.url).toBe("https://example.com/mcp");
  });

  test("rejects invalid URL", () => {
    expect(() => URLServerConfigSchema.parse({ url: "not-valid" })).toThrow();
  });

  test("rejects missing URL", () => {
    expect(() => URLServerConfigSchema.parse({})).toThrow();
  });
});

describe("ServerConfigSchema", () => {
  test("accepts stdio config", () => {
    const result = ServerConfigSchema.parse({ command: "node", args: [] });
    expect("command" in result).toBe(true);
  });

  test("accepts URL config", () => {
    const result = ServerConfigSchema.parse({
      url: "http://localhost:3000/mcp",
    });
    expect("url" in result).toBe(true);
  });
});

describe("loadMCPConfig", () => {
  test("throws when file does not exist", async () => {
    await expect(loadMCPConfig("/nonexistent/path/mcp.json")).rejects.toThrow(
      "MCP config file not found",
    );
  });

  test("loads valid config from file", async () => {
    const configPath = join(tmpDir, `ai-mcp-${uid()}.json`);
    const config = {
      servers: {
        test: {
          command: "echo",
          args: ["hello"],
        },
      },
    };
    await Bun.write(configPath, JSON.stringify(config));

    const result = await loadMCPConfig(configPath);
    expect(result.servers.test).toBeDefined();
    expect((result.servers.test as { command: string }).command).toBe("echo");

    rmSync(configPath);
  });

  test("throws on invalid JSON", async () => {
    const configPath = join(tmpDir, `ai-mcp-invalid-${uid()}.json`);
    await Bun.write(configPath, "not valid json");

    await expect(loadMCPConfig(configPath)).rejects.toThrow();

    rmSync(configPath);
  });

  test("throws on invalid config structure", async () => {
    const configPath = join(tmpDir, `ai-mcp-bad-${uid()}.json`);
    await Bun.write(configPath, JSON.stringify({ notServers: {} }));

    await expect(loadMCPConfig(configPath)).rejects.toThrow();

    rmSync(configPath);
  });
});

describe("MCPManager", () => {
  test("starts with zero servers", () => {
    const manager = new MCPManager();
    expect(manager.serverCount).toBe(0);
  });

  test("getTools returns empty record when no servers connected", () => {
    const manager = new MCPManager();
    const tools = manager.getTools();
    expect(Object.keys(tools)).toHaveLength(0);
  });

  test("getToolSummary returns empty array when no servers connected", () => {
    const manager = new MCPManager();
    const summary = manager.getToolSummary();
    expect(summary).toEqual([]);
  });

  test("close succeeds with no servers", async () => {
    const manager = new MCPManager();
    await manager.close();
    expect(manager.serverCount).toBe(0);
  });

  test("connect warns on failed server connection", async () => {
    const manager = new MCPManager();
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => warnings.push(msg);

    try {
      await manager.connect({
        servers: {
          broken: {
            command: "nonexistent-command-that-does-not-exist",
            args: [],
          },
        },
      });

      // The manager should have warned about the failure
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("Failed to connect to MCP server");
      expect(manager.serverCount).toBe(0);
    } finally {
      console.warn = originalWarn;
      await manager.close();
    }
  });
});

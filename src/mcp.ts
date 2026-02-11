import { Client } from "@modelcontextprotocol/sdk/client";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { jsonSchema, type Tool } from "ai";
import { z } from "zod";

/** Schema for a single stdio-based MCP server configuration. */
export const StdioServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

/** Schema for a single URL-based (SSE) MCP server configuration. */
export const URLServerConfigSchema = z.object({
  url: z.string().url(),
});

/** Schema for a single MCP server entry (stdio or SSE). */
export const ServerConfigSchema = z.union([
  StdioServerConfigSchema,
  URLServerConfigSchema,
]);

/** A single MCP server configuration (stdio or SSE). */
export type ServerConfig = z.infer<typeof ServerConfigSchema>;

/** Schema for the full MCP config file. */
export const MCPConfigSchema = z.object({
  servers: z.record(z.string(), ServerConfigSchema),
});

/** The full MCP config file format. */
export type MCPConfig = z.infer<typeof MCPConfigSchema>;

/** Check whether a server config uses stdio transport. */
function isStdioConfig(
  config: ServerConfig,
): config is z.infer<typeof StdioServerConfigSchema> {
  return "command" in config;
}

/** Metadata for a connected MCP server and its discovered tools. */
interface ConnectedServer {
  name: string;
  client: Client;
  transport: StdioClientTransport | SSEClientTransport;
  tools: Array<{
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
  }>;
}

/**
 * Load and validate an MCP config file from disk.
 *
 * @param configPath - Absolute or relative path to the MCP config JSON file.
 * @returns The validated MCPConfig object.
 * @throws If the file does not exist, contains invalid JSON, or fails validation.
 */
export async function loadMCPConfig(configPath: string): Promise<MCPConfig> {
  const file = Bun.file(configPath);
  if (!(await file.exists())) {
    throw new Error(`MCP config file not found: ${configPath}`);
  }

  const content = await file.text();
  const parsed = JSON.parse(content);
  return MCPConfigSchema.parse(parsed);
}

/**
 * Convert an MCP tool definition to the AI SDK tool format.
 *
 * The returned tool includes an `execute` function that routes the call
 * back to the originating MCP server.
 */
function convertMCPToolToAISDKTool(
  mcpTool: {
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
  },
  client: Client,
): Tool {
  return {
    description: mcpTool.description,
    inputSchema: jsonSchema(
      mcpTool.inputSchema as import("json-schema").JSONSchema7,
    ),
    execute: async (args: unknown) => {
      const result = await client.callTool({
        name: mcpTool.name,
        arguments: args as Record<string, unknown>,
      });

      // Extract text content from the MCP result
      if ("content" in result && Array.isArray(result.content)) {
        const textParts = result.content
          .filter((c: { type: string }) => c.type === "text")
          .map((c: { type: string; text?: string }) => c.text ?? "");
        return textParts.join("\n");
      }

      // Fallback: return the raw result as stringified JSON
      return JSON.stringify(result);
    },
  } as Tool;
}

/**
 * Manages MCP server connections, tool discovery, and tool call routing.
 *
 * Usage:
 * 1. Create an instance with `new MCPManager()`
 * 2. Call `connect(config)` to connect to all configured servers
 * 3. Call `getTools()` to get AI SDK-compatible tools
 * 4. Call `close()` to disconnect and clean up
 */
export class MCPManager {
  private servers: ConnectedServer[] = [];

  /**
   * Connect to all MCP servers defined in the config.
   *
   * Servers that fail to connect are warned about but do not prevent
   * other servers from connecting.
   *
   * @param config - The validated MCP config object.
   */
  async connect(config: MCPConfig): Promise<void> {
    const entries = Object.entries(config.servers);

    for (const [name, serverConfig] of entries) {
      try {
        const connected = await this.connectServer(name, serverConfig);
        this.servers.push(connected);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `Warning: Failed to connect to MCP server "${name}": ${message}`,
        );
      }
    }
  }

  /**
   * Connect to a single MCP server and discover its tools.
   */
  private async connectServer(
    name: string,
    config: ServerConfig,
  ): Promise<ConnectedServer> {
    const client = new Client(
      { name: "ai-pipe", version: "1.0.0" },
      { capabilities: {} },
    );

    let transport: StdioClientTransport | SSEClientTransport;

    if (isStdioConfig(config)) {
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env,
        stderr: "pipe",
      });
    } else {
      transport = new SSEClientTransport(new URL(config.url));
    }

    await client.connect(transport);

    // Discover tools from the server
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));

    return { name, client, transport, tools };
  }

  /**
   * Get all discovered MCP tools converted to AI SDK tool format.
   *
   * Tool names are prefixed with the server name to avoid collisions,
   * using the format `serverName__toolName`.
   *
   * @returns A record of AI SDK tools keyed by prefixed tool name.
   */
  getTools(): Record<string, Tool> {
    const tools: Record<string, Tool> = {};

    for (const server of this.servers) {
      for (const mcpTool of server.tools) {
        const prefixedName = `${server.name}__${mcpTool.name}`;
        tools[prefixedName] = convertMCPToolToAISDKTool(mcpTool, server.client);
      }
    }

    return tools;
  }

  /**
   * Get the number of connected servers.
   */
  get serverCount(): number {
    return this.servers.length;
  }

  /**
   * Get a summary of all discovered tools for logging purposes.
   */
  getToolSummary(): Array<{ server: string; tool: string }> {
    const summary: Array<{ server: string; tool: string }> = [];
    for (const server of this.servers) {
      for (const mcpTool of server.tools) {
        summary.push({ server: server.name, tool: mcpTool.name });
      }
    }
    return summary;
  }

  /**
   * Gracefully disconnect from all MCP servers and clean up resources.
   */
  async close(): Promise<void> {
    for (const server of this.servers) {
      try {
        await server.transport.close();
      } catch {
        // Silently ignore close errors during cleanup
      }
    }
    this.servers = [];
  }
}

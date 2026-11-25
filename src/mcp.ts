import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import type { Tool } from "ai";
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

/** Metadata for a connected MCP server client. */
interface ConnectedServer {
  name: string;
  client: MCPClient;
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
 * Manages MCP server connections, tool discovery, and tool call routing.
 *
 * Uses @ai-sdk/mcp's createMCPClient which handles connection, tool discovery,
 * and automatic conversion of MCP tools to AI SDK format.
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
  async connect(config: MCPConfig, signal?: AbortSignal): Promise<void> {
    const entries = Object.entries(config.servers);

    for (const [name, serverConfig] of entries) {
      signal?.throwIfAborted();
      try {
        const connected = await this.connectServer(name, serverConfig, signal);
        this.servers.push(connected);
      } catch (err) {
        signal?.throwIfAborted();
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `Warning: Failed to connect to MCP server "${name}": ${message}`,
        );
      }
    }
  }

  /**
   * Connect to a single MCP server using @ai-sdk/mcp's createMCPClient.
   */
  private async connectServer(
    name: string,
    config: ServerConfig,
    signal?: AbortSignal,
  ): Promise<ConnectedServer> {
    let client: MCPClient;
    const initializationOptions = signal ? { signal } : undefined;

    if (isStdioConfig(config)) {
      const transport = new Experimental_StdioMCPTransport({
        command: config.command,
        args: config.args,
        env: config.env,
        stderr: "pipe",
      });
      client = await createMCPClient({ transport, initializationOptions });
    } else {
      client = await createMCPClient({
        initializationOptions,
        transport: {
          type: "sse",
          url: config.url,
        },
      });
    }

    return { name, client };
  }

  /**
   * Get all discovered MCP tools converted to AI SDK tool format.
   *
   * Tool names are prefixed with the server name to avoid collisions,
   * using the format `serverName__toolName`.
   *
   * @returns A record of AI SDK tools keyed by prefixed tool name.
   */
  async getTools(
    allowedNames?: ReadonlySet<string>,
    signal?: AbortSignal,
  ): Promise<Record<string, Tool>> {
    const tools: Record<string, Tool> = {};

    for (const server of this.servers) {
      const serverTools = signal
        ? await this.getToolsWithSignal(server.client, signal)
        : await server.client.tools();
      for (const [toolName, toolDef] of Object.entries(serverTools)) {
        const prefixedName = `${server.name}__${toolName}`;
        if (allowedNames) {
          if (!allowedNames.has(prefixedName)) continue;
          if (Object.hasOwn(tools, prefixedName)) {
            throw new Error(
              `Ambiguous MCP tool name "${prefixedName}". Rename one of the servers in the MCP config.`,
            );
          }
        }
        tools[prefixedName] = toolDef as Tool;
      }
    }

    return tools;
  }

  private async getToolsWithSignal(client: MCPClient, signal: AbortSignal) {
    let page = await client.listTools({ options: { signal } });
    const tools = [...page.tools];
    while (page.nextCursor != null) {
      page = await client.listTools({
        params: { cursor: page.nextCursor },
        options: { signal },
      });
      tools.push(...page.tools);
    }
    return client.toolsFromDefinitions({ tools });
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
  async getToolSummary(): Promise<Array<{ server: string; tool: string }>> {
    const summary: Array<{ server: string; tool: string }> = [];
    for (const server of this.servers) {
      const serverTools = await server.client.tools();
      for (const toolName of Object.keys(serverTools)) {
        summary.push({ server: server.name, tool: toolName });
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
        await server.client.close();
      } catch {
        // Silently ignore close errors during cleanup
      }
    }
    this.servers = [];
  }
}

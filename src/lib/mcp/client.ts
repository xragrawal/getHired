import { experimental_createMCPClient as createMCPClient } from "ai";
import { Experimental_StdioMCPTransport } from "ai/mcp-stdio";
import type { MCPServerConfig } from "./types";
import type { CoreTool } from "ai";

// Cached clients so we don't respawn stdio processes on every request
const clientCache = new Map<string, Awaited<ReturnType<typeof createMCPClient>>>();

export function getMCPServerConfigs(): MCPServerConfig[] {
  const raw = process.env.MCP_SERVERS;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as MCPServerConfig[];
  } catch {
    console.error("[mcp] Failed to parse MCP_SERVERS env var:", raw);
    return [];
  }
}

async function getOrCreateClient(server: MCPServerConfig) {
  const cached = clientCache.get(server.name);
  if (cached) return cached;

  let transport: Parameters<typeof createMCPClient>[0]["transport"];

  if (server.transport === "stdio") {
    if (!server.command) throw new Error(`MCP server "${server.name}" missing command`);
    transport = new Experimental_StdioMCPTransport({
      command: server.command,
      args: server.args ?? [],
      env: server.env,
    });
  } else if (server.transport === "sse") {
    if (!server.url) throw new Error(`MCP server "${server.name}" missing url`);
    transport = { type: "sse", url: server.url } as Parameters<typeof createMCPClient>[0]["transport"];
  } else if (server.transport === "streamable-http") {
    if (!server.url) throw new Error(`MCP server "${server.name}" missing url`);
    // Streamable HTTP transport (MCP spec 2025-03-26) — used by linkedin-mcp-server
    transport = { type: "streamable-http", url: server.url } as unknown as Parameters<typeof createMCPClient>[0]["transport"];
  } else {
    throw new Error(`Unknown MCP transport: ${(server as MCPServerConfig).transport}`);
  }

  const client = await createMCPClient({ transport });
  clientCache.set(server.name, client);
  return client;
}

export async function getAllMCPTools(): Promise<Record<string, CoreTool>> {
  const servers = getMCPServerConfigs();
  if (servers.length === 0) return {};

  const allTools: Record<string, CoreTool> = {};

  await Promise.allSettled(
    servers.map(async (server) => {
      try {
        const client = await getOrCreateClient(server);
        const tools = await client.tools();
        // Prefix tool names with server name to avoid collisions
        for (const [toolName, tool] of Object.entries(tools)) {
          allTools[`${server.name}__${toolName}`] = tool as CoreTool;
        }
      } catch (err) {
        console.error(`[mcp] Failed to load tools from server "${server.name}":`, err);
      }
    })
  );

  return allTools;
}

export async function closeAllMCPClients() {
  for (const [name, client] of clientCache.entries()) {
    try {
      await client.close();
      clientCache.delete(name);
    } catch {
      // ignore close errors
    }
  }
}

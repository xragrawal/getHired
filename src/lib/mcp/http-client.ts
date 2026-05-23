/**
 * Minimal MCP streamable-http client.
 * Manages session ID and makes direct tool calls without going through an LLM.
 */

interface MCPResult {
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function parseSSEBody(body: string): unknown {
  for (const line of body.split("\n")) {
    if (line.startsWith("data: ")) {
      const payload = JSON.parse(line.slice(6));
      if (payload?.result !== undefined) return payload.result;
      if (payload?.error) throw new Error(`MCP error: ${payload.error.message}`);
    }
  }
  throw new Error("No result found in MCP SSE response");
}

export class MCPHttpClient {
  private sessionId: string | null = null;
  private requestId = 0;

  constructor(private readonly url: string) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
      ...extra,
    };
  }

  async initialize(): Promise<void> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++this.requestId,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "gethired", version: "1.0" },
        },
      }),
    });

    this.sessionId = res.headers.get("mcp-session-id");
    parseSSEBody(await res.text()); // throws on error
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.sessionId) await this.initialize();

    const res = await fetch(this.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++this.requestId,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });

    const result = parseSSEBody(await res.text()) as MCPResult;

    // Prefer structuredContent, fall back to parsing text content
    if (result.structuredContent) return result.structuredContent;
    if (result.content?.[0]?.text) return JSON.parse(result.content[0].text) as Record<string, unknown>;
    throw new Error("Empty tool result");
  }
}

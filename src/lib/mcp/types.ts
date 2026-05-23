export type MCPTransportType = "stdio" | "sse" | "streamable-http";

export interface MCPServerConfig {
  name: string;
  transport: MCPTransportType;
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // sse / http
  url?: string;
}

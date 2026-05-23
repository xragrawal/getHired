import { getAllMCPTools, getMCPServerConfigs } from "@/lib/mcp/client";

export async function GET() {
  const servers = getMCPServerConfigs();
  const tools = await getAllMCPTools();

  const toolList = Object.entries(tools).map(([name, tool]) => {
    const [serverName, ...toolParts] = name.split("__");
    return {
      key: name,
      name: toolParts.join("__"),
      server: serverName,
      description: (tool as { description?: string }).description ?? "",
    };
  });

  return Response.json({
    servers: servers.map((s) => ({ name: s.name, transport: s.transport })),
    tools: toolList,
    count: toolList.length,
  });
}

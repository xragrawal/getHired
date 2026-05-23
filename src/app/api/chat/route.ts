import { streamText, type CoreMessage } from "ai";
import { getLanguageModel } from "@/lib/llm/providers";
import { getAllMCPTools } from "@/lib/mcp/client";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json()) as {
    messages: CoreMessage[];
    system?: string;
    provider?: string;
    model?: string;
  };

  const { messages, system } = body;

  if (!messages?.length) {
    return Response.json({ error: "messages required" }, { status: 400 });
  }

  const model = getLanguageModel(
    body.provider && body.model
      ? { provider: body.provider as "anthropic" | "openai" | "ollama", model: body.model }
      : undefined
  );

  const tools = await getAllMCPTools();

  const result = streamText({
    model,
    messages,
    system: system ?? "You are a helpful assistant.",
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    maxSteps: 10,
    onError: ({ error }) => {
      console.error("[chat] streamText error:", error);
    },
  });

  return result.toDataStreamResponse();
}

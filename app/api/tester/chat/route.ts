import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { createAgent } from "@/lib/agent/agent";
import type { AgentContext } from "@/lib/agent/tools";
import { badRequest, fail } from "../_shared";

export const runtime = "nodejs";

type ChatTurn = { role: "user" | "assistant"; content: string };
type ToolTrace = { name: string; args: unknown; result: string };

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message : "";
    const history = Array.isArray(body.history) ? (body.history as ChatTurn[]) : [];
    const bearer = typeof body.bearer === "string" ? body.bearer : "";
    const managedAddress = typeof body.managedAddress === "string" ? body.managedAddress : "";
    const phone = typeof body.phone === "string" ? body.phone : "";

    if (!message) return badRequest("message is required.");

    const ctx: AgentContext = {
      bearer: bearer || undefined,
      managedAddress: managedAddress || undefined,
      phone: phone || undefined,
    };

    const chatHistory: BaseMessage[] = history.map((turn) =>
      turn.role === "user" ? new HumanMessage(turn.content) : new AIMessage(turn.content),
    );

    const agentExecutor = createAgent(ctx);
    const result = await agentExecutor.invoke({
      messages: [...chatHistory, new HumanMessage(message)],
    });

    const messages = result.messages as BaseMessage[];
    const toolCalls: ToolTrace[] = [];

    for (const msg of messages) {
      if (!(msg instanceof AIMessage) || !msg.tool_calls?.length) continue;
      for (const call of msg.tool_calls) {
        const toolMessage = messages.find(
          (m): m is ToolMessage => m instanceof ToolMessage && m.tool_call_id === call.id,
        );
        toolCalls.push({
          name: call.name,
          args: call.args,
          result: toolMessage ? String(toolMessage.content) : "",
        });
      }
    }

    const lastMessage = messages[messages.length - 1];
    return Response.json({ reply: String(lastMessage?.content ?? ""), toolCalls });
  } catch (error) {
    return fail(error);
  }
}

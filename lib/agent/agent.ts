import { ChatOpenAI } from "@langchain/openai";
import { createTools, type AgentContext } from "./tools";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { BaseMessage } from "@langchain/core/messages";

export function createAgent(ctx: AgentContext = {}) {
  const llm = new ChatOpenAI({
    modelName: "gpt-5.6-luna",
    temperature: 0.2, // Low temperature for more deterministic, reliable outputs
    modelKwargs: {
      reasoning_effort: "none",
    },
  });

  const agentExecutor = createReactAgent({
    llm,
    tools: createTools(ctx),
    messageModifier: SYSTEM_PROMPT,
  });

  return agentExecutor;
}

export async function runAgentStep(
  input: string,
  chatHistory: BaseMessage[] = [],
  ctx: AgentContext = {}
) {
  const agentExecutor = createAgent(ctx);

  // For standard executor, we can just invoke it:
  const result = await agentExecutor.invoke({
    messages: [
      ...chatHistory,
      { role: "user", content: input }
    ],
  });

  // The result is an object with a messages array.
  // The last message is the AIMessage.
  const lastMessage = result.messages[result.messages.length - 1];
  return lastMessage.content;
}

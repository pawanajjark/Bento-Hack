import { ChatOpenAI } from "@langchain/openai";
import { tools } from "./tools";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { BaseMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";

export function createAgent() {
  const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.2, // Low temperature for more deterministic, reliable outputs
  });

  const agentExecutor = createReactAgent({
    llm,
    tools,
    messageModifier: SYSTEM_PROMPT,
  });

  return agentExecutor;
}

export async function runAgentStep(
  input: string,
  chatHistory: BaseMessage[] = []
) {
  const agentExecutor = createAgent();
  
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

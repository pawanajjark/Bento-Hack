import { runAgentStep } from "../lib/agent/agent";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import * as readline from "readline";
import * as dotenv from "dotenv";

dotenv.config(); // Loads .env by default
dotenv.config({ path: ".env.local" }); // Loads .env.local if present

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const chatHistory: BaseMessage[] = [];

async function chat() {
  rl.question("You: ", async (input) => {
    if (input.toLowerCase() === "exit") {
      rl.close();
      return;
    }

    try {
      const response = await runAgentStep(input, chatHistory);
      console.log(`\nAgent: ${response}\n`);
      
      chatHistory.push(new HumanMessage(input));
      chatHistory.push(new AIMessage(response));
    } catch (e: any) {
      console.error("\nError:", e.message, "\n");
    }

    chat();
  });
}

console.log("Bento Hotline Local Test. Type 'exit' to quit.");
console.log("Make sure you have OPENAI_API_KEY set in .env.local\n");
chat();

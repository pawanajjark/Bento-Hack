import { runAgentStep } from "../lib/agent/agent";
import type { AgentContext } from "../lib/agent/tools";
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

/**
 * Resolve the caller identity the agent acts for. Pass a linked phone as the
 * first CLI arg (e.g. `tsx scripts/test-agent.ts +919876543210`) to run against
 * that user's real Bento session; otherwise the agent runs unauthenticated and
 * only the public read tools work.
 */
async function resolveContext(): Promise<AgentContext> {
  const raw = process.argv[2];
  if (!raw) return {};

  // Import lazily so the DB/crypto deps only load when a phone is supplied.
  const { toIndianE164 } = await import("../lib/twilio-verify");
  const { getUserByPhone } = await import("../lib/user-links");
  const { decryptToken } = await import("../lib/secure");

  const phone = toIndianE164(raw);
  if (!phone) {
    console.warn(`"${raw}" is not a valid Indian phone number; running unauthenticated.\n`);
    return {};
  }

  const user = await getUserByPhone(phone);
  if (!user) {
    console.warn(`${phone} is not linked to a Bento account; running unauthenticated.\n`);
    return {};
  }

  const bearer = user.bentoTokenEncrypted ? decryptToken(user.bentoTokenEncrypted) : undefined;
  console.log(`Acting as ${phone} (managed ${user.managedAddress ?? "?"}).\n`);
  return { phone, managedAddress: user.managedAddress, bearer };
}

async function main() {
  const ctx = await resolveContext();

  function chat() {
    rl.question("You: ", async (input) => {
      if (input.toLowerCase() === "exit") {
        rl.close();
        return;
      }

      try {
        const response = await runAgentStep(input, chatHistory, ctx);
        console.log(`\nAgent: ${response}\n`);

        chatHistory.push(new HumanMessage(input));
        chatHistory.push(new AIMessage(String(response)));
      } catch (e) {
        console.error("\nError:", e instanceof Error ? e.message : e, "\n");
      }

      chat();
    });
  }

  chat();
}

console.log("Bento Hotline Local Test. Type 'exit' to quit.");
console.log("Make sure you have OPENAI_API_KEY set in .env.local");
console.log("Optionally pass a linked phone: tsx scripts/test-agent.ts +919876543210\n");
main();

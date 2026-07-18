import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import * as http from "http";
import twilio from "twilio";
import dotenv from "dotenv";
import { runAgentStep } from "../lib/agent/agent";
import type { AgentContext } from "../lib/agent/tools";
import { toIndianE164 } from "../lib/twilio-verify";
import { getUserByPhone } from "../lib/user-links";
import { decryptToken } from "../lib/secure";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

/** Resolve the caller's phone into the Bento session the agent acts with. */
async function resolveCaller(from: unknown): Promise<AgentContext> {
  const phone = toIndianE164(from);
  if (!phone) return {};
  try {
    const user = await getUserByPhone(phone);
    if (!user) return { phone };
    const managedAddress = user.managedAddress || user.walletAddress;
    let bearer: string | undefined;
    if (user.bentoTokenEncrypted) {
      try {
        bearer = decryptToken(user.bentoTokenEncrypted);
      } catch (err) {
        console.error("Failed to decrypt token:", err);
      }
    }
    return { phone, managedAddress, bearer };
  } catch (error) {
    console.error("Failed to resolve caller session:", error);
    return { phone };
  }
}

dotenv.config();
dotenv.config({ path: ".env.local" });

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/voice/session" });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Twilio incoming call webhook
app.post("/voice/incoming", (req, res) => {
  const host = req.headers.host;

  const response = new twilio.twiml.VoiceResponse();
  const connect = response.connect();

  // Use wss:// for production, handle localhost via ngrok properly
  const protocol = host?.includes("localhost") ? "ws" : "wss";

  const fromNumber = req.body.From;

  const relay = connect.conversationRelay({
    url: `${protocol}://${host}/voice/session`
  });

  if (fromNumber) {
    relay.parameter({ name: "fromNumber", value: fromNumber });
  }

  res.type("text/xml");
  res.send(response.toString());
});

// WebSocket handler for ConversationRelay
wss.on("connection", (ws: WebSocket) => {
  console.log("Twilio connected to ConversationRelay WebSocket");

  // Keep track of the chat history for this specific call session
  const chatHistory: BaseMessage[] = [];
  // Caller identity, resolved from the Twilio setup event. Until then the agent
  // runs unauthenticated (public reads only).
  let callerCtx: AgentContext = {};

  ws.on("message", async (message: string) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "setup") {
        console.log("Session setup:", data.callSid);

        const fromNumber = data.customParameters?.fromNumber || data.from;

        if (fromNumber) {
          console.log("Caller number:", fromNumber);
          callerCtx = await resolveCaller(fromNumber);
          console.log(
            callerCtx.bearer
              ? `Caller linked as ${callerCtx.phone} (managed ${callerCtx.managedAddress}).`
              : `Caller ${callerCtx.phone ?? "unknown"} is not linked; read-only session.`,
          );

          try {
            const phoneForDb = callerCtx.phone || fromNumber;
            const userDetails = await getUserByPhone(phoneForDb);
            if (userDetails) {
              const userContextStr = `System Context: The caller's phone number is ${phoneForDb}. They are a registered user. Their wallet address is ${userDetails.walletAddress}. Their current play credits balance is ${userDetails.creditsBalance || 0}. Remember this for the entire call, especially if they ask to place a bet or check their balance.`;
              chatHistory.push(new SystemMessage(userContextStr));
            } else {
              const userContextStr = `System Context: The caller's phone number is ${phoneForDb}, but they are NOT registered in the database yet. They have no credits.`;
              chatHistory.push(new SystemMessage(userContextStr));
            }
          } catch (dbError) {
            console.error("Error fetching user from DB:", dbError);
          }
        }

        // Trigger initial greeting
        try {
          const initPrompt = "The user has just connected to the call. Give a super casual, high-energy welcome introducing yourself as Ben, the Bento Bookie. Say something like 'What's up man!' or 'Hey, you've got Ben here!'. Ask what event or market they're looking at today. Keep it to one short sentence. Do not wait for a tool call.";
          const aiResponse = await runAgentStep(initPrompt, chatHistory, callerCtx);
          console.log("Agent (Greeting):", aiResponse);

          chatHistory.push(new AIMessage(aiResponse as string));

          ws.send(JSON.stringify({
            type: "text",
            token: aiResponse,
            last: true
          }));
        } catch (error) {
          console.error("Agent Greeting Error:", error);
        }
      }

      // Twilio sends a 'prompt' event when the user speaks
      if (data.type === "prompt") {
        const userText = data.voicePrompt;
        console.log("Caller:", userText);

        if (!userText) return;

        // Pass to Langchain Agent
        try {
          const aiResponse = await runAgentStep(userText, chatHistory, callerCtx);
          console.log("Agent:", aiResponse);

          // Store in history
          chatHistory.push(new HumanMessage(userText));
          chatHistory.push(new AIMessage(aiResponse as string));

          // Send response back to Twilio to speak
          ws.send(JSON.stringify({
            type: "text",
            token: aiResponse,
            last: true
          }));
        } catch (error) {
          console.error("Agent Error:", error);
          ws.send(JSON.stringify({
            type: "text",
            token: "I'm sorry, I'm having trouble connecting to the market data right now.",
            last: true
          }));
        }
      }

      if (data.type === "interrupt") {
        console.log("User interrupted the agent.");
        // We can handle interruption logic here (e.g. stopping TTS)
      }

    } catch (err) {
      console.error("Error parsing message from Twilio:", err);
    }
  });

  ws.on("close", () => {
    console.log("Twilio WebSocket disconnected");
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Voice Gateway Server is running on port ${PORT}`);
  console.log(`- Webhook URL: http://localhost:${PORT}/voice/incoming`);
  console.log(`- WebSocket URL: ws://localhost:${PORT}/voice/session`);
  console.log(`NOTE: Run 'ngrok http ${PORT}' and update Twilio with the Ngrok URLs.`);
});

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
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

/** Resolve the caller's phone into the Bento session the agent acts with. */
async function resolveCaller(from: unknown): Promise<AgentContext> {
  const phone = toIndianE164(from);
  if (!phone) return {};
  try {
    const user = await getUserByPhone(phone);
    if (!user?.managedAddress) return { phone };
    const bearer = user.bentoTokenEncrypted ? decryptToken(user.bentoTokenEncrypted) : undefined;
    return { phone, managedAddress: user.managedAddress, bearer };
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
  
  connect.conversationRelay({
    url: `${protocol}://${host}/voice/session`
  });

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
        console.log("Session setup:", data.callSid, "from:", data.from);
        callerCtx = await resolveCaller(data.from);
        console.log(
          callerCtx.bearer
            ? `Caller linked as ${callerCtx.phone} (managed ${callerCtx.managedAddress}).`
            : `Caller ${callerCtx.phone ?? "unknown"} is not linked; read-only session.`,
        );
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

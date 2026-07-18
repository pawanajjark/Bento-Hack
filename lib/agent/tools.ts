import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { searchNews } from "duck-duck-scrape";
import {
  listMarkets,
  getMarket,
  estimateBet,
  placeBetFromQuote,
  getUserShares,
} from "@/lib/bento";
import { getUserByPhone } from "@/lib/user-links";
import { stashQuote, takeQuote } from "./pending-bets";

/**
 * Identity of the caller the agent is acting for. Threaded in from the voice
 * gateway (phone -> linked Bento session). Public reads work without it;
 * anything that spends or reads the user's balance requires a bearer.
 */
export type AgentContext = {
  /** E.164 phone that owns the linked account (e.g. +9198...). */
  phone?: string;
  /** Bento managed account address that holds credits and shares. */
  managedAddress?: string;
  /** Decrypted Bento session token used to act as the user. */
  bearer?: string;
};

function requireSession(ctx: AgentContext): { bearer: string; managedAddress: string } | { error: string } {
  if (!ctx.bearer || !ctx.managedAddress) {
    return { error: "This caller isn't linked to a Bento account yet, so I can't act on their balance." };
  }
  return { bearer: ctx.bearer, managedAddress: ctx.managedAddress };
}

function friendlyError(reason: unknown, fallback: string): string {
  const message = reason instanceof Error ? reason.message : "";
  return JSON.stringify({ error: message || fallback });
}

export function createTools(ctx: AgentContext = {}) {
  const listLiveMarketsTool = new DynamicStructuredTool({
    name: "list_live_markets",
    description: "Lists up to 3 currently live prediction markets. Use this to discover available markets for the user.",
    schema: z.object({
      query: z.string().optional().describe("Optional search keyword or sport to filter markets."),
      limit: z.enum(["1", "2", "3"]).optional().default("3").describe("Max number of markets to return. Default is 3."),
    }),
    func: async ({ query, limit }) => {
      console.log("[Tool] list_live_markets called with:", { query, limit });
      try {
        const markets = await listMarkets({ query, limit: parseInt(limit || "3", 10) });
        if (markets.length === 0) return JSON.stringify({ markets: [], note: "No live markets right now." });
        return JSON.stringify(
          markets.map((m) => ({
            duelId: m.duelId,
            question: m.question,
            optionA: m.options[0].label,
            optionB: m.options[1].label,
            collateralMode: m.collateralMode,
            category: m.category,
          })),
        );
      } catch (reason) {
        return friendlyError(reason, "I couldn't reach the markets list right now.");
      }
    },
  });

  const getMarketDetailsTool = new DynamicStructuredTool({
    name: "get_market_details",
    description: "Gets detailed pricing and status for a specific market using its duelId.",
    schema: z.object({
      duelId: z.string().describe("The unique duelId of the market."),
    }),
    func: async ({ duelId }) => {
      console.log("[Tool] get_market_details called with:", { duelId });
      try {
        const market = await getMarket(duelId);
        if (!market) return JSON.stringify({ error: "Market not found or not live." });
        return JSON.stringify({
          duelId: market.duelId,
          question: market.question,
          option0Label: market.options[0].label,
          option1Label: market.options[1].label,
          collateralMode: market.collateralMode,
          category: market.category,
          endsInSeconds: market.endsIn,
          participants: market.uniqueParticipants,
        });
      } catch (reason) {
        return friendlyError(reason, "I couldn't load that market.");
      }
    },
  });

  const getAccountSummaryTool = new DynamicStructuredTool({
    name: "get_account_summary",
    description: "Gets the user's current account balance in play credits.",
    schema: z.object({}),
    func: async () => {
      console.log("[Tool] get_account_summary called");
      if (!ctx.phone) {
        return JSON.stringify({ error: "I don't have a linked account for this caller yet." });
      }
      try {
        const user = await getUserByPhone(ctx.phone);
        if (!user) return JSON.stringify({ error: "This number isn't linked to a Bento account yet." });
        return JSON.stringify({
          balanceCredits: user.creditsBalance ?? 0,
          currency: "Play Credits",
        });
      } catch (reason) {
        return friendlyError(reason, "I couldn't read the balance.");
      }
    },
  });

  const preparePredictionTool = new DynamicStructuredTool({
    name: "prepare_prediction",
    description:
      "Prepares a prediction and gets a live quote before confirmation. DO NOT call this until the user has explicitly chosen a market, an outcome, and a stake amount. Returns a confirmationToken the user must confirm.",
    schema: z.object({
      duelId: z.string().describe("The duelId of the market."),
      optionIndex: z.enum(["0", "1"]).describe("The index of the outcome (0 for optionA, 1 for optionB)."),
      stakeCredits: z.number().describe("The amount of play credits to stake (whole numbers only)."),
    }),
    func: async ({ duelId, optionIndex, stakeCredits }) => {
      console.log("[Tool] prepare_prediction called with:", { duelId, optionIndex, stakeCredits });
      const session = requireSession(ctx);
      if ("error" in session) return JSON.stringify({ error: session.error });

      try {
        const market = await getMarket(duelId);
        if (!market) return JSON.stringify({ error: "Market not found or not live." });

        const index = optionIndex === "0" ? 0 : 1;
        const quote = await estimateBet({
          market,
          optionIndex: index,
          stakeCredits,
          bearer: session.bearer,
        });

        const token = stashQuote(ctx.phone ?? session.managedAddress, quote);
        const shares = quote.sharesOut.toFixed(1);
        const spokenSummary = `You are placing ${quote.stakeCredits} play credits on ${quote.optionLabel} for ${market.question}. This quote estimates ${shares} shares. Say 'confirm' or press 1 to place it.`;

        return JSON.stringify({
          confirmationToken: token,
          expiresInSeconds: 60,
          spokenSummary,
          marketQuestion: market.question,
          outcomeLabel: quote.optionLabel,
          stakeCredits: quote.stakeCredits,
          estimatedShares: shares,
        });
      } catch (reason) {
        return friendlyError(reason, "I couldn't price that prediction.");
      }
    },
  });

  const confirmPredictionTool = new DynamicStructuredTool({
    name: "confirm_prediction",
    description:
      "Places the prediction the user just confirmed. Call ONLY after prepare_prediction returned a confirmationToken AND the user explicitly said confirm/yes/press 1. Spends the user's play credits.",
    schema: z.object({
      confirmationToken: z.string().describe("The confirmationToken returned by prepare_prediction."),
    }),
    func: async ({ confirmationToken }) => {
      console.log("[Tool] confirm_prediction called with:", { confirmationToken });
      const session = requireSession(ctx);
      if ("error" in session) return JSON.stringify({ error: session.error });

      const scope = ctx.phone ?? session.managedAddress;
      const taken = takeQuote(scope, confirmationToken);
      if (!taken.ok) {
        const message =
          taken.reason === "expired"
            ? "That quote expired. Let's get a fresh one before placing."
            : "I couldn't find that pending prediction. Let's prepare it again.";
        return JSON.stringify({ error: message });
      }

      try {
        const placed = await placeBetFromQuote({ quote: taken.quote, bearer: session.bearer });
        return JSON.stringify({
          placed: placed.accepted,
          requestId: placed.requestId,
          stakeCredits: placed.stakeCredits,
          outcomeLabel: placed.optionLabel,
          shares: placed.sharesOut.toFixed(1),
          spokenSummary: `Done! ${placed.stakeCredits} play credits are on ${placed.optionLabel} for about ${placed.sharesOut.toFixed(
            1,
          )} shares.`,
        });
      } catch (reason) {
        return friendlyError(reason, "The prediction couldn't be placed. No credits were spent.");
      }
    },
  });

  const getPositionsTool = new DynamicStructuredTool({
    name: "get_positions",
    description: "Gets the user's current shares in a specific market. Requires the market's duelId.",
    schema: z.object({
      duelId: z.string().describe("The duelId of the market to check positions in."),
    }),
    func: async ({ duelId }) => {
      console.log("[Tool] get_positions called with:", { duelId });
      const session = requireSession(ctx);
      if ("error" in session) return JSON.stringify({ error: session.error });
      try {
        const shares = await getUserShares({
          duelId,
          managedAddress: session.managedAddress,
          bearer: session.bearer,
        });
        const market = await getMarket(duelId).catch(() => null);
        return JSON.stringify({
          duelId,
          option0: { label: market?.options[0].label ?? "Option A", shares: shares.option0 },
          option1: { label: market?.options[1].label ?? "Option B", shares: shares.option1 },
        });
      } catch (reason) {
        return friendlyError(reason, "I couldn't read your positions.");
      }
    },
  });

  const searchMarketNewsTool = new DynamicStructuredTool({
    name: "search_market_news",
    description:
      "Searches DuckDuckGo News for recent articles on a given topic. Useful for market analysis to find real-time context and events affecting a market.",
    schema: z.object({
      query: z.string().describe("The search query for news articles (e.g., 'Bitcoin', 'India T20 World Cup')."),
    }),
    func: async ({ query }) => {
      console.log("[Tool] search_market_news called with:", { query });
      try {
        const results = await searchNews(query);
        if (!results.results || results.results.length === 0) {
          return "No recent news found for this topic.";
        }

        const snippets = results.results
          .slice(0, 3)
          .map((item, i) => {
            return `[${i + 1}] ${item.title}\\nSnippet: ${item.excerpt}\\nSource: ${item.syndicate}`;
          })
          .join("\\n\\n");

        return `Recent News for "${query}":\\n\\n${snippets}`;
      } catch (error) {
        return `Error searching news: ${error instanceof Error ? error.message : "unknown error"}`;
      }
    },
  });

  const tools = [
    listLiveMarketsTool,
    getMarketDetailsTool,
    getAccountSummaryTool,
    preparePredictionTool,
    confirmPredictionTool,
    getPositionsTool,
    searchMarketNewsTool,
  ];

  for (const tool of tools) {
    const originalFunc = tool.func;
    // @ts-ignore
    tool.func = async (args: any) => {
      const result = await originalFunc(args);
      console.log(`[Tool] ${tool.name} returned:`, result);
      return result;
    };
  }

  return tools;
}

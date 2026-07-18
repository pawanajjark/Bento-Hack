import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { searchNews } from "duck-duck-scrape";

// Mock data
const MOCK_MARKETS = [
  { duelId: "d_1", question: "Will India win the T20 World Cup?", optionA: "Yes", optionB: "No", collateralMode: "credits", status: "live" },
  { duelId: "d_2", question: "Will Bitcoin reach $100k by year end?", optionA: "Yes", optionB: "No", collateralMode: "credits", status: "live" },
  { duelId: "d_3", question: "Will it rain in Bangalore tomorrow?", optionA: "Yes", optionB: "No", collateralMode: "credits", status: "live" },
];

export const listLiveMarketsTool = new DynamicStructuredTool({
  name: "list_live_markets",
  description: "Lists up to 3 currently live prediction markets. Use this to discover available markets for the user.",
  schema: z.object({
    query: z.string().optional().describe("Optional search keyword or sport to filter markets."),
    limit: z.enum(["1", "2", "3"]).optional().default("3").describe("Max number of markets to return. Default is 3."),
  }),
  func: async ({ query, limit }) => {
    // In production, call Bento SDK catalog methods
    let results = MOCK_MARKETS;
    if (query) {
      results = results.filter(m => m.question.toLowerCase().includes(query.toLowerCase()));
    }
    const max = parseInt(limit || "3", 10);
    return JSON.stringify(results.slice(0, max));
  },
});

export const getMarketDetailsTool = new DynamicStructuredTool({
  name: "get_market_details",
  description: "Gets detailed pricing and status for a specific market using its duelId.",
  schema: z.object({
    duelId: z.string().describe("The unique duelId of the market."),
  }),
  func: async ({ duelId }) => {
    // In production, call Bento SDK
    const market = MOCK_MARKETS.find(m => m.duelId === duelId);
    if (!market) {
      return JSON.stringify({ error: "Market not found or not live." });
    }
    return JSON.stringify({
      ...market,
      closeTime: "2026-12-31T23:59:59Z",
      option0Label: market.optionA,
      option1Label: market.optionB,
      option0PriceEstimate: "0.45",
      option1PriceEstimate: "0.55",
    });
  },
});

export const getAccountSummaryTool = new DynamicStructuredTool({
  name: "get_account_summary",
  description: "Gets the user's current account balance in play credits.",
  schema: z.object({}),
  func: async () => {
    // In production, derive identity from call session and fetch from Bento
    return JSON.stringify({
      balanceCredits: 500,
      currency: "Play Credits",
    });
  },
});

export const preparePredictionTool = new DynamicStructuredTool({
  name: "prepare_prediction",
  description: "Prepares a prediction and gets a quote before confirmation. DO NOT call this until the user has explicitly chosen a market, an outcome, and a stake amount.",
  schema: z.object({
    duelId: z.string().describe("The duelId of the market."),
    optionIndex: z.enum(["0", "1"]).describe("The index of the outcome (0 for optionA, 1 for optionB)."),
    stakeCredits: z.number().describe("The amount of play credits to stake (whole numbers only)."),
  }),
  func: async ({ duelId, optionIndex, stakeCredits }) => {
    // In production, calls estimateBuy and stores pending record on server
    const market = MOCK_MARKETS.find(m => m.duelId === duelId);
    if (!market) {
      return JSON.stringify({ error: "Market not found" });
    }
    const outcomeLabel = optionIndex === "0" ? market.optionA : market.optionB;
    const estimatedShares = (stakeCredits / 0.5).toFixed(1); // Mock 50/50 odds

    const spokenSummary = `You are placing ${stakeCredits} play credits on ${outcomeLabel}. This quote estimates ${estimatedShares} shares. Say 'confirm' or press 1 to place it.`;

    return JSON.stringify({
      confirmationToken: "mock_token_123",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      spokenSummary,
      marketQuestion: market.question,
      outcomeLabel,
      stakeCredits,
      estimatedShares,
    });
  },
});

export const getPositionsTool = new DynamicStructuredTool({
  name: "get_positions",
  description: "Gets the user's current open predictions/positions.",
  schema: z.object({}),
  func: async () => {
    return JSON.stringify([
      { duelId: "d_1", outcome: "Yes", shares: "22.5", status: "pending resolution" }
    ]);
  }
});

export const searchMarketNewsTool = new DynamicStructuredTool({
  name: "search_market_news",
  description: "Searches DuckDuckGo News for recent articles on a given topic. Useful for market analysis to find real-time context and events affecting a market.",
  schema: z.object({
    query: z.string().describe("The search query for news articles (e.g., 'Bitcoin', 'India T20 World Cup')."),
  }),
  func: async ({ query }) => {
    try {
      const results = await searchNews(query);
      if (!results.results || results.results.length === 0) {
        return "No recent news found for this topic.";
      }

      const snippets = results.results.slice(0, 3).map((item: any, i: number) => {
        return `[${i + 1}] ${item.title}\\nSnippet: ${item.excerpt}\\nSource: ${item.source}`;
      }).join("\\n\\n");

      return `Recent News for "${query}":\\n\\n${snippets}`;
    } catch (error: any) {
      return `Error searching news: ${error.message}`;
    }
  }
});

export const tools = [
  listLiveMarketsTool,
  getMarketDetailsTool,
  getAccountSummaryTool,
  preparePredictionTool,
  getPositionsTool,
  searchMarketNewsTool,
];

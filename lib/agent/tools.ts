import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { searchAnakin } from "@/lib/anakin";
import {
  listMarkets,
  listAllDuels,
  getMarket,
  estimateBet,
  placeBetFromQuote,
  getAllUserPositions,
  getUserShares,
  mintTestnetFunds,
  createDuel,
  type CreateDuelInput,
} from "@/lib/bento";
import { validateDuelSchedule } from "@/lib/duel-schedule";
import { getUserByPhone } from "@/lib/user-links";
import { stashQuote, takeLatestQuote } from "./pending-bets";
import { stashDuel, takeDuel } from "./pending-duels";

const DUEL_CATEGORIES = [
  "Cricket",
  "Football",
  "Basketball",
  "American Football",
  "Tennis",
  "Baseball",
  "Hockey",
  "Formula 1",
] as const;

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

  // Anti-hallucination guardrail: if the backend rejects the duelId, force the LLM to search for it again.
  if (message.includes("No duel found with the given duelId")) {
    return JSON.stringify({
      error: "CRITICAL: You used an invalid or made-up duelId. You MUST call list_live_markets right now to search for the real duelId before you can proceed."
    });
  }

  return JSON.stringify({ error: message || fallback });
}

export function createTools(ctx: AgentContext = {}) {
  const listLiveMarketsTool = new DynamicStructuredTool({
    name: "list_live_markets",
    description: "Lists up to 20 currently live prediction markets. Use this to discover available markets for the user.",
    schema: z.object({
      query: z.string().optional().describe("Optional search keyword or sport to filter markets."),
      limit: z.enum(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"]).optional().default("10").describe("Max number of markets to return. Default is 10."),
    }),
    func: async ({ query, limit }) => {
      console.log("[Tool] list_live_markets called with:", { query, limit });
      try {
        const markets = await listMarkets({ query, limit: parseInt(limit || "15", 10) });
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
      duelId: z.string().describe("The exact duelId of the market, which MUST be picked from the output of list_live_markets."),
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

  const listAllDuelsTool = new DynamicStructuredTool({
    name: "list_all_duels",
    description:
      "Lists duels across every stage — bootstrapping, upcoming, live, in review, and settled — not just what's live right now. Use this when the caller asks about upcoming or past duels, or wants more than the live catalog from list_live_markets.",
    schema: z.object({
      status: z
        .enum(["bootstrapping", "open", "pending", "pending_contest", "settled", "all"])
        .optional()
        .default("all")
        .describe("Filter to one lifecycle stage. Default 'all'."),
      limit: z.number().int().min(1).max(5).optional().default(3).describe("Max duels to return, since this is read aloud. Default 3."),
    }),
    func: async ({ status, limit }) => {
      console.log("[Tool] list_all_duels called with:", { status, limit });
      try {
        const duels = await listAllDuels();
        const filtered = status && status !== "all" ? duels.filter((d) => d.status === status) : duels;
        const top = filtered.slice(0, limit ?? 3);
        if (top.length === 0) {
          return JSON.stringify({ duels: [], note: `No duels found${status && status !== "all" ? ` in status ${status}` : ""}.` });
        }
        return JSON.stringify(
          top.map((d) => ({
            duelId: d.duelId,
            question: d.question,
            status: d.status,
            optionA: d.options[0].label,
            optionB: d.options[1].label,
            category: d.category,
            participants: d.participants,
          })),
        );
      } catch (reason) {
        return friendlyError(reason, "I couldn't load the duel catalog right now.");
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
      "Prepares a prediction and stores a live quote for confirmation. You MUST call this before confirm_prediction. DO NOT call this until the user has explicitly chosen a market, an outcome, and a stake amount. Read the returned spokenSummary and ask for confirmation; do not read or repeat the opaque confirmationToken.",
    schema: z.object({
      duelId: z.string().describe("The exact duelId of the market, which MUST be picked from the output of list_live_markets."),
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
        const spokenSummary = `Preparing to place ${quote.stakeCredits} play credits on ${quote.optionLabel} for ${market.question}...`;

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
      "Places the caller's current pending prediction after they explicitly confirm it. Takes no arguments because the pending quote is resolved securely from the caller's session. Spends the user's play credits.",
    schema: z.object({}),
    func: async () => {
      console.log("[Tool] confirm_prediction called");
      const session = requireSession(ctx);
      if ("error" in session) return JSON.stringify({ error: session.error });

      const scope = ctx.phone ?? session.managedAddress;
      const taken = takeLatestQuote(scope);
      if (!taken.ok) {
        const message =
          taken.reason === "expired"
            ? "That quote expired. Let's get a fresh one before placing."
            : "I couldn't find that pending prediction. Let's prepare it again.";
        return JSON.stringify({ error: message });
      }

      try {
        const placed = await placeBetFromQuote({ quote: taken.quote, bearer: session.bearer });
        console.log("[Tool] confirm_prediction success, placed result:", placed);
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
        console.error("[DEBUG] confirm_prediction caught error:", reason);
        return friendlyError(reason, "The prediction couldn't be placed. No credits were spent.");
      }
    },
  });

  const getPositionsTool = new DynamicStructuredTool({
    name: "get_positions",
    description: "Gets the user's current shares in a specific market. Requires the market's duelId.",
    schema: z.object({
      duelId: z.string().describe("The exact duelId of the market, which MUST be picked from get_all_positions or list_live_markets. Never invent or derive a slug."),
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

  const getAllPositionsTool = new DynamicStructuredTool({
    name: "get_all_positions",
    description:
      "Gets every current prediction position for the linked user across all markets. Use this immediately when the caller asks what bets, predictions, contests, or positions they have placed; do not ask them to name a market first.",
    schema: z.object({}),
    func: async () => {
      console.log("[Tool] get_all_positions called");
      const session = requireSession(ctx);
      if ("error" in session) return JSON.stringify({ error: session.error });
      try {
        const positions = await getAllUserPositions({
          managedAddress: session.managedAddress,
          bearer: session.bearer,
        });
        if (positions.length === 0) {
          return JSON.stringify({ totalPositions: 0, positions: [], note: "No current play-credit positions found." });
        }
        return JSON.stringify({
          totalPositions: positions.length,
          positions: positions.map((position) => ({
            duelId: position.duelId,
            question: position.question,
            category: position.category,
            status: position.status,
            outcomes: position.options.map((option) => ({
              optionIndex: option.optionIndex,
              label: option.optionLabel,
              shares: Number(option.shares.toFixed(2)),
              stakedCredits: Number(option.costBasis.toFixed(2)),
              currentValueCredits: Number(option.currentValue.toFixed(2)),
            })),
            totalStakedCredits: Number(position.totalCostBasis.toFixed(2)),
            currentValueCredits: Number(position.totalCurrentValue.toFixed(2)),
            unrealizedPnlCredits: Number(position.totalUnrealizedPnl.toFixed(2)),
          })),
        });
      } catch (reason) {
        return friendlyError(reason, "I couldn't load your prediction portfolio.");
      }
    },
  });

  const mintTestnetCreditsTool = new DynamicStructuredTool({
    name: "mint_testnet_credits",
    description:
      "Tops up the caller's play-credit balance from the testnet faucet. Use this when the caller is out of credits and wants more to keep playing. It's free play money, not real funds.",
    schema: z.object({}),
    func: async () => {
      console.log("[Tool] mint_testnet_credits called");
      const session = requireSession(ctx);
      if ("error" in session) return JSON.stringify({ error: session.error });
      try {
        const result = await mintTestnetFunds(session.managedAddress, session.bearer);
        if (!result.success) {
          return JSON.stringify({ error: "The faucet didn't mint this time. Let's try again in a moment." });
        }
        return JSON.stringify({
          minted: true,
          creditsMinted: result.creditsMinted,
          spokenSummary: `Boom, ${result.creditsMinted} fresh play credits just landed in your account.`,
        });
      } catch (reason) {
        return friendlyError(reason, "I couldn't reach the faucet right now.");
      }
    },
  });

  const prepareCreateDuelTool = new DynamicStructuredTool({
    name: "prepare_create_duel",
    description:
      "Stages a brand-new public duel for the caller to publish. Call this only after the caller has given you a clear question, a category, and two distinct outcome labels. Does NOT publish yet — returns a confirmationToken and a spoken summary the caller must confirm before it goes live.",
    schema: z.object({
      question: z.string().min(10).max(180).describe("The prediction question, phrased clearly, 10-180 characters."),
      category: z.enum(DUEL_CATEGORIES).describe("The sport or category this duel belongs to."),
      optionA: z.string().max(50).describe("Label for outcome A, e.g. 'Yes' or a team name."),
      optionB: z.string().max(50).describe("Label for outcome B, distinct from optionA."),
      description: z.string().max(400).optional().describe("Optional note on how the result will be decided."),
      startInMinutes: z.number().int().min(31).describe("Minutes from now until betting opens. Bento requires at least 31."),
      durationMinutes: z.number().int().min(15).describe("How many minutes the duel stays open once it starts. Bento requires at least 15."),
    }),
    func: async ({ question, category, optionA, optionB, description, startInMinutes, durationMinutes }) => {
      console.log("[Tool] prepare_create_duel called with:", { question, category, optionA, optionB, startInMinutes, durationMinutes });
      const session = requireSession(ctx);
      if ("error" in session) return JSON.stringify({ error: session.error });
      if (optionA.trim().toLowerCase() === optionB.trim().toLowerCase()) {
        return JSON.stringify({ error: "The two outcomes need to be different." });
      }

      const startDate = new Date(Date.now() + startInMinutes * 60_000);
      const endDate = new Date(startDate.valueOf() + durationMinutes * 60_000);
      const schedule = validateDuelSchedule(startDate.toISOString(), endDate.toISOString());
      if (!schedule.valid) return JSON.stringify({ error: schedule.error });

      const input: CreateDuelInput = {
        question,
        category,
        optionA,
        optionB,
        description,
        startTime: schedule.startDate.toISOString(),
        endTime: schedule.endDate.toISOString(),
      };
      const token = stashDuel(ctx.phone ?? session.managedAddress, input);
      const spokenSummary = `New duel: ${question} Outcomes are ${optionA} or ${optionB}, opening in about ${startInMinutes} minutes and running for ${durationMinutes} minutes. This goes public for everyone to play. Say confirm to publish it.`;

      return JSON.stringify({
        confirmationToken: token,
        expiresInSeconds: 300,
        spokenSummary,
        question,
        optionA,
        optionB,
        category,
      });
    },
  });

  const confirmCreateDuelTool = new DynamicStructuredTool({
    name: "confirm_create_duel",
    description:
      "Publishes the duel staged by prepare_create_duel. Call ONLY after the caller explicitly confirms. This makes the duel public and visible to every player — never call it on your own initiative.",
    schema: z.object({
      confirmationToken: z.string().describe("The confirmationToken returned by prepare_create_duel."),
    }),
    func: async ({ confirmationToken }) => {
      console.log("[Tool] confirm_create_duel called with:", { confirmationToken });
      const session = requireSession(ctx);
      if ("error" in session) return JSON.stringify({ error: session.error });

      const scope = ctx.phone ?? session.managedAddress;
      const taken = takeDuel(scope, confirmationToken);
      if (!taken.ok) {
        const message =
          taken.reason === "expired"
            ? "That duel setup expired. Let's set it up again."
            : "I couldn't find that pending duel. Let's set it up again.";
        return JSON.stringify({ error: message });
      }

      try {
        const result = await createDuel({ ...taken.input, bearer: session.bearer });
        return JSON.stringify({
          published: true,
          duelId: result.duelId,
          spokenSummary: `It's live. Your duel is published, and the ID ends in ${result.duelId.slice(-6)}.`,
        });
      } catch (reason) {
        return friendlyError(reason, "The duel couldn't be published. Nothing went out.");
      }
    },
  });

  const searchMarketNewsTool = new DynamicStructuredTool({
    name: "search_market_news",
    description:
      "Searches the web with Anakin for recent, cited information about a market. Use it for real-time context and events that may affect a market.",
    schema: z.object({
      query: z.string().min(2).max(300).describe("A focused web-search query, including recency terms when useful."),
    }),
    func: async ({ query }) => {
      console.log("[Tool] search_market_news called with:", { query });
      try {
        const results = await searchAnakin(query, 5);
        if (results.length === 0) {
          return JSON.stringify({ provider: "Anakin", query, results: [], note: "No recent sources found." });
        }

        return JSON.stringify({
          provider: "Anakin",
          query,
          results: results.slice(0, 3),
        });
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error && error.message === "ANAKIN_NOT_CONFIGURED"
            ? "Anakin search isn't configured on the server."
            : "I couldn't search the web right now.",
        });
      }
    },
  });

  const tools = [
    listLiveMarketsTool,
    listAllDuelsTool,
    getMarketDetailsTool,
    getAccountSummaryTool,
    preparePredictionTool,
    confirmPredictionTool,
    getAllPositionsTool,
    getPositionsTool,
    mintTestnetCreditsTool,
    prepareCreateDuelTool,
    confirmCreateDuelTool,
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

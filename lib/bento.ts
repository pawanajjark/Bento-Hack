import { createBentoSdk, walletAuthProvider } from "@bento.fun/sdk";

/** The exact message a wallet must sign for Bento EOA login (see EoaLoginDto). */
export function bentoLoginMessage(address: string, timestamp: string): string {
  return `Bento.fun Login\nTimestamp: ${timestamp}\nWallet: ${address}`;
}

function getBentoSdk(bearer?: string) {
  const baseUrl = process.env.BENTO_URL;
  if (!baseUrl) throw new Error("BENTO_NOT_CONFIGURED");
  const apiKey = process.env.BENTO_BUILDER_API_KEY;

  const headers: Record<string, string> = {};
  if (apiKey) headers["x-builder-api-key"] = apiKey;
  if (bearer) headers["Authorization"] = `Bearer ${bearer}`;

  const authHeaders: Record<string, string> = bearer ? { Authorization: `Bearer ${bearer}` } : {};
  return createBentoSdk({
    baseUrl,
    headers,
    auth: walletAuthProvider(() => authHeaders),
  });
}

/**
 * Decimals used to scale whole play credits into on-chain collateral "wei".
 * Credits markets settle in a USDC-style token (6 decimals by default);
 * override with BENTO_CREDITS_DECIMALS if the deployment differs.
 */
export const CREDITS_DECIMALS = Number(process.env.BENTO_CREDITS_DECIMALS ?? 6);

/** Convert a whole-credit stake into the collateral base-unit string the API expects. */
export function creditsToWei(stakeCredits: number): string {
  if (!Number.isFinite(stakeCredits) || stakeCredits <= 0) {
    throw new Error("Stake must be a positive number of credits.");
  }
  const whole = Math.floor(stakeCredits);
  return (BigInt(whole) * BigInt(10) ** BigInt(CREDITS_DECIMALS)).toString();
}

export type MarketOption = { index: 0 | 1; label: string };

export type MarketSummaryView = {
  duelId: string;
  question: string;
  options: MarketOption[];
  collateralMode: string;
  category?: string;
  /** Seconds until the market closes (backend-provided). */
  endsIn?: number;
};

function toOptions(options: string[] | undefined): MarketOption[] {
  const labels = options ?? [];
  return [
    { index: 0 as const, label: labels[0] ?? "Option A" },
    { index: 1 as const, label: labels[1] ?? "Option B" },
  ];
}

/** List live, credits-collateral markets. Public read — no session needed. */
export async function listMarkets(params: { query?: string; limit?: number } = {}): Promise<MarketSummaryView[]> {
  const sdk = getBentoSdk();
  const requestedLimit = Math.min(Math.max(params.limit ?? 15, 1), 20);

  // Fetch a larger batch if we need to filter locally, otherwise just fetch the limit
  const fetchLimit = params.query ? 100 : 15;

  console.log(`[API Debug] Fetching up to ${fetchLimit} markets (Query: "${params.query || ""}")`);
  const resp = await sdk.public.listDuels({
    collateralStack: "credits",
    limit: fetchLimit,
    sortBy: "endTime",
    sortOrder: "asc",
  });

  let rows = resp.data ?? [];
  console.log(`[API Debug] Backend returned ${rows.length} markets.`);

  if (params.query) {
    const needle = params.query.toLowerCase();
    rows = rows.filter((row) => row.betString?.toLowerCase().includes(needle));
    console.log(`[API Debug] After local filter ("${needle}"), ${rows.length} markets remain.`);
  }

  const result = rows.slice(0, requestedLimit).map((row) => ({
    duelId: row.duelId,
    question: row.betString,
    options: toOptions(row.options),
    collateralMode: row.collateralMode ?? "credits",
    category: row.category,
    endsIn: row.endsIn,
  }));

  console.log(`[API Debug] Returning ${result.length} markets:`, result.map(m => m.duelId));
  return result;
}

export type MarketDetailView = MarketSummaryView & {
  duelType: string;
  status: number;
  uniqueParticipants?: number;
};

/** Full detail for one market by duelId. Public read — no session needed. */
export async function getMarket(duelId: string): Promise<MarketDetailView | null> {
  const sdk = getBentoSdk();
  const detail = await sdk.public.getDuelById({ duelId: duelId });
  if (!detail) return null;
  return {
    duelId: detail.duelId,
    question: detail.betString,
    options: toOptions(detail.options),
    collateralMode: detail.collateralMode ?? "credits",
    category: detail.category,
    endsIn: detail.endsIn,
    duelType: detail.duelType,
    status: detail.status,
    uniqueParticipants: detail.uniqueParticipants,
  };
}

/** The pieces of a priced quote needed to place the bet later. */
export type BetQuote = {
  duelId: string;
  duelType: string;
  optionIndex: 0 | 1;
  optionLabel: string;
  stakeCredits: number;
  betAmountUsdc: string;
  slippageBps: number;
  collateralMode: "credits";
  sharesOut: number;
  minSharesOut: number;
  quoteId: string;
  quoteTimestamp: number;
  avgPricePaid: number;
};

const DEFAULT_SLIPPAGE_BPS = 300; // 3% — tolerant enough for thin credits pools.

/**
 * Price a buy against a market on behalf of the session user. Requires the
 * user's Bento bearer (the managed account transacts, not the user's EOA).
 */
export async function estimateBet(params: {
  market: MarketDetailView;
  optionIndex: 0 | 1;
  stakeCredits: number;
  bearer: string;
  slippageBps?: number;
}): Promise<BetQuote> {
  const { market, optionIndex, stakeCredits, bearer } = params;
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const betAmountUsdc = creditsToWei(stakeCredits);

  const sdk = getBentoSdk(bearer);
  const resp = await sdk.user.estimateBuy({
    duelId: market.duelId,
    optionIndex,
    betAmountUsdc,
    slippageBps,
  });
  if (resp.success === false) {
    throw new Error(resp.error || "The market could not price this stake.");
  }

  const estimate = resp.estimate;
  return {
    duelId: market.duelId,
    duelType: market.duelType,
    optionIndex,
    optionLabel: market.options[optionIndex].label,
    stakeCredits: Math.floor(stakeCredits),
    betAmountUsdc,
    slippageBps,
    collateralMode: "credits",
    sharesOut: estimate.shares_out,
    minSharesOut: estimate.min_shares_out,
    quoteId: estimate.quote_id,
    quoteTimestamp: estimate.quote_timestamp,
    avgPricePaid: estimate.avg_price_paid,
  };
}

export type PlacedBet = {
  accepted: boolean;
  requestId: string;
  sharesOut: number;
  stakeCredits: number;
  optionLabel: string;
};

/**
 * Place a previously priced bet from the user's managed account. Rebuilds the
 * full estimate the SDK helper expects from the stored quote.
 */
export async function placeBetFromQuote(params: { quote: BetQuote; bearer: string }): Promise<PlacedBet> {
  const { quote, bearer } = params;
  const sdk = getBentoSdk(bearer);

  const payload = {
    // Reconstruct the PricingEngineEstimate fields the builder reads back.
    estimate: {
      outcome: quote.optionIndex === 0 ? "yes" : "no",
      shares_out: quote.sharesOut,
      min_shares_out: quote.minSharesOut,
      avg_price_paid: quote.avgPricePaid,
      current_yes_price: 0,
      current_no_price: 0,
      new_yes_price: 0,
      new_no_price: 0,
      price_impact: 0,
      quote_id: quote.quoteId,
      quote_timestamp: quote.quoteTimestamp,
    },
    duelId: quote.duelId,
    optionIndex: quote.optionIndex,
    bet: quote.optionLabel,
    duelType: quote.duelType,
    betAmount: quote.betAmountUsdc,
    betAmountUsdc: quote.betAmountUsdc,
    slippageBps: quote.slippageBps,
    collateralMode: quote.collateralMode,
    tokenDecimals: CREDITS_DECIMALS,
  };

  console.log("[DEBUG] placeBetFromQuote invoking SDK with payload:", JSON.stringify(payload, null, 2));

  try {
    const result = await sdk.user.placeBetFromEstimate(payload as any);
    console.log("[DEBUG] placeBetFromQuote SDK result:", JSON.stringify(result, null, 2));

    return {
      accepted: result.kind === "accepted",
      requestId: result.requestId,
      sharesOut: quote.sharesOut,
      stakeCredits: quote.stakeCredits,
      optionLabel: quote.optionLabel,
    };
  } catch (error) {
    console.error("[DEBUG] placeBetFromQuote SDK threw an error:", error);
    throw error;
  }
}

export type UserShares = { option0: number; option1: number };

/** Read the user's share balance in a specific market. */
export async function getUserShares(params: {
  duelId: string;
  managedAddress: string;
  bearer: string;
}): Promise<UserShares> {
  const sdk = getBentoSdk(params.bearer);
  const resp = await sdk.user.getUserShares({ duelId: params.duelId, address: params.managedAddress });
  return { option0: resp.shares?.option0 ?? 0, option1: resp.shares?.option1 ?? 0 };
}

/** Faucet amount the Bento testnet auto-mint grants per call. */
export const FAUCET_CREDITS = 1000;

export type MintResult = {
  success: boolean;
  message?: string;
  creditsMinted: number;
};

/**
 * Mint testnet USDC + credits to the managed account (Bento auto-mint faucet).
 * Retries once on the transient "replacement fee too low" nonce race.
 */
export async function mintTestnetFunds(managedAddress: string, bearer?: string): Promise<MintResult> {
  const sdk = getBentoSdk(bearer);
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = (await sdk.public.autoMint.mint({ userAddress: managedAddress })) as Json;
    if (r.success === true) {
      const message = typeof r.message === "string" ? r.message : undefined;
      const parsed = message?.match(/(\d+)\s*Credits/i);
      return {
        success: true,
        message,
        creditsMinted: parsed ? Number(parsed[1]) : FAUCET_CREDITS,
      };
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
  return { success: false, creditsMinted: 0 };
}

export type BentoSession = {
  token: string;
  managedAddress?: string;
  tokenExpiresAt?: Date;
};

type Json = Record<string, unknown>;

// The login response shape is not documented; probe likely field names.
function pickAddress(resp: Json, ...keys: string[]): string | undefined {
  const nested = (v: unknown) =>
    v && typeof v === "object" ? (v as Json) : undefined;
  const candidates: unknown[] = [
    ...keys.map((k) => resp[k]),
    nested(resp.user)?.managedAddress,
    nested(resp.user)?.address,
    nested(resp.account)?.address,
    nested(resp.managedAccount)?.address,
  ];
  return candidates.find(
    (v): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v),
  );
}

function decodeJwt(token: string): Json | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Json;
  } catch {
    return undefined;
  }
}

/**
 * Exchange a wallet signature for a Bento session. Tries login first, then
 * falls back to registering a new managed account for first-time wallets.
 */
export async function bentoLoginOrRegister(params: {
  address: string;
  signature: string;
  timestamp: string;
}): Promise<BentoSession> {
  const sdk = getBentoSdk();
  const { address, signature, timestamp } = params;

  let resp = (await sdk.public.auth.eoaLogin({ address, signature, timestamp })) as Json;

  // A first-time wallet logs in as { exists: false } (no token). Register it to
  // provision a Bento managed account.
  if (!resp.token && resp.exists === false) {
    const username = `bento_${address.slice(2, 8).toLowerCase()}${timestamp.slice(-4)}`;
    resp = (await sdk.public.auth.eoaRegister({ address, signature, timestamp, username })) as Json;
  }

  const token = typeof resp.token === "string" ? resp.token : "";
  const claims = token ? decodeJwt(token) : undefined;

  // Managed account address: user.address in the response, or the `address`
  // claim in the JWT (distinct from the signing eoaAddress).
  const managedAddress =
    pickAddress(resp, "managedAddress", "managed_address", "accountAddress") ??
    (claims && typeof claims.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(claims.address)
      ? claims.address
      : undefined);

  let tokenExpiresAt: Date | undefined;
  if (claims && typeof claims.exp === "number") tokenExpiresAt = new Date(claims.exp * 1000);
  else if (typeof resp.expiresIn === "number") tokenExpiresAt = new Date(Date.now() + resp.expiresIn * 1000);

  return { token, managedAddress, tokenExpiresAt };
}

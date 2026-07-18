import { verifyMessage } from "viem";
import {
  bentoLoginMessage,
  bentoLoginOrRegister,
  estimateBet,
  getMarket,
} from "@/lib/bento";
import { stashQuote } from "@/lib/agent/pending-bets";
import { toIndianE164 } from "@/lib/twilio-verify";
import { getUserByPhone } from "@/lib/user-links";

export const runtime = "nodejs";

const SIGNATURE_TTL_MS = 5 * 60 * 1000;
const QUOTE_TTL_SECONDS = 60;
const MAX_STAKE_CREDITS = 1_000_000;

function errorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "Bento could not price this bet.";
  const shaped = error as {
    message?: string;
    sdkError?: {
      message?: string;
      details?: { error?: string; message?: string };
    };
  };
  return shaped.sdkError?.details?.error
    ?? shaped.sdkError?.details?.message
    ?? shaped.sdkError?.message
    ?? shaped.message
    ?? "Bento could not price this bet.";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const phone = toIndianE164(body.phone);
    const address = typeof body.address === "string" ? body.address : "";
    const signature = typeof body.signature === "string" ? body.signature : "";
    const timestamp = typeof body.timestamp === "string" ? body.timestamp : "";
    const duelId = typeof body.duelId === "string" ? body.duelId : "";
    const optionIndex = body.optionIndex;
    const stakeCredits = body.stakeCredits;

    if (!phone) {
      return Response.json({ error: "Log in with the phone number linked to your Bento account first." }, { status: 401 });
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(address) || !/^0x[0-9a-fA-F]+$/.test(signature)) {
      return Response.json({ error: "Connect and sign with your linked wallet to get a live quote." }, { status: 401 });
    }
    const timestampNumber = Number(timestamp);
    if (!Number.isSafeInteger(timestampNumber) || Math.abs(Date.now() - timestampNumber) > SIGNATURE_TTL_MS) {
      return Response.json({ error: "That wallet signature has expired. Please request a new quote." }, { status: 401 });
    }
    if (!/^[0-9a-fA-F]{64}$/.test(duelId)) {
      return Response.json({ error: "Choose a valid duel." }, { status: 400 });
    }
    if (optionIndex !== 0 && optionIndex !== 1) {
      return Response.json({ error: "Choose one of the two outcomes." }, { status: 400 });
    }
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0 || stakeCredits > MAX_STAKE_CREDITS) {
      return Response.json({ error: "Enter a whole-number stake greater than zero." }, { status: 400 });
    }

    const linkedUser = await getUserByPhone(phone);
    if (!linkedUser) {
      return Response.json({ error: "This phone number is not linked to a Bento wallet yet." }, { status: 404 });
    }
    if (linkedUser.walletAddress.toLowerCase() !== address.toLowerCase()) {
      return Response.json(
        { error: "Switch MetaMask to the wallet linked to this phone number." },
        { status: 409 },
      );
    }

    const signatureValid = await verifyMessage({
      address: address as `0x${string}`,
      message: bentoLoginMessage(address, timestamp),
      signature: signature as `0x${string}`,
    }).catch(() => false);
    if (!signatureValid) {
      return Response.json({ error: "That wallet signature could not be verified." }, { status: 401 });
    }

    const [session, market] = await Promise.all([
      bentoLoginOrRegister({ address, signature, timestamp }),
      getMarket(duelId),
    ]);
    if (!session.token) {
      return Response.json({ error: "Bento could not open a betting session for this wallet." }, { status: 401 });
    }
    if (!market) {
      return Response.json({ error: "This duel is no longer available." }, { status: 404 });
    }
    if (market.collateralMode !== "credits") {
      return Response.json({ error: "Only play-credit duels can be bet from this page." }, { status: 400 });
    }
    if (
      linkedUser.managedAddress
      && session.managedAddress
      && linkedUser.managedAddress.toLowerCase() !== session.managedAddress.toLowerCase()
    ) {
      return Response.json(
        { error: "Bento opened a different account than the one holding your play credits. Relink your wallet." },
        { status: 409 },
      );
    }

    const quote = await estimateBet({ market, optionIndex, stakeCredits, bearer: session.token });
    const confirmationToken = stashQuote(phone, quote, session.token);

    return Response.json({
      confirmationToken,
      expiresInSeconds: QUOTE_TTL_SECONDS,
      duelId: quote.duelId,
      question: market.question,
      optionLabel: quote.optionLabel,
      stakeCredits: quote.stakeCredits,
      estimatedShares: quote.sharesOut,
      minSharesOut: quote.minSharesOut,
      avgPricePaid: quote.avgPricePaid,
    });
  } catch (error) {
    console.error("[bets] quote failure", error);
    return Response.json({ error: errorMessage(error) }, { status: 502 });
  }
}

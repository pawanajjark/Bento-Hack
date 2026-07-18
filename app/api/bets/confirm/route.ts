import { placeBetFromQuote } from "@/lib/bento";
import { takeQuote } from "@/lib/agent/pending-bets";
import { toIndianE164 } from "@/lib/twilio-verify";

export const runtime = "nodejs";

function errorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "Bento could not place this bet.";
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
    ?? "Bento could not place this bet.";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const phone = toIndianE164(body.phone);
    const confirmationToken = typeof body.confirmationToken === "string" ? body.confirmationToken : "";

    if (!phone || !/^[0-9a-f]{32}$/.test(confirmationToken)) {
      return Response.json({ error: "This confirmation is invalid. Get a fresh quote and try again." }, { status: 400 });
    }

    const pending = takeQuote(phone, confirmationToken);
    if (!pending.ok || !pending.bearer) {
      return Response.json(
        { error: "This quote expired or was already used. Get a fresh quote before confirming." },
        { status: 409 },
      );
    }

    const result = await placeBetFromQuote({ quote: pending.quote, bearer: pending.bearer });
    return Response.json(result, { status: result.accepted ? 202 : 502 });
  } catch (error) {
    console.error("[bets] placement failure", error);
    return Response.json({ error: errorMessage(error) }, { status: 502 });
  }
}

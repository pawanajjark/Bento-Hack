import { estimateBet, getMarket } from "@/lib/bento";
import { badRequest, fail } from "../_shared";

export const runtime = "nodejs";

const MAX_STAKE_CREDITS = 1_000_000;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const duelId = typeof body.duelId === "string" ? body.duelId : "";
    const optionIndex = body.optionIndex;
    const stakeCredits = body.stakeCredits;
    const bearer = typeof body.bearer === "string" ? body.bearer : "";

    if (!duelId) return badRequest("duelId is required.");
    if (optionIndex !== 0 && optionIndex !== 1) return badRequest("optionIndex must be 0 or 1.");
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0 || stakeCredits > MAX_STAKE_CREDITS) {
      return badRequest("stakeCredits must be a positive whole number.");
    }
    if (!bearer) return badRequest("bearer is required — log in first.");

    const market = await getMarket(duelId);
    if (!market) return Response.json({ error: "Market not found." }, { status: 404 });

    const quote = await estimateBet({ market, optionIndex, stakeCredits, bearer });
    return Response.json({ quote });
  } catch (error) {
    return fail(error);
  }
}

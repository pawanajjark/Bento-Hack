import { placeBetFromQuote, type BetQuote } from "@/lib/bento";
import { badRequest, fail } from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const quote = body.quote as BetQuote | undefined;
    const bearer = typeof body.bearer === "string" ? body.bearer : "";

    if (!quote || typeof quote.quoteId !== "string") return badRequest("quote (from /api/tester/estimate) is required.");
    if (!bearer) return badRequest("bearer is required — log in first.");

    const result = await placeBetFromQuote({ quote, bearer });
    return Response.json(result, { status: result.accepted ? 202 : 502 });
  } catch (error) {
    return fail(error);
  }
}

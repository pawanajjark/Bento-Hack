import { getMarket } from "@/lib/bento";
import { badRequest, fail } from "../_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const duelId = url.searchParams.get("duelId") ?? "";
    if (!duelId) return badRequest("duelId query param is required.");

    const market = await getMarket(duelId);
    if (!market) return Response.json({ error: "Market not found." }, { status: 404 });
    return Response.json({ market });
  } catch (error) {
    return fail(error);
  }
}

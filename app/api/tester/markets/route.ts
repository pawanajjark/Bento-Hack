import { listMarkets } from "@/lib/bento";
import { fail } from "../_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("query") ?? undefined;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;

    const markets = await listMarkets({ query, limit });
    return Response.json({ markets, count: markets.length });
  } catch (error) {
    return fail(error);
  }
}

import { getUserShares } from "@/lib/bento";
import { badRequest, fail } from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const duelId = typeof body.duelId === "string" ? body.duelId : "";
    const managedAddress = typeof body.managedAddress === "string" ? body.managedAddress : "";
    const bearer = typeof body.bearer === "string" ? body.bearer : "";

    if (!duelId) return badRequest("duelId is required.");
    if (!/^0x[0-9a-fA-F]{40}$/.test(managedAddress)) return badRequest("managedAddress is required.");
    if (!bearer) return badRequest("bearer is required — log in first.");

    const shares = await getUserShares({ duelId, managedAddress, bearer });
    return Response.json({ shares });
  } catch (error) {
    return fail(error);
  }
}

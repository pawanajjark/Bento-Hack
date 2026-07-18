import { mintTestnetFunds } from "@/lib/bento";
import { badRequest, fail } from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const managedAddress = typeof body.managedAddress === "string" ? body.managedAddress : "";
    const bearer = typeof body.bearer === "string" ? body.bearer : undefined;

    if (!/^0x[0-9a-fA-F]{40}$/.test(managedAddress)) return badRequest("managedAddress is required.");

    const result = await mintTestnetFunds(managedAddress, bearer);
    return Response.json(result);
  } catch (error) {
    return fail(error);
  }
}

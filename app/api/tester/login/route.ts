import { bentoLoginOrRegister } from "@/lib/bento";
import { badRequest, fail } from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const address = typeof body.address === "string" ? body.address : "";
    const signature = typeof body.signature === "string" ? body.signature : "";
    const timestamp = typeof body.timestamp === "string" ? body.timestamp : "";

    if (!/^0x[0-9a-fA-F]{40}$/.test(address) || !signature || !/^\d{10,}$/.test(timestamp)) {
      return badRequest("address, signature, and timestamp are required.");
    }

    const session = await bentoLoginOrRegister({ address, signature, timestamp });
    if (!session.token) {
      return Response.json({ error: "Bento did not return a session token." }, { status: 502 });
    }
    return Response.json(session);
  } catch (error) {
    return fail(error);
  }
}

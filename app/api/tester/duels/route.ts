import { listAllDuels } from "@/lib/bento";
import { fail } from "../_shared";

export const runtime = "nodejs";

export async function GET() {
  try {
    const duels = await listAllDuels();
    return Response.json({ duels, count: duels.length });
  } catch (error) {
    return fail(error);
  }
}

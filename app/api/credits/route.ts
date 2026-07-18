import { toIndianE164 } from "@/lib/twilio-verify";
import { getUserByPhone, addCredits } from "@/lib/user-links";
import { mintTestnetFunds } from "@/lib/bento";
import { decryptToken } from "@/lib/secure";

export const runtime = "nodejs";

// GET /api/credits?phone=98765XXXXX -> current cached credit balance
export async function GET(request: Request) {
  const phone = new URL(request.url).searchParams.get("phone");
  const to = toIndianE164(phone);
  if (!to) {
    return Response.json({ error: "Invalid phone number." }, { status: 400 });
  }

  const user = await getUserByPhone(to);
  if (!user) {
    return Response.json({ error: "This number is not linked yet." }, { status: 404 });
  }

  return Response.json({
    balance: user.creditsBalance ?? 0,
    managedAddress: user.managedAddress ?? null,
  });
}

// POST /api/credits { phone } -> mint testnet credits to the managed account
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const to = toIndianE164(body.phone);
    if (!to) {
      return Response.json({ error: "Invalid phone number." }, { status: 400 });
    }

    const user = await getUserByPhone(to);
    if (!user?.managedAddress) {
      return Response.json(
        { error: "No Bento account is linked to this number yet." },
        { status: 400 },
      );
    }

    const bearer = user.bentoTokenEncrypted ? decryptToken(user.bentoTokenEncrypted) : undefined;
    const result = await mintTestnetFunds(user.managedAddress, bearer);

    if (!result.success) {
      return Response.json(
        { error: "The faucet is busy. Please try again in a moment." },
        { status: 502 },
      );
    }

    const balance = await addCredits(to, result.creditsMinted);
    return Response.json({ ok: true, balance, minted: result.creditsMinted });
  } catch (error) {
    console.error("[credits] load failed", error);
    return Response.json({ error: "Could not load credits. Please try again." }, { status: 500 });
  }
}

import { verifyMessage } from "viem";
import { toIndianE164 } from "@/lib/twilio-verify";
import { linkWallet } from "@/lib/user-links";
import { bentoLoginMessage, bentoLoginOrRegister } from "@/lib/bento";
import { encryptToken } from "@/lib/secure";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const to = toIndianE164(body.phone);
    const address = typeof body.address === "string" ? body.address : "";
    const timestamp = typeof body.timestamp === "string" ? body.timestamp : "";
    const signature = typeof body.signature === "string" ? body.signature : "";

    if (!to) {
      return Response.json({ error: "Verify your phone number first." }, { status: 400 });
    }
    if (
      !/^0x[0-9a-fA-F]{40}$/.test(address) ||
      !/^\d{10,}$/.test(timestamp) ||
      !/^0x[0-9a-fA-F]+$/.test(signature)
    ) {
      return Response.json({ error: "The wallet signature was incomplete." }, { status: 400 });
    }

    // Reconstruct the exact signed message server-side so the client can't
    // substitute a different one, then verify the signature against it.
    const message = bentoLoginMessage(address, timestamp);
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    }).catch(() => false);

    if (!valid) {
      return Response.json({ error: "That wallet signature could not be verified." }, { status: 401 });
    }

    // Exchange the signature for a Bento session (managed account + JWT).
    // Best-effort: the plaintext phone->wallet mapping is always stored so the demo can
    // proceed even if Bento auth is unavailable.
    let bentoLinked = false;
    try {
      const session = await bentoLoginOrRegister({ address, signature, timestamp });
      await linkWallet(to, address, {
        managedAddress: session.managedAddress,
        bentoTokenEncrypted: session.token ? encryptToken(session.token) : undefined,
        tokenExpiresAt: session.tokenExpiresAt,
      });
      bentoLinked = Boolean(session.token);
    } catch (bentoError) {
      console.error("[auth/link] Bento auth failed; stored mapping only:", bentoError);
      await linkWallet(to, address);
    }

    return Response.json({ ok: true, bentoLinked });
  } catch (error) {
    console.error("[auth/link] failure", error);
    return Response.json(
      { error: "We couldn't link your wallet. Please try again." },
      { status: 500 },
    );
  }
}

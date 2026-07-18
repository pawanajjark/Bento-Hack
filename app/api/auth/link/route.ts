import { verifyMessage } from "viem";
import { toIndianE164 } from "@/lib/twilio-verify";
import { linkWallet } from "@/lib/user-links";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const to = toIndianE164(body.phone);
    const address = typeof body.address === "string" ? body.address : "";
    const message = typeof body.message === "string" ? body.message : "";
    const signature = typeof body.signature === "string" ? body.signature : "";

    if (!to) {
      return Response.json({ error: "Verify your phone number first." }, { status: 400 });
    }
    if (
      !/^0x[0-9a-fA-F]{40}$/.test(address) ||
      !message ||
      !/^0x[0-9a-fA-F]+$/.test(signature)
    ) {
      return Response.json({ error: "The wallet signature was incomplete." }, { status: 400 });
    }

    // verifyMessage throws on malformed signatures; treat any failure as invalid.
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    }).catch(() => false);

    if (!valid) {
      return Response.json({ error: "That wallet signature could not be verified." }, { status: 401 });
    }

    // TODO: exchange the wallet signature for a Bento user JWT + managed-account
    // address via @bento.fun/sdk, persist an encrypted Bento session, and pass
    // the managed address to linkWallet() as the third argument.
    await linkWallet(to, address);

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[auth/link] failure", error);
    return Response.json(
      { error: "We couldn't link your wallet. Please try again." },
      { status: 500 },
    );
  }
}

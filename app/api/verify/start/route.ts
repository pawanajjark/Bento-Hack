import {
  getTwilioCaller,
  toIndianE164,
  verificationErrorResponse,
} from "@/lib/twilio-verify";
import { generateCode, storeCode } from "@/lib/otp-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const to = toIndianE164(body.phone);

    if (!to) {
      return Response.json({ error: "Enter a valid 10-digit Indian mobile number." }, { status: 400 });
    }

    // Demo numbers: skip the real call entirely (verify with OTP_BYPASS_CODE).
    const bypassNumbers = (process.env.OTP_BYPASS_NUMBERS ?? "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    if (bypassNumbers.includes(String(body.phone))) {
      console.log("[twilio-call] skipped (bypass number)", { to });
      return Response.json({ ok: true, status: "bypass" });
    }

    const code = generateCode();
    const spoken = code.split("").join(", ");
    const twiml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>` +
      `<Pause length="1"/>` +
      `<Say voice="alice">Welcome to Bento Hotline. Your verification code is ${spoken}.</Say>` +
      `<Pause length="1"/>` +
      `<Say voice="alice">Once more. Your code is ${spoken}. Goodbye.</Say>` +
      `</Response>`;

    const { client, from } = getTwilioCaller();
    const call = await client.calls.create({ to, from, twiml });

    // Store only after the call is accepted for delivery.
    storeCode(to, code);

    console.log("[twilio-call] placed", { sid: call.sid, status: call.status, to });

    return Response.json({ ok: true, status: call.status });
  } catch (error) {
    return verificationErrorResponse(error);
  }
}

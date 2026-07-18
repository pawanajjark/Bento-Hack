import { toIndianE164, verificationErrorResponse } from "@/lib/twilio-verify";
import { checkCode } from "@/lib/otp-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const to = toIndianE164(body.phone);
    const code = typeof body.code === "string" ? body.code : "";

    if (!to || !/^\d{6}$/.test(code)) {
      return Response.json({ error: "Enter the six-digit code from the call." }, { status: 400 });
    }

    // Demo bypass: skip the real code check when a configured bypass code is entered.
    const bypass = process.env.OTP_BYPASS_CODE;
    if (bypass && code === bypass) {
      return Response.json({ ok: true });
    }

    const result = checkCode(to, code);

    if (result === "approved") {
      return Response.json({ ok: true });
    }

    if (result === "too_many") {
      return Response.json({ error: "Too many incorrect attempts. Request a new code." }, { status: 429 });
    }

    if (result === "expired") {
      return Response.json({ error: "That code has expired. Request a new code." }, { status: 400 });
    }

    return Response.json({ error: "That code is incorrect." }, { status: 400 });
  } catch (error) {
    return verificationErrorResponse(error);
  }
}

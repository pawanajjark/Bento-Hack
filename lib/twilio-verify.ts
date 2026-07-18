import twilio, { Twilio } from "twilio";

let client: Twilio | null = null;

export function getTwilioVerifyClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!accountSid || !authToken || !serviceSid) {
    throw new Error("TWILIO_VERIFY_NOT_CONFIGURED");
  }

  client ??= twilio(accountSid, authToken);
  return { client, serviceSid };
}

export function getTwilioCaller() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_CALLER_NUMBER;

  if (!accountSid || !authToken || !from) {
    throw new Error("TWILIO_VERIFY_NOT_CONFIGURED");
  }

  client ??= twilio(accountSid, authToken);
  return { client, from };
}

export function toIndianE164(phone: unknown) {
  if (typeof phone !== "string" || !/^[6-9]\d{9}$/.test(phone)) return null;
  return `+91${phone}`;
}

export function verificationErrorResponse(error: unknown) {
  if (error instanceof Error && error.message === "TWILIO_VERIFY_NOT_CONFIGURED") {
    return Response.json(
      { error: "Phone verification is not configured yet." },
      { status: 503 },
    );
  }

  const code = typeof error === "object" && error !== null && "code" in error
    ? Number(error.code)
    : undefined;

  const message = typeof error === "object" && error !== null && "message" in error
    ? String((error as { message: unknown }).message)
    : undefined;
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status: unknown }).status)
    : undefined;
  console.error("[twilio-verify] failure", { code, status, message });

  if (code === 60202) {
    return Response.json(
      { error: "Too many call attempts. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  if (code === 60203) {
    return Response.json(
      { error: "Too many incorrect attempts. Request a new code." },
      { status: 429 },
    );
  }

  if (code === 60410) {
    return Response.json(
      { error: "Calls to this country are not enabled in Twilio Verify." },
      { status: 403 },
    );
  }

  return Response.json(
    { error: "Twilio could not complete the verification request. Please try again." },
    { status: 502 },
  );
}

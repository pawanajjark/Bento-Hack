import { verifyMessage } from "viem";
import { toIndianE164 } from "@/lib/twilio-verify";
import { getUserByPhone } from "@/lib/user-links";
import {
  bentoLoginMessage,
  bentoLoginOrRegister,
  createDuel,
  listAllDuels,
} from "@/lib/bento";
import { validateDuelSchedule } from "@/lib/duel-schedule";

export const runtime = "nodejs";

const BENTO_CATEGORIES = new Set([
  "Cricket",
  "Football",
  "Basketball",
  "American Football",
  "Tennis",
  "Baseball",
  "Hockey",
  "Formula 1",
]);

type BentoErrorShape = {
  sdkError?: {
    status?: number;
    message?: string;
    details?: { error?: string; message?: string };
    correlationId?: string;
    requestId?: string;
  };
};

function bentoErrorDetails(error: unknown) {
  const shaped = error && typeof error === "object" ? error as BentoErrorShape : null;
  const sdkError = shaped?.sdkError;
  const message =
    sdkError?.details?.error ??
    sdkError?.details?.message ??
    sdkError?.message ??
    (error instanceof Error ? error.message : "Unexpected error");
  return {
    message,
    status: sdkError?.status,
    reference: sdkError?.correlationId ?? sdkError?.requestId,
  };
}

function messageFor(error: unknown) {
  const { message, reference } = bentoErrorDetails(error);
  if (message.includes("BENTO_NOT_CONFIGURED")) {
    return "Bento is not configured yet. Add the Bento URL and Builder API key to publish live duels.";
  }
  if (message.includes("Pre-flight simulation failed")) {
    const suffix = reference ? ` Reference: ${reference}.` : "";
    return `Your schedule passed validation, but Bento rejected the on-chain creation simulation. Confirm that the linked managed account is funded, then retry. If it still fails, share this with Bento support.${suffix}`;
  }
  return message;
}

export async function GET() {
  try {
    const duels = await listAllDuels();
    return Response.json({ duels, source: "bento" });
  } catch (error) {
    console.error("[duels] catalog failure", error);
    return Response.json({ error: messageFor(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const address = typeof body.address === "string" ? body.address : "";
    const timestamp = typeof body.timestamp === "string" ? body.timestamp : "";
    const signature = typeof body.signature === "string" ? body.signature : "";
    const phone = toIndianE164(body.phone);
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const optionA = typeof body.optionA === "string" ? body.optionA.trim() : "";
    const optionB = typeof body.optionB === "string" ? body.optionB.trim() : "";
    const startTime = typeof body.startTime === "string" ? body.startTime : "";
    const endTime = typeof body.endTime === "string" ? body.endTime : "";

    if (question.length < 10 || question.length > 180) {
      return Response.json({ error: "Write a clear question between 10 and 180 characters." }, { status: 400 });
    }
    if (!BENTO_CATEGORIES.has(category) || !optionA || !optionB || optionA === optionB) {
      return Response.json({ error: "Choose a category and two different outcomes." }, { status: 400 });
    }
    const schedule = validateDuelSchedule(startTime, endTime);
    if (!schedule.valid) {
      return Response.json({ error: schedule.error }, { status: 400 });
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(address) || !/^0x[0-9a-fA-F]+$/.test(signature)) {
      return Response.json({ error: "Connect and sign with your wallet to publish this duel." }, { status: 401 });
    }
    if (!/^\d{10,}$/.test(timestamp)) {
      return Response.json({ error: "The wallet signature has expired or is incomplete." }, { status: 400 });
    }

    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message: bentoLoginMessage(address, timestamp),
      signature: signature as `0x${string}`,
    }).catch(() => false);
    if (!valid) {
      return Response.json({ error: "That wallet signature could not be verified." }, { status: 401 });
    }

    const linkedUser = phone ? await getUserByPhone(phone) : null;
    if (linkedUser && linkedUser.walletAddress.toLowerCase() !== address.toLowerCase()) {
      return Response.json(
        { error: "This wallet is not the wallet linked to your play-credit account. Switch accounts and try again." },
        { status: 409 },
      );
    }

    const session = await bentoLoginOrRegister({ address, signature, timestamp });
    if (!session.token) {
      return Response.json({ error: "Bento could not open a creator session for this wallet." }, { status: 401 });
    }
    if (
      linkedUser?.managedAddress &&
      session.managedAddress &&
      linkedUser.managedAddress.toLowerCase() !== session.managedAddress.toLowerCase()
    ) {
      return Response.json(
        { error: "Bento opened a different managed account than the one holding your play credits. Relink this wallet from the home page." },
        { status: 409 },
      );
    }

    const result = await createDuel({
      bearer: session.token,
      question,
      category,
      description: description || undefined,
      optionA,
      optionB,
      startTime: schedule.startDate.toISOString(),
      endTime: schedule.endDate.toISOString(),
    });

    return Response.json({ ...result, accepted: true }, { status: 202 });
  } catch (error) {
    console.error("[duels] creation failure", error);
    const message = messageFor(error);
    const bentoError = bentoErrorDetails(error);
    const isValidationError =
      message.includes("must be") ||
      message.includes("must have") ||
      message.includes("invalid") ||
      message.includes("future");
    const status = isValidationError ? 400 : bentoError.status ? 502 : 500;
    return Response.json({ error: message }, { status });
  }
}

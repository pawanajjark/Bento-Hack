import { createDuel } from "@/lib/bento";
import { validateDuelSchedule } from "@/lib/duel-schedule";
import { badRequest, fail } from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const optionA = typeof body.optionA === "string" ? body.optionA.trim() : "";
    const optionB = typeof body.optionB === "string" ? body.optionB.trim() : "";
    const startTime = typeof body.startTime === "string" ? body.startTime : "";
    const endTime = typeof body.endTime === "string" ? body.endTime : "";
    const bearer = typeof body.bearer === "string" ? body.bearer : "";

    if (question.length < 10 || question.length > 180) return badRequest("question must be 10-180 characters.");
    if (!category || !optionA || !optionB || optionA === optionB) return badRequest("category and two different outcomes are required.");
    if (!bearer) return badRequest("bearer is required — log in first.");

    const schedule = validateDuelSchedule(startTime, endTime);
    if (!schedule.valid) return badRequest(schedule.error);

    const result = await createDuel({
      bearer,
      question,
      category,
      description: description || undefined,
      optionA,
      optionB,
      startTime: schedule.startDate.toISOString(),
      endTime: schedule.endDate.toISOString(),
    });

    return Response.json(result, { status: 202 });
  } catch (error) {
    return fail(error);
  }
}

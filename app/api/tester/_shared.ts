/** Shared helpers for the /api/tester/* dev-console routes. Not a route itself. */

type BentoErrorShape = {
  message?: string;
  sdkError?: {
    message?: string;
    details?: { error?: string; message?: string };
  };
};

export function errorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : "Unexpected error.";
  }
  const shaped = error as BentoErrorShape;
  return (
    shaped.sdkError?.details?.error ??
    shaped.sdkError?.details?.message ??
    shaped.sdkError?.message ??
    shaped.message ??
    "Unexpected error."
  );
}

export function fail(error: unknown, status = 502) {
  console.error("[tester]", error);
  return Response.json({ error: errorMessage(error) }, { status });
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

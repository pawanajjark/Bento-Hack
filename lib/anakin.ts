const ANAKIN_SEARCH_URL = "https://api.anakin.io/v1/search";
const SEARCH_TIMEOUT_MS = 20_000;

export type AnakinSearchResult = {
  title: string;
  url: string;
  snippet: string;
  date?: string;
  lastUpdated?: string;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Search the web through Anakin's synchronous Search API. */
export async function searchAnakin(prompt: string, limit = 5): Promise<AnakinSearchResult[]> {
  const apiKey = process.env.ANAKIN_API_KEY;
  if (!apiKey) throw new Error("ANAKIN_NOT_CONFIGURED");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(ANAKIN_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        prompt,
        limit: Math.min(Math.max(Math.trunc(limit), 1), 20),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ANAKIN_SEARCH_FAILED_${response.status}`);
    }

    const payload: unknown = await response.json();
    const root = record(payload);
    const results = Array.isArray(root?.results) ? root.results : [];

    return results.flatMap((value): AnakinSearchResult[] => {
      const item = record(value);
      if (!item || typeof item.title !== "string" || typeof item.url !== "string") return [];
      return [{
        title: item.title,
        url: item.url,
        snippet: typeof item.snippet === "string" ? item.snippet : "",
        ...(typeof item.date === "string" ? { date: item.date } : {}),
        ...(typeof item.last_updated === "string" ? { lastUpdated: item.last_updated } : {}),
      }];
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("ANAKIN_SEARCH_TIMED_OUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

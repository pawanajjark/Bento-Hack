import { randomBytes } from "node:crypto";
import type { BetQuote } from "@/lib/bento";

// In-memory pending-quote store bridging prepare_prediction -> confirm_prediction.
// Fine for a single-process hackathon/dev server; move to Redis before scaling out.
type Entry = { quote: BetQuote; phone: string; expiresAt: number };

const store = new Map<string, Entry>();
const TTL_MS = 60 * 1000; // Quotes go stale fast; match the spoken "60 seconds".

function sweep() {
  const now = Date.now();
  for (const [token, entry] of store) {
    if (now > entry.expiresAt) store.delete(token);
  }
}

export function stashQuote(phone: string, quote: BetQuote): string {
  sweep();
  const token = randomBytes(16).toString("hex");
  store.set(token, { quote, phone, expiresAt: Date.now() + TTL_MS });
  return token;
}

export type TakeResult =
  | { ok: true; quote: BetQuote }
  | { ok: false; reason: "not_found" | "expired" | "mismatch" };

/**
 * One-shot retrieval: a valid token is consumed so a confirmation can't replay.
 * Scoped to the phone that created it so a stray token can't cross sessions.
 */
export function takeQuote(phone: string, token: string): TakeResult {
  const entry = store.get(token);
  if (!entry) return { ok: false, reason: "not_found" };
  store.delete(token);
  if (Date.now() > entry.expiresAt) return { ok: false, reason: "expired" };
  if (entry.phone !== phone) return { ok: false, reason: "mismatch" };
  return { ok: true, quote: entry.quote };
}

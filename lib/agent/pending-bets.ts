import { randomBytes } from "node:crypto";
import type { BetQuote } from "@/lib/bento";

// In-memory pending-quote store bridging prepare_prediction -> confirm_prediction.
// Fine for a single-process hackathon/dev server; move to Redis before scaling out.
type Entry = { quote: BetQuote; phone: string; expiresAt: number; bearer?: string };

const store = new Map<string, Entry>();
const latestTokenByPhone = new Map<string, string>();
const TTL_MS = 60 * 1000; // Quotes go stale fast; match the spoken "60 seconds".

function deleteEntry(token: string, entry: Entry) {
  store.delete(token);
  if (latestTokenByPhone.get(entry.phone) === token) {
    latestTokenByPhone.delete(entry.phone);
  }
}

function sweep() {
  const now = Date.now();
  for (const [token, entry] of store) {
    if (now > entry.expiresAt) deleteEntry(token, entry);
  }
}

export function stashQuote(phone: string, quote: BetQuote, bearer?: string): string {
  sweep();

  // A caller can only have one prediction awaiting confirmation. Preparing a
  // replacement quote invalidates the previous one, matching the confirmation
  // state machine and making voice confirmations unambiguous.
  const previousToken = latestTokenByPhone.get(phone);
  if (previousToken) {
    const previousEntry = store.get(previousToken);
    if (previousEntry) deleteEntry(previousToken, previousEntry);
  }

  const token = randomBytes(16).toString("hex");
  store.set(token, { quote, phone, expiresAt: Date.now() + TTL_MS, bearer });
  latestTokenByPhone.set(phone, token);
  return token;
}

export type TakeResult =
  | { ok: true; quote: BetQuote; bearer?: string }
  | { ok: false; reason: "not_found" | "expired" | "mismatch" };

/**
 * One-shot retrieval: a valid token is consumed so a confirmation can't replay.
 * Scoped to the phone that created it so a stray token can't cross sessions.
 */
export function takeQuote(phone: string, token: string): TakeResult {
  const entry = store.get(token);
  if (!entry) return { ok: false, reason: "not_found" };
  if (Date.now() > entry.expiresAt) {
    deleteEntry(token, entry);
    return { ok: false, reason: "expired" };
  }
  if (entry.phone !== phone) return { ok: false, reason: "mismatch" };
  deleteEntry(token, entry);
  return { ok: true, quote: entry.quote, bearer: entry.bearer };
}

/**
 * Consumes the caller's current pending quote without exposing its opaque token
 * to the model. The caller scope and one-live-quote invariant provide the same
 * replay and cross-session protections as token retrieval.
 */
export function takeLatestQuote(phone: string): TakeResult {
  sweep();
  const token = latestTokenByPhone.get(phone);
  if (!token) return { ok: false, reason: "not_found" };
  return takeQuote(phone, token);
}

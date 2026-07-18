import { randomBytes } from "node:crypto";
import type { CreateDuelInput } from "@/lib/bento";

// In-memory pending-duel store bridging prepare_create_duel -> confirm_create_duel.
// Mirrors pending-bets.ts; fine for a single-process dev server.
type Entry = { input: CreateDuelInput; phone: string; expiresAt: number };

const store = new Map<string, Entry>();
const TTL_MS = 5 * 60 * 1000; // No price to go stale, but don't let old setups linger forever.

function sweep() {
  const now = Date.now();
  for (const [token, entry] of store) {
    if (now > entry.expiresAt) store.delete(token);
  }
}

export function stashDuel(phone: string, input: CreateDuelInput): string {
  sweep();
  const token = randomBytes(16).toString("hex");
  store.set(token, { input, phone, expiresAt: Date.now() + TTL_MS });
  return token;
}

export type TakeDuelResult =
  | { ok: true; input: CreateDuelInput }
  | { ok: false; reason: "not_found" | "expired" | "mismatch" };

/**
 * One-shot retrieval: a valid token is consumed so a confirmation can't replay.
 * Scoped to the phone that created it so a stray token can't cross sessions.
 */
export function takeDuel(phone: string, token: string): TakeDuelResult {
  const entry = store.get(token);
  if (!entry) return { ok: false, reason: "not_found" };
  store.delete(token);
  if (Date.now() > entry.expiresAt) return { ok: false, reason: "expired" };
  if (entry.phone !== phone) return { ok: false, reason: "mismatch" };
  return { ok: true, input: entry.input };
}

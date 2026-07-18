import { randomInt } from "node:crypto";

type Entry = { code: string; expiresAt: number; attempts: number };

// In-memory store. Fine for a single-process hackathon/dev server.
// Move to Redis (or similar) before running multiple instances.
const store = new Map<string, Entry>();

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function storeCode(phone: string, code: string): void {
  store.set(phone, { code, expiresAt: Date.now() + TTL_MS, attempts: 0 });
}

export type CheckResult = "approved" | "invalid" | "expired" | "too_many";

export function checkCode(phone: string, code: string): CheckResult {
  const entry = store.get(phone);
  if (!entry) return "invalid";

  if (Date.now() > entry.expiresAt) {
    store.delete(phone);
    return "expired";
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    store.delete(phone);
    return "too_many";
  }

  entry.attempts += 1;

  if (entry.code !== code) return "invalid";

  store.delete(phone);
  return "approved";
}

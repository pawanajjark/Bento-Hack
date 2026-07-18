import { createHash } from "node:crypto";
import { getDb } from "./mongodb";

const COLLECTION = "user_links";

export type UserLink = {
  phoneHash: string;
  walletAddress: string;
  managedAddress?: string;
  createdAt: Date;
  updatedAt: Date;
};

// Phone numbers are stored only as a salted hash, never in plaintext.
function hashPhone(e164: string): string {
  const salt = process.env.PHONE_HASH_SALT ?? "";
  return createHash("sha256").update(`${salt}:${e164}`).digest("hex");
}

/** Upsert the phone -> wallet mapping. Returns the phone hash used as the key. */
export async function linkWallet(
  e164Phone: string,
  walletAddress: string,
  managedAddress?: string,
): Promise<string> {
  const db = await getDb();
  const phoneHash = hashPhone(e164Phone);
  const now = new Date();

  await db.collection<UserLink>(COLLECTION).updateOne(
    { phoneHash },
    {
      $set: {
        walletAddress: walletAddress.toLowerCase(),
        ...(managedAddress ? { managedAddress: managedAddress.toLowerCase() } : {}),
        updatedAt: now,
      },
      $setOnInsert: { phoneHash, createdAt: now },
    },
    { upsert: true },
  );

  return phoneHash;
}

/** Look up a linked user by phone (used by the voice gateway on inbound calls). */
export async function getUserByPhone(e164Phone: string): Promise<UserLink | null> {
  const db = await getDb();
  return db.collection<UserLink>(COLLECTION).findOne({ phoneHash: hashPhone(e164Phone) });
}

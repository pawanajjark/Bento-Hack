import { getDb } from "./mongodb";

const COLLECTION = "user_links";

export type UserLink = {
  phoneNumber: string;
  walletAddress: string;
  managedAddress?: string;
  bentoTokenEncrypted?: string;
  tokenExpiresAt?: Date;
  // Cached credit balance. Accurate while minting is the only balance change;
  // replace with an on-chain read once betting spends credits.
  creditsBalance?: number;
  createdAt: Date;
  updatedAt: Date;
};

export type LinkExtras = {
  managedAddress?: string;
  bentoTokenEncrypted?: string;
  tokenExpiresAt?: Date;
};

/** Upsert the plaintext E.164 phone -> wallet mapping. */
export async function linkWallet(
  e164Phone: string,
  walletAddress: string,
  extras: LinkExtras = {},
): Promise<string> {
  const db = await getDb();
  const now = new Date();

  await db.collection<UserLink>(COLLECTION).updateOne(
    { phoneNumber: e164Phone },
    {
      $set: {
        walletAddress: walletAddress.toLowerCase(),
        ...(extras.managedAddress ? { managedAddress: extras.managedAddress.toLowerCase() } : {}),
        ...(extras.bentoTokenEncrypted ? { bentoTokenEncrypted: extras.bentoTokenEncrypted } : {}),
        ...(extras.tokenExpiresAt ? { tokenExpiresAt: extras.tokenExpiresAt } : {}),
        updatedAt: now,
      },
      $setOnInsert: { phoneNumber: e164Phone, createdAt: now },
    },
    { upsert: true },
  );

  return e164Phone;
}

/** Look up a linked user by phone (used by the voice gateway on inbound calls). */
export async function getUserByPhone(e164Phone: string): Promise<UserLink | null> {
  const db = await getDb();
  console.log(`[DB Debug] getUserByPhone called with: "${e164Phone}"`);

  const user = await db.collection<UserLink>(COLLECTION).findOne({ phoneNumber: e164Phone });

  if (user) {
    console.log(`[DB Debug] User found for "${e164Phone}":`, user.walletAddress);
  } else {
    console.log(`[DB Debug] No user found for "${e164Phone}". Let's check what IS in the DB...`);
    const allUsers = await db.collection<UserLink>(COLLECTION).find({}, { projection: { phoneNumber: 1 } }).toArray();
    console.log(`[DB Debug] Existing phones in DB:`, allUsers.map(u => `"${u.phoneNumber}"`));
  }

  return user;
}

/** Increment the cached credit balance and return the new total. */
export async function addCredits(e164Phone: string, amount: number): Promise<number> {
  const db = await getDb();
  const result = await db.collection<UserLink>(COLLECTION).findOneAndUpdate(
    { phoneNumber: e164Phone },
    { $inc: { creditsBalance: amount }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return result?.creditsBalance ?? 0;
}

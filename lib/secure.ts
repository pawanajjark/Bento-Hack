import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

// AES-256-GCM at-rest encryption for Bento session tokens (PRD §18).
// Key derived from BENTO_TOKEN_ENC_KEY, falling back to PHONE_HASH_SALT.
function key(): Buffer {
  const secret = process.env.BENTO_TOKEN_ENC_KEY || process.env.PHONE_HASH_SALT;
  if (!secret) throw new Error("TOKEN_ENC_KEY_MISSING");
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptToken(payload: string): string {
  const [ivB, tagB, dataB] = payload.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
}

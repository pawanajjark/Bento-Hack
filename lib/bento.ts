import { createBentoSdk, walletAuthProvider } from "@bento.fun/sdk";

/** The exact message a wallet must sign for Bento EOA login (see EoaLoginDto). */
export function bentoLoginMessage(address: string, timestamp: string): string {
  return `Bento.fun Login\nTimestamp: ${timestamp}\nWallet: ${address}`;
}

function getBentoSdk() {
  const baseUrl = process.env.BENTO_URL;
  if (!baseUrl) throw new Error("BENTO_NOT_CONFIGURED");
  const apiKey = process.env.BENTO_BUILDER_API_KEY;

  return createBentoSdk({
    baseUrl,
    ...(apiKey ? { headers: { "x-builder-api-key": apiKey } } : {}),
    // Login/register are public routes; no wallet headers needed for them.
    auth: walletAuthProvider(() => ({})),
  });
}

export type BentoSession = {
  token: string;
  managedAddress?: string;
  tokenExpiresAt?: Date;
};

type Json = Record<string, unknown>;

// The login response shape is not documented; probe likely field names.
function pickAddress(resp: Json, ...keys: string[]): string | undefined {
  const nested = (v: unknown) =>
    v && typeof v === "object" ? (v as Json) : undefined;
  const candidates: unknown[] = [
    ...keys.map((k) => resp[k]),
    nested(resp.user)?.managedAddress,
    nested(resp.user)?.address,
    nested(resp.account)?.address,
    nested(resp.managedAccount)?.address,
  ];
  return candidates.find(
    (v): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v),
  );
}

function decodeJwt(token: string): Json | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Json;
  } catch {
    return undefined;
  }
}

/**
 * Exchange a wallet signature for a Bento session. Tries login first, then
 * falls back to registering a new managed account for first-time wallets.
 */
export async function bentoLoginOrRegister(params: {
  address: string;
  signature: string;
  timestamp: string;
}): Promise<BentoSession> {
  const sdk = getBentoSdk();
  const { address, signature, timestamp } = params;

  let resp = (await sdk.public.auth.eoaLogin({ address, signature, timestamp })) as Json;

  // A first-time wallet logs in as { exists: false } (no token). Register it to
  // provision a Bento managed account.
  if (!resp.token && resp.exists === false) {
    const username = `bento_${address.slice(2, 8).toLowerCase()}${timestamp.slice(-4)}`;
    resp = (await sdk.public.auth.eoaRegister({ address, signature, timestamp, username })) as Json;
  }

  const token = typeof resp.token === "string" ? resp.token : "";
  const claims = token ? decodeJwt(token) : undefined;

  // Managed account address: user.address in the response, or the `address`
  // claim in the JWT (distinct from the signing eoaAddress).
  const managedAddress =
    pickAddress(resp, "managedAddress", "managed_address", "accountAddress") ??
    (claims && typeof claims.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(claims.address)
      ? claims.address
      : undefined);

  let tokenExpiresAt: Date | undefined;
  if (claims && typeof claims.exp === "number") tokenExpiresAt = new Date(claims.exp * 1000);
  else if (typeof resp.expiresIn === "number") tokenExpiresAt = new Date(Date.now() + resp.expiresIn * 1000);

  return { token, managedAddress, tokenExpiresAt };
}

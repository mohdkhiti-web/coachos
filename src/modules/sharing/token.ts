import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * Share-link tokens (Step 7). A link is `<share id, 32 hex><HMAC of it, 43 base64url>` — 75 characters:
 *
 *   - The id is a database key (a row that can be revoked). It is NOT secret and NOT enough to open anything.
 *   - The HMAC is the secret part: HMAC-SHA-256 under a key derived (HKDF) from the server's secret, over the id and a
 *     purpose string. 256 bits: guessing is not a strategy, and a link cannot be forged from a leaked id or a leaked
 *     database (the database never holds a token).
 *   - Because the server can recompute a link from its id, the owner can copy the same link again later — while a
 *     regenerated link is a NEW row with a new id, so the old link simply stops resolving.
 *   - Verification is constant-time, and everything about the token's shape is checked before any database is touched.
 *
 * Pure: the secret is a parameter (see `secret.ts`).
 */

const ID_HEX = /^[0-9a-f]{32}$/;
const MAC = /^[A-Za-z0-9_-]{43}$/;
const PURPOSE = "coachos.share.v1";
export const TOKEN_LENGTH = 32 + 43;

const key = (secret: string) =>
  Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), PURPOSE, 32));

const macOf = (shareId: string, secret: string): Buffer =>
  createHmac("sha256", key(secret)).update(`${PURPOSE}:${shareId}`).digest();

const toUuid = (hex: string) =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

/** The link token for a share id. */
export function makeShareToken(shareId: string, secret: string): string {
  const hex = shareId.replaceAll("-", "").toLowerCase();
  if (!ID_HEX.test(hex)) throw new Error("share id must be a UUID");
  return hex + macOf(toUuid(hex), secret).toString("base64url");
}

/** The share id a token names, if (and only if) its signature is valid; otherwise null. Never throws. */
export function parseShareToken(token: unknown, secret: string): string | null {
  if (typeof token !== "string" || token.length !== TOKEN_LENGTH) return null;
  const hex = token.slice(0, 32);
  const mac = token.slice(32);
  if (!ID_HEX.test(hex) || !MAC.test(mac)) return null;
  const given = Buffer.from(mac, "base64url");
  const expected = macOf(toUuid(hex), secret);
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? toUuid(hex) : null;
}

import { createPrivateKey, createSign } from "node:crypto";

/**
 * Sign in with Apple does not use a static client secret: the "secret" is a short-lived JWT that YOU sign with the .p8
 * key from your Apple developer account (ES256; iss = Team ID, sub = Services ID, aud = Apple, kid = Key ID). Apple caps
 * its lifetime at six months, so we mint one at boot with five months of life — a redeploy renews it.
 *
 * Built with node:crypto so there is no extra dependency. Pure and deterministic given `now`, so it is unit-tested
 * against a throw-away key.
 */

export interface AppleSecretInput {
  teamId: string;
  keyId: string;
  /** The Services ID (this app's OAuth "client id"). */
  clientId: string;
  /** The .p8 contents. "\n" escapes (as many hosts store multi-line values) are accepted. */
  privateKey: string;
}

const FIVE_MONTHS_S = 150 * 24 * 60 * 60;

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export function createAppleClientSecret(input: AppleSecretInput, now: Date = new Date()): string {
  const pem = input.privateKey.includes("\n")
    ? input.privateKey.replaceAll("\n", "\n")
    : input.privateKey;
  const iat = Math.floor(now.getTime() / 1000);
  const header = { alg: "ES256", kid: input.keyId, typ: "JWT" };
  const payload = {
    iss: input.teamId,
    iat,
    exp: iat + FIVE_MONTHS_S,
    aud: "https://appleid.apple.com",
    sub: input.clientId,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createSign("SHA256")
    .update(signingInput)
    .sign({ key: createPrivateKey(pem), dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${b64url(signature)}`;
}

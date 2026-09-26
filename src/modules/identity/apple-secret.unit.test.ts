import { generateKeyPairSync, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAppleClientSecret } from "./apple-secret";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const base = { teamId: "TEAM123456", keyId: "KEY1234567", clientId: "com.example.coachos.web" };
const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

describe("createAppleClientSecret", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const jwt = createAppleClientSecret({ ...base, privateKey: pem }, now);
  const [h, p, s] = jwt.split(".") as [string, string, string];

  it("has the header and claims Apple requires", () => {
    expect(decode(h)).toEqual({ alg: "ES256", kid: "KEY1234567", typ: "JWT" });
    const claims = decode(p);
    expect(claims).toMatchObject({
      iss: "TEAM123456",
      sub: "com.example.coachos.web",
      aud: "https://appleid.apple.com",
      iat: Math.floor(now.getTime() / 1000),
    });
  });

  it("lives well inside Apple's six-month cap", () => {
    const { iat, exp } = decode(p);
    expect(exp - iat).toBeLessThan(180 * 24 * 60 * 60);
    expect(exp - iat).toBeGreaterThan(30 * 24 * 60 * 60);
  });

  it("is a valid ES256 signature (raw r||s, 64 bytes) over header.payload", () => {
    expect(Buffer.from(s, "base64url")).toHaveLength(64);
    const ok = createVerify("SHA256")
      .update(`${h}.${p}`)
      .verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
  });

  it("accepts a key stored with escaped newlines", () => {
    const escaped = pem.replaceAll("\n", "\n");
    expect(() => createAppleClientSecret({ ...base, privateKey: escaped }, now)).not.toThrow();
  });

  it("rejects something that is not a private key", () => {
    expect(() => createAppleClientSecret({ ...base, privateKey: "not a key" }, now)).toThrow();
  });
});

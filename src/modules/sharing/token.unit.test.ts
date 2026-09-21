import { describe, expect, it } from "vitest";
import { makeShareToken, parseShareToken, TOKEN_LENGTH } from "./token";

const SECRET = "a-long-and-private-server-secret-0123456789";
const ID = "0192a000-0000-7000-8000-00000000000a";

describe("share tokens", () => {
  it("are 75 characters of URL-safe text, and name the share they were made for", () => {
    const token = makeShareToken(ID, SECRET);
    expect(token).toHaveLength(TOKEN_LENGTH);
    expect(token).toMatch(/^[0-9a-f]{32}[A-Za-z0-9_-]{43}$/);
    expect(parseShareToken(token, SECRET)).toBe(ID);
  });

  it("are stable (the owner can copy the same link again) and different for different shares", () => {
    expect(makeShareToken(ID, SECRET)).toBe(makeShareToken(ID, SECRET));
    expect(makeShareToken(ID, SECRET)).not.toBe(
      makeShareToken("0192a000-0000-7000-8000-00000000000b", SECRET),
    );
  });

  it("cannot be forged: a different secret, a changed id, a changed signature or a truncated token all fail", () => {
    const token = makeShareToken(ID, SECRET);
    expect(parseShareToken(token, SECRET + "x")).toBeNull();
    const otherId = "0192a000000070008000" + "00000000000b";
    expect(parseShareToken(otherId + token.slice(32), SECRET)).toBeNull(); // someone else's id, this signature
    const flipped = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(parseShareToken(flipped, SECRET)).toBeNull();
    expect(parseShareToken(token.slice(0, -1), SECRET)).toBeNull();
    expect(parseShareToken(token + "A", SECRET)).toBeNull();
    expect(parseShareToken(token.toUpperCase(), SECRET)).toBeNull(); // the id part is lowercase hex
  });

  it("never throws, whatever it is given", () => {
    for (const junk of [
      undefined,
      null,
      42,
      {},
      [],
      "",
      " ",
      "x".repeat(75),
      "../../etc/passwd",
      "0".repeat(75),
      "%00".repeat(25),
      "é".repeat(75),
    ])
      expect(parseShareToken(junk, SECRET), String(junk)).toBeNull();
  });

  it("refuses to make a token for something that is not a share id", () => {
    expect(() => makeShareToken("not-an-id", SECRET)).toThrow();
    expect(() => makeShareToken("", SECRET)).toThrow();
  });

  it("does not reveal the secret or the id's signature in the id part", () => {
    const token = makeShareToken(ID, SECRET);
    expect(token.slice(0, 32)).toBe(ID.replaceAll("-", ""));
    expect(token).not.toContain(SECRET);
  });
});

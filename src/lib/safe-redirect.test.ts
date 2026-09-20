import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-redirect";

describe("safeNext (open-redirect defence)", () => {
  it("allows rooted paths inside known app areas, keeping query/hash", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/settings/security")).toBe("/settings/security");
    expect(safeNext("/settings/profile?tab=1#x")).toBe("/settings/profile?tab=1#x");
    expect(safeNext(["/onboarding"])).toBe("/onboarding");
  });

  it.each([
    ["absolute URL", "https://evil.example/dashboard"],
    ["protocol-relative", "//evil.example"],
    ["backslash trick", "/\\evil.example"],
    ["javascript scheme", "javascript:alert(1)"],
    ["path outside app areas", "/api/auth/sign-out"],
    ["lookalike prefix", "/dashboardevil"],
    ["control character", "/dashboard\n/evil"],
    ["empty", ""],
  ])("falls back for %s", (_name, value) => {
    expect(safeNext(value)).toBe("/dashboard");
  });

  it("falls back for missing values and honours a custom fallback", () => {
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext(null, "/settings")).toBe("/settings");
  });

  it("rejects absurdly long input", () => {
    expect(safeNext("/dashboard?" + "a".repeat(600))).toBe("/dashboard");
  });
});

import { expect, test } from "@playwright/test";
import { completeOnboarding, newUser, signUpAndVerify } from "./support/helpers";

test("responses carry a fresh nonce CSP and hardening headers", async ({ request }) => {
  const one = await request.get("/sign-in");
  const two = await request.get("/sign-in");
  const csp1 = one.headers()["content-security-policy"] ?? "";
  const csp2 = two.headers()["content-security-policy"] ?? "";

  expect(csp1).toContain("default-src 'self'");
  expect(csp1).toContain("frame-ancestors 'none'");
  expect(csp1).toContain("object-src 'none'");
  expect(csp1).toContain("form-action 'self'");
  expect(csp1).not.toContain("'unsafe-eval'"); // production build
  expect(csp1).not.toMatch(/script-src[^;]*'unsafe-inline'/);

  const nonce1 = csp1.match(/'nonce-([^']+)'/)?.[1];
  const nonce2 = csp2.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce1).toBeTruthy();
  expect(nonce1).not.toBe(nonce2); // unique per request

  const h = one.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-powered-by"]).toBeUndefined();

  // the framework applied that nonce to its scripts
  const html = await one.text();
  expect(html).toContain(`nonce="${nonce1}"`);
});

test("the CSP breaks nothing: no violations across the whole signed-in app", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/content security policy|refused to (apply|load|execute)/i.test(m.text()))
      violations.push(m.text());
  });
  page.on("pageerror", (e) => violations.push(`pageerror: ${e.message}`));

  const user = newUser();
  await page.goto("/");
  await page.goto("/sign-in");
  await page.goto("/sign-up");
  await signUpAndVerify(page, user);
  await completeOnboarding(page);
  for (const path of [
    "/dashboard",
    "/settings/profile",
    "/settings/security",
    "/settings/preferences",
    "/settings/danger-zone",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
  }
  // interactive Radix pieces (menu, dialog, tooltip, toast) rely on inline positioning styles
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  expect(violations).toEqual([]);
});

import { expect, test } from "@playwright/test";

/**
 * Social sign-in and the motion system, against the production build.
 *
 * The e2e server runs with FAKE Google and Apple credentials (and a throw-away Apple key), so these tests prove the
 * application side of both flows — the buttons exist, and clicking one sends the browser to the provider's real authorization
 * endpoint with the right callback URL, client id, state and (Apple) response mode. They deliberately do NOT claim a live
 * sign-in: that needs real credentials and a real Google/Apple account (see docs/oauth-setup.md).
 */

const PROVIDERS = [
  {
    button: "Continue with Google",
    host: "accounts.google.com",
    path: "/o/oauth2/v2/auth",
    clientId: "e2e-google-client-id.apps.googleusercontent.com",
    callback: "/api/auth/callback/google",
  },
  {
    button: "Continue with Apple",
    host: "appleid.apple.com",
    path: "/auth/authorize",
    clientId: "com.example.coachos.e2e",
    callback: "/api/auth/callback/apple",
    responseMode: "form_post",
  },
] as const;

for (const page_ of ["/sign-in", "/sign-up"] as const) {
  test(`${page_}: both social buttons are offered and each starts a real redirect to its provider`, async ({
    page,
    baseURL,
  }) => {
    for (const p of PROVIDERS) {
      await page.goto(page_);
      // never leave the app: watch for the request to the provider and stop it there
      await page.route(`https://${p.host}/**`, (route) => route.abort());
      const request = page.waitForRequest((r) => r.url().startsWith(`https://${p.host}${p.path}`));
      await page.getByRole("button", { name: p.button }).click();
      const url = new URL((await request).url());
      expect(url.searchParams.get("client_id")).toBe(p.clientId);
      expect(url.searchParams.get("redirect_uri")).toBe(`${baseURL}${p.callback}`);
      expect(url.searchParams.get("state")?.length ?? 0).toBeGreaterThan(10);
      if ("responseMode" in p) expect(url.searchParams.get("response_mode")).toBe(p.responseMode);
      await page.unroute(`https://${p.host}/**`);
    }
  });
}

test("a failed or cancelled social sign-in returns to the sign-in screen with a plain message (never the raw code)", async ({
  page,
}) => {
  await page.goto("/sign-in?error=access_denied");
  await expect(page.getByText("Sign-in was cancelled.")).toBeVisible();

  await page.goto("/sign-in?error=state_mismatch");
  await expect(
    page.getByText("We couldn't finish signing you in with that provider."),
  ).toBeVisible();

  await page.goto("/sign-in?error=unable_to_link_account");
  await expect(page.getByText("That email already has a CoachOS account.")).toBeVisible();

  // whatever the URL says is never echoed into the page
  await page.goto("/sign-in?error=%3Cscript%3Ealert(1)%3C/script%3E");
  await expect(page.getByText("Something went wrong while signing in.")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("<script>");

  // and the email/password form is still there, unchanged
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test.describe("the landing page's motion follows the coach's settings", () => {
  test("with motion allowed: the court draws itself and the ball flies", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    // the animated ball is shown; its static twin (already through the hoop) is not
    await expect(page.locator(".motion-safe-only").first()).toBeVisible();
    expect(
      await page
        .locator(".motion-reduce-only")
        .first()
        .evaluate((el) => getComputedStyle(el).display),
    ).toBe("none");
    // the lines finish drawing (the animation ends in its finished state)
    await expect
      .poll(
        () =>
          page
            .locator(".court-draw path >> visible=true")
            .first()
            .evaluate((el) => getComputedStyle(el).strokeDashoffset),
        { timeout: 8_000 },
      )
      .toBe("0px");
  });

  test("with reduced motion: nothing moves, and the artwork is complete at once", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const display = (sel: string) =>
      page
        .locator(sel)
        .first()
        .evaluate((el) => getComputedStyle(el).display);
    expect(await display(".motion-safe-only")).toBe("none"); // the flying ball is not rendered…
    expect(await display(".motion-reduce-only")).not.toBe("none"); // …its finished twin is
    // every line is already drawn, every element already in place
    expect(
      await page
        .locator(".court-draw path >> visible=true")
        .first()
        .evaluate((el) => getComputedStyle(el).strokeDashoffset),
    ).toBe("0px");
    expect(
      await page
        .locator(".rise")
        .first()
        .evaluate((el) => getComputedStyle(el).opacity),
    ).toBe("1");
    // the whole page is still there: headline, both calls to action
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "The Operating System for Basketball Coaches",
    );
    await expect(page.getByRole("link", { name: "Start Coaching" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore CoachOS" })).toBeVisible();
  });

  test("printing never leaves the court half drawn", async ({ page }) => {
    await page.emulateMedia({ media: "print", reducedMotion: "no-preference" });
    await page.goto("/");
    expect(
      await page
        .locator(".court-draw path >> visible=true")
        .first()
        .evaluate((el) => getComputedStyle(el).strokeDashoffset),
    ).toBe("0px");
    expect(
      await page
        .locator(".motion-safe-only")
        .first()
        .evaluate((el) => getComputedStyle(el).display),
    ).toBe("none");
    expect(
      await page
        .locator(".motion-reduce-only")
        .first()
        .evaluate((el) => getComputedStyle(el).display),
    ).not.toBe("none");
  });
});

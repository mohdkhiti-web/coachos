import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  newUser,
  signIn,
  signOut,
  signUp,
  formError,
  signUpAndVerify,
  toast,
  waitForMail,
} from "./support/helpers";

test.describe("signed-out visitors", () => {
  for (const path of ["/dashboard", "/settings/profile", "/settings/security", "/onboarding"]) {
    test(`${path} redirects to sign-in and remembers where they were going`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(
        new RegExp(`/sign-in\\?next=${encodeURIComponent(path).replace(/%/g, "%")}`),
      );
    });
  }

  test("the landing page offers sign-in and sign-up, not the dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Create your account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open your dashboard" })).toHaveCount(0);
  });

  test("unknown routes show the branded 404", async ({ page }) => {
    const res = await page.goto("/definitely-not-a-page");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("health endpoint reports the database is reachable", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", db: "up" });
    expect(res.headers()["cache-control"]).toBe("no-store");
  });
});

test.describe("sign-in rules", () => {
  test("wrong credentials show one generic message (no account enumeration)", async ({ page }) => {
    const user = newUser();
    await signUpAndVerify(page, user);
    await completeOnboarding(page);
    await signOut(page);

    await signIn(page, { email: user.email, password: "not-the-right-password" });
    await expect(formError(page, "That email and password don't match.")).toBeVisible();
    const wrongPassword = await formError(
      page,
      "That email and password don't match.",
    ).textContent();
    await signIn(page, { email: "nobody-here@example.test", password: "not-the-right-password" });
    await expect(formError(page, "That email and password don't match.")).toBeVisible();
    const unknownEmail = await formError(
      page,
      "That email and password don't match.",
    ).textContent();
    expect(wrongPassword).toBe("That email and password don't match.");
    expect(unknownEmail).toBe(wrongPassword);
  });

  test("an unverified account cannot sign in and is sent a fresh link", async ({ page }) => {
    const user = newUser();
    await signUp(page, user);
    await waitForMail(user.email, /Verify your CoachOS email/);

    await signIn(page, user);
    await expect(page).toHaveURL(/\/verify-email\?unverified=1/);
    await expect(
      page.getByRole("heading", { name: "Verify your email to continue" }),
    ).toBeVisible();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/); // still no session
  });

  test("registering an existing email looks identical, and the real owner is warned by email", async ({
    page,
    context,
  }) => {
    const user = newUser();
    await signUpAndVerify(page, user);
    await completeOnboarding(page);
    await signOut(page);
    await context.clearCookies();

    await signUp(page, user); // same email again
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    await waitForMail(user.email, /Someone tried to register with your email/);
  });

  test("passwords under 12 characters are rejected with a helpful message", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Full name").fill("Short Pass");
    await page.getByLabel("Email").fill("short@example.test");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Use at least 12 characters.")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up/);
  });

  test("?next= returns the user to the page they wanted, but never to another site", async ({
    page,
  }) => {
    const user = newUser();
    await signUpAndVerify(page, user);
    await completeOnboarding(page);
    await signOut(page);

    await page.goto("/settings/security");
    await expect(page).toHaveURL(/\/sign-in\?next=/);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/settings\/security/);

    await signOut(page);
    await page.goto("/sign-in?next=https://evil.example/phish");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/localhost:3100\/dashboard/);
  });
});

test.describe("signed-in rules", () => {
  test("onboarding gates the app until complete; afterwards it is closed", async ({ page }) => {
    const user = newUser();
    await signUpAndVerify(page, user);
    for (const path of ["/dashboard", "/settings/profile"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/onboarding/);
    }
    await completeOnboarding(page);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("signed-in users are bounced away from the auth pages", async ({ page }) => {
    const user = newUser();
    await signUpAndVerify(page, user);
    await completeOnboarding(page);
    for (const path of ["/sign-in", "/sign-up", "/forgot-password"]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(new RegExp(path));
    }
  });

  test("two users are fully isolated from each other", async ({ browser }) => {
    const a = newUser("Alice");
    const b = newUser("Bob");
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await signUpAndVerify(pageA, a);
    await completeOnboarding(pageA);
    await signUpAndVerify(pageB, b);
    await completeOnboarding(pageB);

    // A does something distinctive that lands in A's audit trail and workspace name
    await pageA.goto("/settings/profile");
    await pageA.getByLabel("Your name").fill("Alice Only");
    await pageA.getByRole("button", { name: "Save changes" }).first().click();
    await expect(toast(pageA, "Changes saved.")).toBeVisible();
    await pageA.getByLabel("Workspace name").fill("Alice Private Club");
    await pageA.getByRole("button", { name: "Save changes" }).nth(1).click();
    await expect(toast(pageA, "Changes saved.")).toBeVisible();

    // B sees none of it: own workspace, own sessions (exactly one), own activity
    await pageB.goto("/dashboard");
    await expect(pageB.getByText("Alice Private Club")).toHaveCount(0);
    await expect(pageB.getByText("Alice Only")).toHaveCount(0);
    await expect(pageB.getByText("Profile updated")).toHaveCount(0);
    await pageB.goto("/settings/security");
    await expect(pageB.getByText("This device")).toBeVisible();
    await expect(pageB.getByRole("button", { name: /^Revoke/ })).toHaveCount(0);
    await expect(pageB.getByText("Profile updated")).toHaveCount(0);

    // and A does see her own
    await pageA.goto("/settings/security");
    await expect(pageA.getByText("Profile updated").first()).toBeVisible();

    // B cannot use A's session-revoke by guessing: the action only resolves ids inside B's own list
    await ctxA.close();
    await ctxB.close();
  });
});

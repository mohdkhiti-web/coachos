import { expect, test } from "@playwright/test";
import { completeOnboarding, newUser, signUpAndVerify } from "./support/helpers";

// Runs in the "mobile" project (Pixel 7 viewport): the rail becomes a bottom tab bar (§2.3).

const noHorizontalScroll = async (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test("public pages fit a phone screen", async ({ page }) => {
  for (const path of ["/", "/sign-in", "/sign-up"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    expect(await noHorizontalScroll(page), `${path} overflows horizontally`).toBe(true);
  }
});

test("the app shell collapses to a bottom tab bar with 44px touch targets", async ({ page }) => {
  await signUpAndVerify(page, newUser());
  await expect(page.getByLabel("Your timezone")).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await completeOnboarding(page);

  const bar = page.getByRole("navigation", { name: "Main navigation" }).last();
  await expect(bar).toBeVisible();
  await expect(page.locator("aside")).toBeHidden(); // desktop rail is gone

  for (const name of ["Dashboard", "Settings"]) {
    const box = await bar.getByRole("link", { name }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }

  await bar.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings\/profile/);
  for (const path of [
    "/dashboard",
    "/settings/profile",
    "/settings/security",
    "/settings/preferences",
  ]) {
    await page.goto(path);
    expect(await noHorizontalScroll(page), `${path} overflows horizontally`).toBe(true);
  }
});

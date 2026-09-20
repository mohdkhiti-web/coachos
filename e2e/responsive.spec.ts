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

  for (const name of ["Dashboard", "Sports", "Settings"]) {
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

test("Phase 2: sports, library, drill detail and the drill form fit a phone and stay usable", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUpAndVerify(page, newUser());
  await completeOnboarding(page);

  // Sports is reachable from the bottom bar, with a 44px target like the other tabs
  const bar = page.getByRole("navigation", { name: "Main navigation" }).last();
  await bar.getByRole("link", { name: "Sports" }).click();
  await expect(page).toHaveURL(/\/sports$/);
  expect(await noHorizontalScroll(page), "/sports overflows horizontally").toBe(true);

  await page.getByRole("main").getByRole("link", { name: "Basketball" }).click();
  await expect(page).toHaveURL(/\/sports\/basketball$/);
  expect(await noHorizontalScroll(page), "overview overflows horizontally").toBe(true);

  // the workspace tabs are reachable and at least 44px tall
  const tabs = page.getByRole("navigation", { name: "Workspace sections" });
  const drillsTab = await tabs.getByRole("link", { name: "Drills" }).boundingBox();
  expect(drillsTab?.height ?? 0).toBeGreaterThanOrEqual(44);
  await tabs.getByRole("link", { name: "Drills" }).click();
  await expect(page).toHaveURL(/\/drills$/);
  expect(await noHorizontalScroll(page), "library overflows horizontally").toBe(true);

  // on a phone the filters are folded away behind a button (a real disclosure), and they work when opened
  const toggle = page.getByRole("button", { name: /^Filters/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("search", { name: "Filters" })).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const level = page.getByRole("search", { name: "Filters" }).getByLabel("Level");
  await expect(level).toBeVisible();
  expect((await level.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await level.selectOption("beginner");
  await expect(page).toHaveURL(/level=beginner/);
  await expect(page.getByRole("link", { name: "Remove filter: Beginner" })).toBeVisible();
  expect(await noHorizontalScroll(page), "filtered library overflows horizontally").toBe(true);

  // a drill: the court diagram scales to the screen and nothing overflows
  await page.getByRole("link", { name: /^Partner Chest/ }).click();
  await expect(page.getByRole("heading", { name: /^Partner Chest/, level: 2 })).toBeVisible();
  expect(await noHorizontalScroll(page), "drill detail overflows horizontally").toBe(true);
  const diagram = await page.getByRole("img").first().boundingBox();
  expect(diagram?.width ?? 0).toBeLessThanOrEqual(page.viewportSize()!.width);

  // the form + diagram builder
  await page.goto("/sports/basketball/drills/new");
  await page.getByRole("button", { name: "Add a diagram" }).click();
  const add = page.getByRole("group", { name: "Add to the court" });
  await add.getByRole("button", { name: "Offense" }).click();
  await add.getByRole("button", { name: "Offense" }).click();
  await expect(page.getByText("This diagram is valid.")).toBeVisible();
  expect(await noHorizontalScroll(page), "drill form overflows horizontally").toBe(true);
});

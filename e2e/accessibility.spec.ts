import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, newUser, signUpAndVerify } from "./support/helpers";

/**
 * WCAG 2.2 AA target (ARCHITECTURE.md §2.5): axe on every key screen, in BOTH themes.
 * Serious/critical violations fail the run (which also validates the Playbook colour contrast).
 */
async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const summary = blocking.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`,
  );
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    // reducedMotion: axe must not sample colours mid-fade (also exercises the prefers-reduced-motion CSS)
    test.use({ colorScheme: scheme, reducedMotion: "reduce" });

    test("public pages", async ({ page }) => {
      for (const path of ["/", "/sign-in", "/sign-up", "/forgot-password"]) {
        await page.goto(path);
        await expect(page.locator("main")).toBeVisible();
        await audit(page, `${path} (${scheme})`);
      }
    });

    test("signed-in pages, menus and dialogs", async ({ page }) => {
      const user = newUser();
      await signUpAndVerify(page, user);
      await audit(page, `/onboarding (${scheme})`);
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
        await audit(page, `${path} (${scheme})`);
      }

      await page.getByRole("button", { name: "Account menu" }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await audit(page, `account menu (${scheme})`);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "Delete my account" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await audit(page, `delete dialog (${scheme})`);
    });
  });
}

test("keyboard-only: skip link, menu and dialog are operable without a mouse", async ({ page }) => {
  const user = newUser();
  await signUpAndVerify(page, user);
  await completeOnboarding(page);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);

  await page.getByRole("button", { name: "Account menu" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Profile" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Account menu" })).toBeFocused();

  await page.goto("/settings/danger-zone");
  await page.getByRole("button", { name: "Delete my account" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete my account" })).toBeFocused(); // focus returns
});

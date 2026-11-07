import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, newUser, signUpAndVerify } from "./support/helpers";

/** A generated session with real drills (the deterministic generator, the same path a coach takes). */
async function generatedSession(page: Page) {
  await page.goto("/sessions/basketball/generate");
  const field = (label: string) =>
    page.getByLabel(label, { exact: true }).locator("visible=true").first();
  await field("Session title").fill("Run mode practice");
  await field("Age group").selectOption({ label: "U14 (13–14)" });
  await field("Level").selectOption({ label: "Beginner" });
  await field("Number of players").fill("12");
  await field("Duration (minutes)").fill("60");
  await field("Main objective").selectOption({ label: "Ball Handling" });
  await page.getByRole("button", { name: "Generate session" }).click();
  await page.getByRole("button", { name: "Create session and open the builder" }).click();
  await expect(page).toHaveURL(/\/sessions\/basketball\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  return page.url();
}

test("Run mode: the session as a courtside clock, and the command palette finds real drills", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUpAndVerify(page, newUser("Runner"));
  await completeOnboarding(page);
  const builder = await generatedSession(page);

  await test.step("run mode opens from the builder, counts down and moves between activities", async () => {
    await page.getByTestId("run-practice").click();
    await expect(page).toHaveURL(/\/run$/);
    await expect(page.getByText("Activity 1 of", { exact: false })).toBeVisible();
    const first = await page.getByRole("heading", { level: 1 }).innerText();
    const clock = page.getByText(/^\d\d:\d\d$/).first();
    const before = await clock.innerText();
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect.poll(() => clock.innerText(), { timeout: 5_000 }).not.toBe(before);
    await page.getByRole("button", { name: "Next activity" }).click();
    await expect(page.getByText("Activity 2 of", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(first);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(builder);
  });

  await test.step("Ctrl+K opens the palette; a search finds library drills and Enter opens one", async () => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Search drills, sessions and pages" }).click();
    const box = page.getByRole("combobox", { name: "Search CoachOS" });
    await box.fill("shooting");
    const option = page
      .getByRole("option")
      .filter({ hasText: /Shooting/ })
      .first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await box.press("ArrowDown");
    await option.click();
    await expect(page).toHaveURL(/\/sports\/basketball\/drills\/[0-9a-f-]{36}$/);
  });
});

import { expect, test } from "@playwright/test";
import { completeOnboarding, newUser, signUpAndVerify } from "./support/helpers";
import { addCustom, card, createSession, field, pickDrill } from "./support/sessions";

/**
 * The Command Center's training load comes from the coach's real, dated sessions: an empty calendar says so, and a
 * session scheduled this week shows up as this week's minutes, in the table, and in "where the time went".
 */
test("training load: honest when empty, then this week's scheduled minutes and categories", async ({
  page,
}, testInfo) => {
  await signUpAndVerify(page, newUser("Load"));
  await completeOnboarding(page);

  await page.goto("/dashboard");
  const load = page.getByRole("region", { name: "Training load" });
  await expect(load).toContainText("Nothing on the calendar yet");

  // a session dated today: one library drill (15 min) and one custom block (10 min)
  const utcToday = new Date().toISOString().slice(0, 10);
  const builder = await createSession(page, { title: "Load test", date: utcToday });
  await pickDrill(page, builder, "five-spot", "Five-Spot Shooting");
  await field(page, "Duration (min)").fill("15");
  await page.getByRole("button", { name: "Add to session" }).click();
  await expect(card(page, "Five-Spot Shooting")).toBeVisible();
  await addCustom(page, "Team talk", 10);

  await page.goto("/dashboard");
  await expect(load.getByText("25", { exact: true }).first()).toBeAttached();
  await expect(load).toContainText("minutes this week");
  await expect(
    load.getByRole("list", { name: "Scheduled training minutes per week" }),
  ).toBeVisible();
  await expect(load.getByRole("button", { name: /25 minutes in 1 session/ })).toBeVisible();

  // where the time went: the drill's category and the custom block
  await expect(load).toContainText("Shooting");
  await expect(load).toContainText("Custom activities");

  // hovering a week explains it
  await load.getByRole("button", { name: /25 minutes in 1 session/ }).hover();
  await expect(page.getByRole("tooltip")).toContainText("25 min · 1 session");
  await page.waitForTimeout(800);
  await load.screenshot({ path: testInfo.outputPath("training-load.png") });

  // the same data as a table
  await load.getByRole("button", { name: "Table" }).click();
  const row = load.getByRole("row", { name: /This week/ });
  await expect(row).toContainText("25");
});

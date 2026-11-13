import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, newUser, signUpAndVerify } from "./support/helpers";
import { addCustom, field } from "./support/sessions";

/**
 * The roster as a team sheet: players as a tally, real figures from dates of birth, and each team's training read
 * from the sessions that name it. A session planned from the team page arrives with the team filled in.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const yearsAgo = (n: number, days = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - n);
  d.setUTCDate(d.getUTCDate() - days);
  return iso(d);
};

async function addPlayer(page: Page, teamPath: string, name: string, dob?: string) {
  await page.goto(`${teamPath}/players/new`);
  await page.getByLabel("Name").fill(name);
  if (dob) await page.getByLabel("Date of birth").fill(dob);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`${teamPath}$`));
}

test("roster: team sheet with tally, ages and training, and plan a session for the team", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await signUpAndVerify(page, newUser("Roster"));
  await completeOnboarding(page);

  await page.goto("/roster/new");
  await page.getByLabel("Name").fill("U14 Hawks");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/roster\/[0-9a-f-]{36}$/);
  const teamPath = new URL(page.url()).pathname;

  await addPlayer(page, teamPath, "Maya Okafor", yearsAgo(13, 10));
  await addPlayer(page, teamPath, "Lena Brandt", yearsAgo(14, 40));
  await addPlayer(page, teamPath, "Ana Ruiz", yearsAgo(13, 100));
  await addPlayer(page, teamPath, "Zoe Park");

  // the sheet: alphabetical, numbered, with ages; figures from the real data
  const squad = page.getByRole("list", { name: "U14 Hawks squad" });
  await expect(squad.getByRole("listitem")).toHaveCount(4);
  await expect(squad.getByRole("listitem").first()).toContainText("Ana Ruiz");
  await expect(squad.getByRole("listitem").first()).toContainText("13 yrs");
  await expect(squad.getByRole("listitem").last()).toContainText("No details yet");
  await expect(page.getByText("Median age", { exact: true })).toBeVisible();
  await expect(page.getByText("1 player without a date of birth")).toBeVisible();
  await expect(page.getByText(/No dated sessions for U14 Hawks yet/)).toBeVisible();

  // plan a session from the team: the Team field arrives filled in
  await page.getByRole("link", { name: "Plan a session for this team" }).click();
  await expect(field(page, "Team")).toHaveValue("U14 Hawks");
  await field(page, "Session title").fill("Hawks Tuesday");
  await field(page, "Date").fill(iso(new Date()));
  await field(page, "Main objective").selectOption({ label: "Shooting" });
  await page.getByRole("button", { name: "Create session and start building" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Hawks Tuesday" })).toBeVisible();
  await addCustom(page, "Shooting ladder", 40);

  // the team now trains: 1 session, 40 minutes, listed as next (it is today)
  await page.goto(teamPath);
  const stats = page.getByRole("definition");
  await expect(stats.filter({ hasText: /^40$/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Next .*Hawks Tuesday/ })).toBeVisible();
  await page.waitForTimeout(1200); // tally strokes and bars finish drawing
  await page.screenshot({ path: testInfo.outputPath("team.png"), fullPage: true });

  // the overview: figures and the team sheet card
  await page.goto("/roster");
  await expect(page.getByRole("link", { name: "U14 Hawks" })).toBeVisible();
  const figures = page
    .getByRole("group", { name: "Roster at a glance" })
    .or(page.locator('dl[aria-label="Roster at a glance"]'));
  await expect(figures.first()).toContainText("4");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: testInfo.outputPath("roster.png"), fullPage: true });
});

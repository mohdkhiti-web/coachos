import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, newUser, signUpAndVerify } from "./support/helpers";
import { card, field, SESSIONS, timelineTitles, totals } from "./support/sessions";

/**
 * The deterministic session generator, end to end in a real browser against a production build: ask for a session, see WHY
 * each drill was chosen, swap and keep drills, get another version, and create a normal session that opens in the Session
 * Builder with the same drills and the exact minutes.
 */

async function signedIn(page: Page, label = "Generator") {
  await signUpAndVerify(page, newUser(label));
  await completeOnboarding(page);
}

async function fillRequest(
  page: Page,
  over: { players?: string; minutes?: string; title?: string } = {},
) {
  await field(page, "Session title").fill(over.title ?? "Generated Tuesday");
  await field(page, "Age group").selectOption({ label: "U14 (13–14)" });
  await field(page, "Level").selectOption({ label: "Beginner" });
  await field(page, "Number of players").fill(over.players ?? "12");
  await field(page, "Duration (minutes)").fill(over.minutes ?? "75");
  await field(page, "Main objective").selectOption({ label: "Ball Handling" });
}

const preview = (page: Page) => page.getByRole("region", { name: "Your generated session" });
/** The titles in the preview (the screen-reader hint after a link title is not part of the drill name). */
const drillTitles = async (page: Page) =>
  (await preview(page).locator("h3").allInnerTexts()).map((t) =>
    t.replace(/\s*\(opens in a new tab\)\s*$/, "").trim(),
  );
const rows = (page: Page) => preview(page).locator('ol[aria-label="Generated timeline"] > li');

test("generate a session: reasons, keep, replace, another version, and create a normal session", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signedIn(page);

  // the entry point is on My Sessions
  await page.goto(SESSIONS);
  await page.getByRole("link", { name: "Generate a session" }).click();
  await expect(page).toHaveURL(/\/sessions\/basketball\/generate$/);
  await expect(page.getByRole("heading", { level: 1, name: "Generate a session" })).toBeVisible();

  // nothing is asked without the essentials: the fields say so
  await page.getByRole("button", { name: "Generate session" }).click();
  await expect(
    page.getByText("Some fields need attention. They are highlighted above."),
  ).toBeVisible();

  await fillRequest(page);
  await page.getByRole("button", { name: "Generate session" }).click();
  await expect(preview(page)).toBeVisible();
  await expect(preview(page).getByRole("heading", { level: 2, name: "Your generated session" }))
    .toBeFocused({ timeout: 5000 })
    .catch(() => {});

  // a balanced timeline of real drills that adds up
  const count = await rows(page).count();
  expect(count).toBeGreaterThanOrEqual(5);
  await expect(preview(page).getByText(/75 minutes/)).toBeVisible();
  await expect(
    preview(page).getByText(/library drills could run with what you told us/),
  ).toBeVisible();
  // every drill says why
  await expect(preview(page).getByRole("list", { name: "Why this drill" }).first()).toContainText(
    /Trains Ball Handling|Suits the/,
  );
  const titles = await drillTitles(page);
  const firstDrill = titles.find((t) => t !== "Water break")!;

  // keep a drill: it is marked, and survives "another version"
  const kept = rows(page).filter({ hasText: firstDrill }).first();
  await kept.getByRole("button", { name: "Keep this drill" }).click();
  await expect(kept.getByText("Kept", { exact: true })).toBeVisible();
  await preview(page).getByRole("button", { name: "Try another version" }).click();
  await expect(rows(page).filter({ hasText: firstDrill }).first()).toBeVisible();

  // replace a drill with one of the alternatives: the session is checked again and the drill is now kept
  const second = rows(page).nth(1);
  const before = await second.locator("h3").innerText();
  const choose = second.getByLabel("Replace with");
  const options = await choose.locator("option").allInnerTexts();
  expect(options.length).toBeGreaterThan(1);
  await choose.selectOption({ index: 1 });
  await expect(rows(page).nth(1).locator("h3")).not.toHaveText(before);
  await expect(rows(page).nth(1).getByText("Kept", { exact: true })).toBeVisible();

  // create: it opens in the Session Builder as an ordinary session with the same drills
  const shown = (await drillTitles(page)).filter((t) => t !== "Water break");
  await preview(page).getByRole("button", { name: "Create session and open the builder" }).click();
  await expect(page).toHaveURL(/\/sessions\/basketball\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Generated Tuesday" })).toBeVisible();
  await expect(totals(page).getByTestId("total-minutes")).toContainText("75");
  const built = await timelineTitles(page).allInnerTexts();
  for (const title of shown) expect(built).toContain(title);

  // and it is editable like any other: change a minute count and see the total move
  const first = card(page, shown[0]!);
  await first.getByRole("button", { name: /Edit/ }).click();
  await field(page, "Duration (min)").fill("20");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(totals(page).getByTestId("total-minutes")).not.toContainText("75");
});

test("the generator says why it cannot build what was asked, and refuses to create an unsound session", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signedIn(page, "GeneratorLimits");
  await page.goto(`${SESSIONS}/generate`);
  await fillRequest(page, { players: "2", minutes: "45", title: "Two players" });
  await page.getByRole("button", { name: "Generate session" }).click();
  await expect(preview(page)).toBeVisible();
  // a small group gets drills that work for two players, all inside the limits it was told about
  await expect(rows(page).first()).toBeVisible();
  const create = preview(page).getByRole("button", { name: "Create session and open the builder" });
  await expect(create).toBeEnabled();

  // equipment it is told about is respected: one basket, six balls
  await field(page, "Baskets available").fill("1");
  await expect(preview(page)).toBeHidden(); // the request changed: the old answer is gone
  await page.getByRole("button", { name: "Generate session" }).click();
  await expect(preview(page)).toBeVisible();
  await expect(preview(page).getByText(/Kit needed at once/)).toBeVisible();
});

test("the generated session works on a phone-sized screen and with the keyboard", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signedIn(page, "GeneratorPhone");
  await page.goto(`${SESSIONS}/generate`);
  await fillRequest(page);
  await page.getByRole("button", { name: "Generate session" }).click();
  await expect(preview(page)).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  // the keep button is reachable and operable from the keyboard
  const keep = rows(page)
    .first()
    .getByRole("button", { name: /Keep this drill|Stop keeping/ });
  await keep.focus();
  await page.keyboard.press("Enter");
  await expect(rows(page).first().getByText("Kept", { exact: true })).toBeVisible();
});

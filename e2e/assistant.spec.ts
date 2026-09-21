import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, newUser, signUpAndVerify } from "./support/helpers";
import { card, SESSIONS, timelineTitles, totals } from "./support/sessions";

/**
 * The AI Coaching Assistant end to end in a real browser against a production build, with the deterministic stand-in for a
 * model (a real model would only change the wording): open it from the navigation, create a session, change it, draw and
 * change a diagram, apply suggestions (with confirmation when they replace something), cancel, retry, and see that it only
 * suggests. The safety cases — a model that invents, misbehaves or refuses — are proven in the integration tests.
 */

async function signedIn(page: Page, label = "Assistant") {
  await signUpAndVerify(page, newUser(label));
  await completeOnboarding(page);
}

const log = (page: Page) => page.getByRole("log", { name: "Conversation" });
const proposals = (page: Page) => log(page).getByTestId("proposal-card");
const ask = async (page: Page, text: string) => {
  const input = page.getByLabel("Message the AI Coach");
  await input.fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
};
const reply = (page: Page) => log(page).locator('[data-role="assistant"]').last();
const nav = (page: Page) => page.getByRole("navigation", { name: "Main navigation" }).first();

/** Create a session through the assistant and land in its builder. */
async function sessionViaAssistant(page: Page) {
  await page.getByRole("link", { name: "AI Coach" }).first().click();
  await ask(page, "Create a 60 minute shooting session for 12 players U14 beginner");
  const card = proposals(page).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole("button", { name: "Create Session" }).click();
  await expect(page).toHaveURL(/\/sessions\/basketball\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  return page.url();
}

test("AI Coach: open it, create a session with AI, and it opens in the Session Builder", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signedIn(page);

  // it is in the main navigation, and starts empty and honest about what it does
  await expect(nav(page).getByRole("link", { name: "AI Coach" })).toBeVisible();
  await nav(page).getByRole("link", { name: "AI Coach" }).click();
  await expect(page).toHaveURL(/\/assistant\/basketball$/);
  await expect(page.getByRole("heading", { level: 1, name: "AI Coach" })).toBeVisible();
  await expect(page.getByTestId("chat-empty")).toContainText("What would you like to plan?");
  await expect(page.getByTestId("chat-context")).toContainText("No session is open");
  await expect(page.getByText(/nothing changes until you apply it/)).toBeVisible();

  // ask: it works, says what it is doing, and answers with a suggestion, not a change
  await ask(page, "Create a 60 minute shooting session for 12 players U14 beginner");
  await expect(log(page).locator('[data-role="user"]').last()).toContainText(
    "Create a 60 minute shooting session",
  );
  await expect(reply(page)).toContainText("prepared a session", { timeout: 20_000 });
  const suggestion = proposals(page).first();
  await expect(suggestion).toHaveAttribute("data-kind", "create_session");
  await expect(suggestion).toContainText("60 minutes for 12 players");
  await expect(suggestion).toContainText("Nothing has changed yet.");
  expect(await suggestion.getByRole("listitem").count()).toBeGreaterThanOrEqual(5);

  // nothing exists yet
  await page.goto(SESSIONS);
  await expect(page.getByRole("heading", { name: "No sessions yet" })).toBeVisible();
  await page.goBack();

  // apply: an ordinary session opens in the builder with the suggested drills and the exact minutes
  await expect(suggestion).toBeVisible();
  const names = (
    await suggestion.getByRole("listitem").locator("span.flex-1").allInnerTexts()
  ).filter((n) => n !== "Water break");
  await suggestion.getByRole("button", { name: "Create Session" }).click();
  await expect(page).toHaveURL(/\/sessions\/basketball\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(totals(page).getByTestId("total-minutes")).toContainText("60");
  const built = await timelineTitles(page).allInnerTexts();
  for (const name of names) expect(built).toContain(name);

  // the conversation is kept, marked applied, and can be found again
  await page.goto("/assistant/basketball");
  await expect(
    page
      .getByRole("complementary")
      .getByRole("link", { name: /Create a 60 minute shooting session/ }),
  ).toBeVisible();
  await page
    .getByRole("complementary")
    .getByRole("link", { name: /Create a 60 minute shooting session/ })
    .click();
  await expect(proposals(page).first()).toHaveAttribute("data-status", "applied");
  await expect(
    proposals(page).first().getByRole("link", { name: "Open in Session Builder" }),
  ).toBeVisible();
});

test("AI Coach: improve a session — a harder drill needs confirmation, a locked drill is left alone", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await signedIn(page, "AssistantModify");
  const builder = await sessionViaAssistant(page);

  // "Improve with AI" opens the assistant on this session
  await page.getByTestId("improve-with-ai").click();
  await expect(page).toHaveURL(/\/assistant\/basketball\?plan=/);
  await expect(page.getByTestId("chat-context")).toContainText("Working on");

  await page.getByRole("button", { name: "Make it harder" }).click();
  const replace = proposals(page).first();
  await expect(replace).toHaveAttribute("data-kind", "replace_drill", { timeout: 20_000 });
  const body = await replace.innerText();
  const from = /Replace “(.+?)” with “(.+?)”/.exec(body)!;
  await replace.getByRole("button", { name: "Replace Drill" }).click();

  // it replaces something, so it asks first — and shows what would change
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Apply this change?");
  await expect(dialog).toContainText(`Replace “${from[1]}” with “${from[2]}”`);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(replace).toHaveAttribute("data-status", "pending");
  await replace.getByRole("button", { name: "Replace Drill" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Yes, apply it" }).click();
  await expect(replace).toHaveAttribute("data-status", "applied", { timeout: 20_000 });

  // the session now has the new drill
  await page.goto(builder);
  await expect(card(page, from[2]!)).toBeVisible();
  await expect(card(page, from[1]!)).toHaveCount(0);

  // lock that drill: asking again never proposes touching it
  await card(page, from[2]!).getByRole("button", { name: /^More/ }).click();
  await page.getByRole("menuitem", { name: "Lock activity" }).click();
  await expect(card(page, from[2]!).getByText("Locked", { exact: true })).toBeVisible();
  await page.getByTestId("improve-with-ai").click();
  await page.getByRole("button", { name: "Make it easier" }).click();
  const easier = proposals(page).first();
  await expect(easier).toHaveAttribute("data-kind", "replace_drill", { timeout: 20_000 });
  await expect(easier).not.toContainText(`Replace “${from[2]}”`);
});

test("AI Coach: draw a diagram and change it — the picture is shown before anything is applied", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await signedIn(page, "AssistantDiagram");
  const builder = await sessionViaAssistant(page);
  await page.getByTestId("improve-with-ai").click();

  await page.getByRole("button", { name: "Draw a diagram" }).click();
  const drawing = proposals(page).first();
  await expect(drawing).toHaveAttribute("data-kind", "set_diagram", { timeout: 20_000 });
  await expect(drawing.getByRole("img", { name: "Suggested diagram" })).toBeVisible();
  await drawing.getByRole("button", { name: /Create Diagram|Update Diagram/ }).click();
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible().catch(() => false))
    await dialog.getByRole("button", { name: "Yes, apply it" }).click();
  await expect(drawing).toHaveAttribute("data-status", "applied", { timeout: 20_000 });

  await ask(page, "Add a defender to the diagram");
  const change = proposals(page).last();
  await expect(change).toHaveAttribute("data-kind", "set_diagram", { timeout: 20_000 });
  await expect(reply(page)).toContainText("prepared the change to the diagram");
  await change.getByRole("button", { name: "Update Diagram" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Yes, apply it" }).click();
  await expect(change).toHaveAttribute("data-status", "applied", { timeout: 20_000 });

  // the diagram is really on the activity now, and can be opened in the editor
  await page.goto(builder);
  await expect(page.locator("article svg").first()).toBeVisible();
});

test("AI Coach: explains a real drill from CoachOS, cancels, retries, and never shows markup", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signedIn(page, "AssistantMisc");
  await page.goto("/assistant/basketball");

  // explain mode: the answer comes from the drill, names its source, and marks its own suggestion
  await page.getByRole("button", { name: "Explain a drill" }).click();
  await expect(reply(page)).toContainText("From the CoachOS drill “Mikan Drill”", {
    timeout: 20_000,
  });
  await expect(reply(page)).toContainText("My own suggestion");
  await expect(
    log(page).getByTestId("chat-sources").getByRole("link", { name: "Mikan Drill" }),
  ).toBeVisible();

  // cancelling really cancels: the message comes back, nothing is added
  const count = await log(page).locator("[data-role]").count();
  await ask(page, "[[slow]] think about it");
  await expect(page.getByTestId("chat-working")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Message the AI Coach")).toHaveValue("[[slow]] think about it");
  await expect(log(page).locator("[data-role]")).toHaveCount(count);

  // a failure is said plainly, changes nothing, and can be retried
  await ask(page, "[[fail]] anything");
  await expect(page.getByTestId("chat-error")).toContainText(
    "Something went wrong and there is no answer",
  );
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(proposals(page)).toHaveCount(0);

  // a model that tries to sneak markup into a diagram gets nowhere, and the page stays intact
  await ask(page, "[[injection]] draw something");
  await expect(reply(page)).toContainText("The diagram was not valid");
  await expect(proposals(page)).toHaveCount(0);
  expect(await page.evaluate(() => Boolean((window as unknown as { pwned?: boolean }).pwned))).toBe(
    false,
  );

  // it is not a general chatbot: with no session it says what it needs
  await ask(page, "Make it harder");
  await expect(reply(page)).toContainText("could not do that");

  // history: the conversation can be deleted
  await page.reload();
  const side = page.getByRole("complementary");
  await expect(side.getByRole("link").first()).toBeVisible();
  await side
    .getByRole("button", { name: /^Delete conversation/ })
    .first()
    .click();
  await expect(page.getByText("Conversation deleted").first()).toBeVisible();
});

test("AI Coach: entry points — Create with AI, Ask about an activity, and the phone layout", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signedIn(page, "AssistantEntry");
  await page.goto(SESSIONS);
  await page.getByRole("link", { name: "Create with AI" }).click();
  await expect(page).toHaveURL(/\/assistant\/basketball\?prompt=/);
  await expect(page.getByLabel("Message the AI Coach")).toHaveValue(
    /Create a 60 minute shooting session/,
  ); // filled, never sent for the coach
  await expect(log(page).locator("[data-role]")).toHaveCount(0);

  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(proposals(page).first()).toBeVisible({ timeout: 20_000 });
  await proposals(page).first().getByRole("button", { name: "Create Session" }).click();
  await expect(page).toHaveURL(/\/sessions\/basketball\/[0-9a-f-]{36}$/, { timeout: 30_000 });

  // ask about one activity from its menu
  const first = (await timelineTitles(page).first().innerText()).trim();
  await card(page, first).getByRole("button", { name: /^More/ }).click();
  await page.getByRole("menuitem", { name: "Ask the AI about this" }).click();
  await expect(page).toHaveURL(/\/assistant\/basketball\?plan=.*&prompt=/);
  await expect(page.getByLabel("Message the AI Coach")).toHaveValue(
    new RegExp(`alternative for “${first.replace(/[()]/g, ".")}”`),
  );

  // the phone layout fits and the composer is usable
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
  const box = await page.getByRole("button", { name: "Send", exact: true }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

import { expect, test, type Page } from "@playwright/test";
import {
  completeOnboarding,
  newUser,
  signIn,
  signOut,
  signUpAndVerify,
  toast,
} from "./support/helpers";
import {
  choose,
  expectVar,
  hex,
  pages,
  panel,
  saveButton,
  settled,
  status,
} from "./support/document";
import { createSession, field, SESSIONS } from "./support/sessions";
import {
  menuItem,
  openCardMenu,
  saveAsTemplate,
  templateCard,
  templateIdOf,
  templatePanel,
  TEMPLATES,
} from "./support/templates";

async function signedIn(page: Page, label = "Templater") {
  const user = newUser(label);
  await signUpAndVerify(page, user);
  await completeOnboarding(page);
  return user;
}

const openDesign = async (page: Page, builder: string) => {
  await page.goto(`${builder}/document?view=design`);
  await expect(page.getByRole("heading", { level: 1, name: "Design and preview" })).toBeVisible();
  await settled(page);
};
const saveDesign = async (page: Page) => {
  await saveButton(page).click();
  await expect(status(page)).toHaveAttribute("data-state", "saved");
};
/** A session's design screen, saved with the Modern look and a green accent on Letter paper. */
const styleAsGreenModern = async (page: Page) => {
  await panel(page).getByLabel("Modern Basketball", { exact: true }).check({ force: true });
  await hex(page, "Accent").fill("#0a7d4b");
  await choose(page, "Paper", "Letter");
  await expectVar(page, "--d-accent", "#0a7d4b");
};

test("save a session's design as a template, then reuse it: new session, existing session, override wins", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await signedIn(page);

  // ---- a session with real content and a design of its own --------------------------------------------------
  const source = await createSession(page, {
    title: "Source session",
    team: "U14 Boys",
    date: "2030-06-11",
    start: "18:30",
    sessionNumber: "12",
    location: "Main gym",
  });
  await openDesign(page, source);
  await expect(templatePanel(page)).toContainText("This session is not based on a template.");
  await styleAsGreenModern(page);

  // ---- save as template: name, description, category ------------------------------------------------------------
  await saveAsTemplate(page, {
    name: "Friday sheet",
    description: "Green Modern sheet for Friday scrimmages",
    category: "Game day",
  });
  await expect(toast(page, "Template saved")).toBeVisible();
  await expect(templatePanel(page)).toContainText("Based on Friday sheet");
  await expect(templatePanel(page)).toContainText("Revision 1");
  await expect(status(page)).toHaveAttribute("data-state", "saved"); // saving the template saved the design too
  await page.reload();
  await settled(page);
  await expect(templatePanel(page)).toContainText("Based on Friday sheet");
  await expectVar(page, "--d-accent", "#0a7d4b");

  // ---- it is on the Templates page, as a card, with none of the session's data ------------------------------
  await page.goto(TEMPLATES);
  const card = templateCard(page, "Friday sheet");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Game day");
  await expect(card).toContainText("Personal");
  await expect(card).toContainText("Green Modern sheet for Friday scrimmages");
  await expect(card).toContainText("Modern Basketball");
  await expect(card).toContainText("Letter");
  await expect(card).toContainText("By you");
  for (const stale of ["Source session", "U14 Boys", "2030", "Main gym"])
    await expect(card).not.toContainText(stale);
  const templateId = await card
    .getByRole("link", { name: "Edit Friday sheet" })
    .getAttribute("href")
    .then((h) => /([0-9a-f-]{36})/.exec(h ?? "")![1]!);

  // ---- choose it when creating a NEW session: the design comes, nothing of the source session does ----------
  await page.goto(`${SESSIONS}/new`);
  await field(page, "Session title").fill("Second session");
  await field(page, "Start from a template").selectOption({ label: "Friday sheet" });
  await field(page, "Main objective").selectOption({ label: "Passing" });
  await page.getByRole("button", { name: "Create session and start building" }).click();
  await expect(page).toHaveURL(/\/sessions\/basketball\/[0-9a-f-]{36}$/);
  const second = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { level: 1, name: "Second session" })).toBeVisible();
  await expect(page.getByText("Source session")).toHaveCount(0);
  await openDesign(page, second);
  await expect(templatePanel(page)).toContainText("Based on Friday sheet");
  await expectVar(page, "--d-accent", "#0a7d4b");
  await expectVar(page, "--d-page-w", "215.9mm"); // Letter, as the template says
  await expect(pages(page).first()).toContainText("Second session");
  await expect(pages(page).first()).not.toContainText("Source session");
  await expect(pages(page).first()).not.toContainText("U14 Boys");
  await expect(pages(page).first()).not.toContainText("Main gym");
  await expect(status(page)).toHaveAttribute("data-state", "saved");

  // ---- the session's own change always wins over the template ------------------------------------------------
  await hex(page, "Accent").fill("#a11a1a");
  await expectVar(page, "--d-accent", "#a11a1a");
  await saveDesign(page);
  await page.reload();
  await settled(page);
  await expectVar(page, "--d-accent", "#a11a1a"); // the override survives a reload
  await expect(templatePanel(page)).toContainText("Based on Friday sheet");

  // ---- edit the template: existing sessions do not change, they are told an update exists -----------------------
  await page.goto(`${TEMPLATES}/${templateId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Friday sheet" })).toBeVisible();
  await settled(page);
  await hex(page, "Accent").fill("#1d4ed8");
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(toast(page, "Template saved")).toBeVisible();

  await openDesign(page, second);
  await expectVar(page, "--d-accent", "#a11a1a"); // unchanged: the session's own colour, and its frozen copy
  await expect(templatePanel(page)).toContainText("Revision 2 available");
  await openDesign(page, source);
  await expectVar(page, "--d-accent", "#0a7d4b"); // the source session still holds revision 1
  await expect(templatePanel(page)).toContainText("Revision 2 available");

  // ---- update the source session to the latest revision: it now follows the template --------------------------
  await templatePanel(page).getByRole("button", { name: "Update to latest" }).click();
  const updateDialog = page.getByRole("dialog", { name: "Apply a template" });
  await expect(updateDialog).toBeVisible();
  await expect(updateDialog).toContainText("changes the session’s design only");
  await updateDialog
    .getByRole("button", { name: /^(Yes, apply template|Apply template)$/ })
    .click();
  await expect(updateDialog).toBeHidden();
  await expectVar(page, "--d-accent", "#1d4ed8");
  await expect(templatePanel(page)).toContainText("Revision 2");
  await expect(templatePanel(page)).not.toContainText("available");

  // ---- apply it to an EXISTING session from the Templates page ----------------------------------------------
  const third = await createSession(page, { title: "Third session", team: "U16 Girls" });
  await page.goto(TEMPLATES);
  await openCardMenu(page, "Friday sheet");
  await menuItem(page, "Apply to a session").click();
  const dialog = page.getByRole("dialog", { name: "Apply a template" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("activities, date, time, players and notes are never touched");
  await dialog.getByRole("combobox", { name: "Session" }).selectOption({ label: "Third session" });
  await dialog.getByRole("button", { name: "Apply template", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(toast(page, "Applied “Friday sheet” to the session")).toBeVisible();

  await openDesign(page, third);
  await expectVar(page, "--d-accent", "#1d4ed8");
  await expect(templatePanel(page)).toContainText("Based on Friday sheet");
  await expect(pages(page).first()).toContainText("Third session");
  await expect(pages(page).first()).toContainText("U16 Girls");
  await page.goto(third);
  await expect(page.getByRole("heading", { level: 1, name: "Third session" })).toBeVisible();

  // ---- stop following: the session looks the same, the link is gone -----------------------------------------
  await openDesign(page, third);
  await templatePanel(page).getByRole("button", { name: "Stop following" }).click();
  await expect(toast(page, "Session no longer follows the template")).toBeVisible();
  await expect(templatePanel(page)).toContainText("This session is not based on a template.");
  await expectVar(page, "--d-accent", "#1d4ed8");
});

test("applying a template to a session that already has its own design asks first, and offers replace or keep", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signedIn(page);

  const source = await createSession(page, { title: "Template source" });
  await openDesign(page, source);
  await hex(page, "Accent").fill("#0a7d4b");
  await choose(page, "Paper", "Letter");
  await saveAsTemplate(page, { name: "Green letter", linkSession: false });
  await expect(templatePanel(page)).toContainText("This session is not based on a template.");

  const mine = await createSession(page, { title: "Has its own design" });
  await openDesign(page, mine);
  await panel(page).getByLabel("Minimal", { exact: true }).check({ force: true });
  await hex(page, "Accent").fill("#a11a1a");
  await saveDesign(page);

  // choose the template from the session's own design screen
  await templatePanel(page).getByRole("button", { name: "Choose a template" }).click();
  const dialog = page.getByRole("dialog", { name: "Apply a template" });
  await expect(dialog).toBeVisible();
  // the screen knows the session has a design of its own, so the question is asked before anything is applied
  await expect(dialog.getByText("This session already has its own design")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Apply template", exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("Replace my changes")).toBeChecked();
  await expect(dialog.getByLabel("Keep my changes")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Yes, apply template", exact: true }),
  ).toBeVisible();
  await expectVar(page, "--d-accent", "#a11a1a"); // nothing has happened yet

  // cancel: still nothing
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expectVar(page, "--d-accent", "#a11a1a");
  await expect(templatePanel(page)).toContainText("This session is not based on a template.");

  // keep my changes: the template applies, but the session's own accent still wins
  await templatePanel(page).getByRole("button", { name: "Choose a template" }).click();
  await dialog.getByLabel("Keep my changes").check({ force: true });
  await dialog.getByRole("button", { name: "Yes, apply template", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(templatePanel(page)).toContainText("Based on Green letter");
  await expectVar(page, "--d-accent", "#a11a1a"); // the session override won
  await expectVar(page, "--d-page-w", "215.9mm"); // …and the template supplied the rest (Letter)
  await page.reload();
  await settled(page);
  await expectVar(page, "--d-accent", "#a11a1a");

  // replace my changes: the session becomes exactly the template
  await templatePanel(page).getByRole("button", { name: "Change template" }).click();
  await dialog.getByLabel("Replace my changes").check({ force: true });
  await dialog.getByRole("button", { name: "Yes, apply template", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expectVar(page, "--d-accent", "#0a7d4b");
});

test("manage templates: create, edit, preview, duplicate, archive, restore, delete, search and filter", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signedIn(page);

  // ---- empty state ------------------------------------------------------------------------------------------
  await page.goto("/templates");
  await expect(page.getByRole("heading", { level: 1, name: "Templates" })).toBeVisible();
  await expect(page.getByText("No templates yet")).toBeVisible();
  await page.goto(TEMPLATES);
  await expect(page.getByText("No templates yet")).toBeVisible();

  // ---- create from scratch ------------------------------------------------------------------------------------
  await page.getByRole("link", { name: "New template" }).first().click();
  await expect(page).toHaveURL(/\/templates\/basketball\/new$/);
  await expect(page.getByRole("heading", { level: 1, name: "New template" })).toBeVisible();
  await expect(page.getByText(/Previewed on an example Basketball session/)).toBeVisible();
  await settled(page);
  // the preview is the real document, on an example session (real drills, invented details)
  await expect(pages(page).first()).toContainText("Example session");
  await field(panel(page), "Name").fill("Practice sheet");
  await field(panel(page), "Description (optional)").fill("Everyday practice");
  await field(panel(page), "Category").selectOption({ label: "Practice" });
  await panel(page).getByLabel("Professional", { exact: true }).check({ force: true });
  await expectVar(page, "--d-primary", "#0f766e");
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page).toHaveURL(/\/templates\/basketball\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Practice sheet" })).toBeVisible();
  const firstId = templateIdOf(page);

  // an unreadable colour cannot be saved (the form says so first)
  await hex(page, "Text").fill("#f5f5f5");
  await expect(page.getByRole("button", { name: "Save template" })).toBeDisabled();
  await hex(page, "Text").fill("#111111");

  // ---- edit ---------------------------------------------------------------------------------------------------
  await field(panel(page), "Name").fill("Practice sheet v2");
  await expect(page.locator('[role="status"][data-state]')).toHaveAttribute(
    "data-state",
    "unsaved",
  );
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(toast(page, "Template saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Practice sheet v2" })).toBeVisible();
  await expect(page.getByText(/Revision 2 · version/).first()).toBeVisible(); // the name and the text colour changed in one save: a design change
  await field(panel(page), "Name").fill("Practice sheet v2 (renamed)");
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(toast(page, "Template saved")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Revision 2 · version/).first()).toBeVisible(); // a rename alone is not a design change
  await field(panel(page), "Name").fill("Practice sheet v2");
  await hex(page, "Accent").fill("#0a7d4b");
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(toast(page, "Template saved")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Revision 3 · version/).first()).toBeVisible(); // a design change is

  // ---- duplicate ----------------------------------------------------------------------------------------------
  await page.getByRole("button", { name: "Template actions" }).click();
  await menuItem(page, "Duplicate").click();
  await expect(toast(page, "Template duplicated")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Copy of Practice sheet v2" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/templates\/basketball\/[0-9a-f-]{36}$/);
  expect(templateIdOf(page)).not.toBe(firstId);

  // ---- the list: cards, search, category, scope --------------------------------------------------------------------
  await page.goto(TEMPLATES);
  await expect(templateCard(page, "Practice sheet v2")).toBeVisible();
  await expect(templateCard(page, "Copy of Practice sheet v2")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "2 templates" })).toBeVisible();

  const filters = page.getByRole("complementary", { name: "Filter templates" });
  await field(filters, "Search").fill("copy");
  await filters
    .getByRole("button", { name: /Apply|Search|Filter/ })
    .first()
    .click();
  await expect(page).toHaveURL(/q=copy/);
  await expect(templateCard(page, "Copy of Practice sheet v2")).toBeVisible();
  await expect(templateCard(page, "Practice sheet v2")).toHaveCount(0);
  await page.goto(`${TEMPLATES}?category=school`);
  await expect(page.getByText("No templates match these filters")).toBeVisible();
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(templateCard(page, "Practice sheet v2")).toBeVisible();
  await page.goto("/templates"); // every sport
  await expect(templateCard(page, "Practice sheet v2")).toBeVisible();

  // ---- preview ------------------------------------------------------------------------------------------------
  await templateCard(page, "Practice sheet v2")
    .getByRole("link", { name: "Preview Practice sheet v2" })
    .click();
  await expect(page).toHaveURL(/\?view=preview$/);
  await settled(page);
  await expect(pages(page).first()).toBeVisible();
  await expectVar(page, "--d-accent", "#0a7d4b");

  // ---- archive → archived view → restore ----------------------------------------------------------------------
  await page.goto(TEMPLATES);
  await openCardMenu(page, "Copy of Practice sheet v2");
  await menuItem(page, "Archive").click();
  await expect(toast(page, "Template archived")).toBeVisible();
  await expect(templateCard(page, "Copy of Practice sheet v2")).toHaveCount(0);
  await page.goto(`${TEMPLATES}?status=archived`);
  const archived = templateCard(page, "Copy of Practice sheet v2");
  await expect(archived).toContainText("Archived");
  await expect(
    archived.getByRole("link", { name: /New session|Create a new session/ }),
  ).toHaveCount(0); // not usable while archived
  await openCardMenu(page, "Copy of Practice sheet v2");
  await menuItem(page, "Restore").click();
  await expect(toast(page, "Template restored")).toBeVisible();
  await page.goto(TEMPLATES);
  await expect(templateCard(page, "Copy of Practice sheet v2")).toBeVisible();

  // an archived template cannot be chosen for a new session
  await openCardMenu(page, "Copy of Practice sheet v2");
  await menuItem(page, "Archive").click();
  await expect(toast(page, "Template archived")).toBeVisible();
  await page.goto(`${SESSIONS}/new`);
  const choices = field(page, "Start from a template");
  await expect(choices.locator("option")).toHaveText([
    "No template (standard design)",
    "Practice sheet v2",
  ]);

  // ---- delete (asks first) → deleted view → restore ------------------------------------------------------------
  await page.goto(`${TEMPLATES}?status=archived`);
  await openCardMenu(page, "Copy of Practice sheet v2");
  await menuItem(page, "Delete").click();
  const confirm = page.getByRole("dialog", { name: "Delete this template?" });
  await expect(confirm).toContainText("Sessions that already use it keep their design");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(templateCard(page, "Copy of Practice sheet v2")).toBeVisible();
  await openCardMenu(page, "Copy of Practice sheet v2");
  await menuItem(page, "Delete").click();
  await confirm.getByRole("button", { name: "Delete template" }).click();
  await expect(toast(page, "Template deleted")).toBeVisible();
  await page.goto(`${TEMPLATES}?status=deleted`);
  const deleted = templateCard(page, "Copy of Practice sheet v2");
  await expect(deleted).toContainText("Deleted");
  await deleted.getByRole("button", { name: "Restore Copy of Practice sheet v2" }).click();
  await expect(toast(page, "Template restored")).toBeVisible();
});

test("a template belongs to its workspace: another account cannot see, open or use it", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await signedIn(page, "Owner");
  const source = await createSession(page, { title: "Private source" });
  await openDesign(page, source);
  await hex(page, "Accent").fill("#0a7d4b");
  await saveAsTemplate(page, { name: "Secret sheet" });
  await page.goto(TEMPLATES);
  await templateCard(page, "Secret sheet").getByRole("link", { name: "Edit Secret sheet" }).click();
  await expect(page).toHaveURL(/\/templates\/basketball\/[0-9a-f-]{36}$/);
  const editorUrl = page.url();
  const id = templateIdOf(page);

  // a second, separate account
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await signedIn(page2, "Other");
  await page2.goto(TEMPLATES);
  await expect(page2.getByText("Secret sheet")).toHaveCount(0);
  await expect(page2.getByText("No templates yet")).toBeVisible();
  await page2.goto(editorUrl); // not-found pages stream with a 200: judge by what is shown
  await expect(page2.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page2.getByText("Secret sheet")).toHaveCount(0);
  await page2.goto(`${SESSIONS}/new?template=${id}`); // asking for it by id does not smuggle it in
  await expect(field(page2, "Session title")).toBeVisible();
  await expect(page2.getByLabel("Start from a template", { exact: true })).toHaveCount(0);
  await other.close();

  // signed out: the sign-in page, not the templates
  await signOut(page);
  await page.goto(editorUrl);
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/templates");
  await expect(page).toHaveURL(/\/sign-in/);
  void signIn;
});

test("leaving the template editor with unsaved changes asks first", async ({ page }) => {
  test.setTimeout(120_000);
  await signedIn(page);
  await page.goto(`${TEMPLATES}/new`);
  await settled(page);
  await field(panel(page), "Name").fill("Unsaved one");
  await hex(page, "Accent").fill("#0a7d4b");
  await page.getByRole("link", { name: "Templates", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Unsaved design changes" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page).toHaveURL(/\/templates\/basketball\/new$/);
});

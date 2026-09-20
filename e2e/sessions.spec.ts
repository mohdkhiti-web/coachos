import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, newUser, signUpAndVerify, toast } from "./support/helpers";
import {
  addBreak,
  addCustom,
  card,
  createSession,
  field,
  fillSession,
  pickDrill,
  SESSIONS,
  timelineTitles,
  totals,
} from "./support/sessions";

async function signedIn(page: Page, label = "Coach") {
  const user = newUser(label);
  await signUpAndVerify(page, user);
  await completeOnboarding(page);
  return user;
}

const total = (page: Page) => totals(page).getByTestId("total-minutes");
const endTime = (page: Page) => totals(page).getByTestId("end-time");
const saved = (page: Page) => page.locator('[data-state="saved"]');
const nav = (page: Page) => page.getByRole("navigation", { name: "Main navigation" }).first();

test("the whole session journey: create, describe, choose objectives, build, reorder, edit, persist, duplicate", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await signedIn(page);

  // ---- Sessions is in the main navigation, and a coach with no sessions is invited to create one ----
  await nav(page).getByRole("link", { name: "Sessions" }).click();
  await expect(page).toHaveURL(/\/sessions\/basketball$/);
  await expect(page.getByRole("heading", { level: 1, name: "My Sessions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No sessions yet" })).toBeVisible();
  await expect(page.getByText("Create your first basketball training session.")).toBeVisible();

  // ---- 1-3: create a session: information and objectives ----------------------------------------
  await page.getByRole("link", { name: "Create session" }).first().click();
  await expect(page).toHaveURL(/\/sessions\/basketball\/new$/);
  await fillSession(page, {
    title: "U14 Tuesday Shooting",
    team: "U14 Boys",
    ageGroup: "U14 (13–14)",
    level: "Intermediate",
    players: "14",
    date: "2030-06-11",
    start: "18:30",
    location: "Main gym",
    season: "2030",
    sessionNumber: "12",
    objective: "Shooting",
    also: ["Defense", "Transition"],
  });
  // the selected objectives are visible, and one can be removed again with the same click
  await expect(page.getByRole("button", { name: "Defense", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Transition", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Transition", exact: true }).click();
  await expect(page.getByRole("button", { name: "Transition", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.getByRole("button", { name: "Transition", exact: true }).click();
  await page.getByRole("button", { name: "Create session and start building" }).click();

  // ---- the builder opens, with an empty timeline and a useful empty state --------------------------
  await expect(page).toHaveURL(/\/sessions\/basketball\/[0-9a-f-]{36}$/);
  const builder = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { level: 1, name: "U14 Tuesday Shooting" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your session is empty" })).toBeVisible();
  await expect(
    page.getByText("Add a drill, custom activity or break to start building your session."),
  ).toBeVisible();
  await expect(total(page)).toHaveText("0");
  await expect(endTime(page)).toHaveText("6:30 PM");
  await expect(page.getByText("Shooting", { exact: true }).first()).toBeVisible();

  // ---- 4: add a drill from the library's own search, with duration / players / repetitions / notes --
  await pickDrill(page, builder, "five-spot", "Five-Spot Shooting");
  await field(page, "Duration (min)").fill("15");
  await field(page, "Players").fill("12");
  await field(page, "Repetitions").fill("3");
  await field(page, "Notes").fill("Both hands, call your makes.");
  await page.getByRole("button", { name: "Add to session" }).click();
  await expect(page).toHaveURL(/\/sessions\/basketball\/[0-9a-f-]{36}#activity-/);
  const drill = card(page, "Five-Spot Shooting");
  await expect(drill).toBeVisible();
  await expect(drill).toContainText("00:00–15:00");
  await expect(drill).toContainText("15 min");
  await expect(drill).toContainText("12 players");
  await expect(drill).toContainText("3 repetitions");
  await expect(drill).toContainText("Both hands, call your makes.");
  await expect(total(page)).toHaveText("15");

  // ---- 5: a custom activity ----------------------------------------------------------------------
  await addCustom(page, "Team talk", 5, "Goals for tonight");
  await expect(card(page, "Team talk")).toContainText("15:00–20:00");
  await expect(total(page)).toHaveText("20");

  // ---- 6: a break, visibly different from a drill -------------------------------------------------
  await addBreak(page, "Water break", 3);
  const pause = card(page, "Water break");
  await expect(pause).toHaveAttribute("data-kind", "break");
  await expect(drill).toHaveAttribute("data-kind", "drill");
  await expect(pause).toContainText("20:00–23:00");
  await expect(total(page)).toHaveText("23");
  // 18:30 + 23 minutes = 18:53, calculated by the same code the server uses
  await expect(endTime(page)).toHaveText("6:53 PM");
  await expect(timelineTitles(page)).toHaveText(["Five-Spot Shooting", "Team talk", "Water break"]);

  // ---- 7: reorder with the buttons; times follow, the total does not change -------------------------
  await card(page, "Water break").getByRole("button", { name: "Move Water break up" }).click();
  await expect(timelineTitles(page)).toHaveText(["Five-Spot Shooting", "Water break", "Team talk"]);
  await expect(card(page, "Water break")).toContainText("15:00–18:00");
  await expect(card(page, "Team talk")).toContainText("18:00–23:00");
  await expect(total(page)).toHaveText("23");
  await expect(endTime(page)).toHaveText("6:53 PM");

  // ---- 8-9: edit a duration: total and end time follow ---------------------------------------------
  await card(page, "Team talk").getByRole("button", { name: "Edit Team talk" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Duration (min)").fill("15");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, "Team talk")).toContainText("18:00–33:00");
  await expect(total(page)).toHaveText("33");
  await expect(endTime(page)).toHaveText("7:03 PM");

  // ---- autosave of the session details -------------------------------------------------------------
  await field(page, "Team").fill("U14 Girls");
  await expect(page.locator('[data-state="unsaved"], [data-state="saving"]').first()).toBeVisible();
  await expect(saved(page)).toBeVisible();
  await field(page, "Start time").fill("19:00");
  await expect(endTime(page)).toHaveText("7:33 PM"); // instantly, from the shared calculation
  await expect(saved(page)).toBeVisible();

  // ---- 10: reload: everything persisted ------------------------------------------------------------
  await page.reload();
  await expect(timelineTitles(page)).toHaveText(["Five-Spot Shooting", "Water break", "Team talk"]);
  await expect(total(page)).toHaveText("33");
  await expect(endTime(page)).toHaveText("7:33 PM");
  await expect(field(page, "Team")).toHaveValue("U14 Girls");
  await expect(field(page, "Start time")).toHaveValue("19:00");
  await expect(field(page, "Session number")).toHaveValue("12");
  await expect(field(page, "Location / court")).toHaveValue("Main gym");
  await expect(field(page, "Age group")).toHaveValue("u14");
  await expect(field(page, "Main objective")).toHaveValue("shooting");

  // ---- 11: duplicate the session: a new, independent copy -------------------------------------------
  await page.getByRole("button", { name: "Session actions" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Copy of U14 Tuesday Shooting" }),
  ).toBeVisible();
  const copyPath = new URL(page.url()).pathname;
  expect(copyPath).not.toBe(builder);
  await expect(timelineTitles(page)).toHaveText(["Five-Spot Shooting", "Water break", "Team talk"]);
  await expect(total(page)).toHaveText("33");
  // removing an activity from the copy leaves the original alone
  await card(page, "Water break")
    .getByRole("button", { name: "More actions for Water break" })
    .click();
  await page.getByRole("menuitem", { name: "Remove from session" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click();
  await expect(card(page, "Water break")).toHaveCount(0);
  await expect(total(page)).toHaveText("30");
  await page.goto(builder);
  await expect(timelineTitles(page)).toHaveText(["Five-Spot Shooting", "Water break", "Team talk"]);
  await expect(total(page)).toHaveText("33");

  // My Sessions now lists both, with what a coach scans for
  await page.goto(SESSIONS);
  const original = page.getByRole("article", { exact: true, name: "U14 Tuesday Shooting" });
  await expect(original).toContainText("U14 Girls");
  await expect(original).toContainText("U14");
  await expect(original).toContainText("Intermediate");
  await expect(original).toContainText("33 min");
  await expect(original).toContainText("3 activities");
  await expect(original).toContainText("Draft");
  await expect(original).toContainText("Shooting");
  await expect(original).toContainText("Updated");
  await expect(
    page.getByRole("article", { exact: true, name: "Copy of U14 Tuesday Shooting" }),
  ).toContainText("2 activities");

  // ---- 12: another workspace cannot reach the session --------------------------------------------
  const other = await browser.newContext();
  const stranger = await other.newPage();
  await signedIn(stranger, "Stranger");
  for (const path of [builder, `${builder}/drills`]) {
    await stranger.goto(path); // (the not-found UI streams in behind loading.tsx, so the content, not the HTTP status, is the contract)
    await expect(stranger.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(stranger.getByText("U14 Tuesday Shooting")).toHaveCount(0);
  }
  await stranger.goto(SESSIONS);
  await expect(stranger.getByRole("heading", { name: "No sessions yet" })).toBeVisible();
  await other.close();
});

test("a library drill copied into a session keeps what the coach chose; updating it is a deliberate choice", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signedIn(page);
  const builder = await createSession(page, { title: "Snapshot session", objective: "Defense" });

  // make my own copy of a library drill, so I can change it afterwards
  await page.goto("/sports/basketball/drills?q=closeout");
  await page.getByRole("link", { name: "Closeout and Contain" }).click();
  await page.getByRole("button", { name: "Copy to my drills" }).click();
  await expect(
    page.getByRole("heading", { name: "Copy of Closeout and Contain", level: 2 }),
  ).toBeVisible({
    timeout: 20_000,
  });
  const drillPath = new URL(page.url()).pathname;

  // add the copy to the session
  await pickDrill(page, builder, "Copy of Closeout", "Copy of Closeout and Contain");
  await page.getByRole("button", { name: "Add to session" }).click();
  const c = card(page, "Copy of Closeout and Contain");
  await expect(c).toBeVisible();
  await expect(c).not.toContainText("Update available");

  // the coach edits the drill in the library afterwards
  await page.goto(`${drillPath}/edit`);
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Closeout and Contain, version two");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "Closeout and Contain, version two", level: 2 }),
  ).toBeVisible();

  // the session did NOT change by itself: it still shows the drill as the coach chose it
  await page.goto(builder);
  const same = card(page, "Copy of Closeout and Contain");
  await expect(same).toBeVisible();
  await expect(same).toContainText("Update available");
  await expect(card(page, "Closeout and Contain, version two")).toHaveCount(0);
  await page.reload();
  await expect(card(page, "Copy of Closeout and Contain")).toBeVisible();

  // only a deliberate action updates it
  await same.getByRole("button", { name: "Update from library" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Update", exact: true }).click();
  await expect(card(page, "Closeout and Contain, version two")).toBeVisible();
  await expect(card(page, "Closeout and Contain, version two")).not.toContainText(
    "Update available",
  );
  await expect(toast(page, "Updated from the library")).toBeVisible();
});

test("replace a drill: pick another drill, the slot and the minutes stay", async ({ page }) => {
  test.setTimeout(180_000);
  await signedIn(page);
  const builder = await createSession(page, { title: "Replace session", objective: "Shooting" });
  await pickDrill(page, builder, "five-spot", "Five-Spot Shooting");
  await field(page, "Duration (min)").fill("12");
  await page.getByRole("button", { name: "Add to session" }).click();
  await addBreak(page, "Water break", 2);

  await card(page, "Five-Spot Shooting")
    .getByRole("button", { name: "More actions for Five-Spot Shooting" })
    .click();
  await page.getByRole("menuitem", { name: "Replace drill" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Replace Five-Spot Shooting" }),
  ).toBeVisible();
  const filters = page.getByRole("search", { name: "Filters" });
  await filters.getByLabel("Search").fill("mikan");
  await expect(page).toHaveURL(/q=mikan/);
  await page.getByRole("link", { name: "Use this drill: Mikan Drill" }).click();
  await expect(
    page.getByText("This will replace “Five-Spot Shooting” in your session."),
  ).toBeVisible();
  await page.getByLabel("Why are you replacing it?").fill("Too crowded for our gym");
  await page.getByRole("button", { name: "Replace drill" }).click();

  await expect(timelineTitles(page)).toHaveText(["Mikan Drill", "Water break"]);
  await expect(card(page, "Mikan Drill")).toContainText("00:00–12:00");
  await expect(total(page)).toHaveText("14");
});

test("the builder refuses obvious mistakes in the browser, and the server refuses them again", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signedIn(page);

  // creating: a title and a main objective are needed; errors are shown next to the fields
  await page.goto(`${SESSIONS}/new`);
  await field(page, "Number of players").fill("99");
  await field(page, "Date").fill("2030-06-11");
  await field(page, "Start time").fill("");
  await page.getByRole("button", { name: "Create session and start building" }).click();
  await expect(page.getByText("Some fields need attention").first()).toBeVisible();
  await expect(page.getByText("This field is required.").first()).toBeVisible();
  await expect(page.getByText("Enter a number within the allowed range.").first()).toBeVisible();
  await expect(page).toHaveURL(/\/new$/); // nothing was created

  await fillSession(page, {
    title: "Valid session",
    objective: "Passing",
    players: "12",
    date: "2030-06-11",
  });
  await field(page, "Duration (minutes)").fill("4");
  await page.getByRole("button", { name: "Create session and start building" }).click();
  await expect(page.getByText("Enter a number within the allowed range.").first()).toBeVisible();
  await field(page, "Duration (minutes)").fill("60");
  await page.getByRole("button", { name: "Create session and start building" }).click();
  await expect(page).toHaveURL(/\/sessions\/basketball\/[0-9a-f-]{36}$/);

  // an activity dialog: no zero duration, no session longer than twelve hours
  await page.getByRole("button", { name: "Break", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Duration (min)").fill("0");
  await dialog.getByRole("button", { name: "Add to session" }).click();
  await expect(dialog.getByText("Enter a number within the allowed range.")).toBeVisible();
  await dialog.getByLabel("Duration (min)").fill("3");
  await dialog.getByRole("button", { name: "Add to session" }).click();
  await expect(dialog).toBeHidden();
  for (const [title, minutes] of [
    ["Block A", 240],
    ["Block B", 240],
    ["Block C", 237],
  ] as const)
    await addCustom(page, title, minutes);
  await page.getByRole("button", { name: "Custom activity", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Activity title").fill("Too much");
  await page.getByRole("dialog").getByLabel("Duration (min)").fill("100");
  await page.getByRole("dialog").getByRole("button", { name: "Add to session" }).click();
  await expect(
    page.getByRole("dialog").getByText("A session can run for at most 12 hours in total."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(total(page)).toHaveText("720");

  // invalid details do not save (and say so); fixing them does
  await field(page, "Number of players").fill("0");
  await expect(page.locator('[data-state="invalid"]')).toBeVisible();
  await field(page, "Number of players").fill("14");
  await expect(saved(page)).toBeVisible();
});

test("archive, restore and delete from My Sessions, with filters and search", async ({ page }) => {
  test.setTimeout(180_000);
  await signedIn(page);
  await createSession(page, {
    title: "Alpha shooting",
    team: "Wolves",
    objective: "Shooting",
    ageGroup: "U12 (11–12)",
    date: "2030-03-01",
  });
  await createSession(page, {
    title: "Beta defense",
    team: "Hawks",
    objective: "Defense",
    ageGroup: "U16 (15–16)",
    date: "2030-05-01",
  });
  await page.goto(SESSIONS);
  await expect(page.getByRole("article")).toHaveCount(2);

  // search, status, age group, team and date filters
  const filters = page.getByRole("search", { name: "Filters" });
  await filters.getByLabel("Search").fill("beta");
  await expect(page).toHaveURL(/q=beta/);
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article", { exact: true, name: "Beta defense" })).toBeVisible();
  await page.goto(`${SESSIONS}?age=u12`);
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article", { exact: true, name: "Alpha shooting" })).toBeVisible();
  await page.goto(`${SESSIONS}?team=Hawks`);
  await expect(page.getByRole("article", { exact: true, name: "Beta defense" })).toBeVisible();
  await page.goto(`${SESSIONS}?from=2030-04-01&to=2030-06-01`);
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article", { exact: true, name: "Beta defense" })).toBeVisible();
  await page.goto(`${SESSIONS}?q=zzzz`);
  await expect(page.getByRole("heading", { name: "No sessions match" })).toBeVisible();

  // archive → gone from Active, present in Archived → restore
  await page.goto(SESSIONS);
  await page.getByRole("button", { name: "Archive Alpha shooting" }).click();
  await expect(toast(page, "Session archived")).toBeVisible();
  await expect(page.getByRole("article", { exact: true, name: "Alpha shooting" })).toHaveCount(0);
  await page.getByRole("link", { name: "Archived", exact: true }).click();
  const archived = page.getByRole("article", { exact: true, name: "Alpha shooting" });
  await expect(archived).toContainText("Archived");
  await archived.getByRole("button", { name: "Restore Alpha shooting from the archive" }).click();
  await expect(toast(page, "Session restored as a draft")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nothing archived" })).toBeVisible();

  // delete (asks first) → in Deleted → restore
  await page.getByRole("link", { name: "Active", exact: true }).click();
  await page.getByRole("button", { name: "Delete Beta defense" }).click();
  await expect(page.getByRole("dialog")).toContainText("Beta defense");
  await page.getByRole("dialog").getByRole("button", { name: "Delete session" }).click();
  await expect(toast(page, "Session deleted")).toBeVisible();
  await expect(page.getByRole("article", { exact: true, name: "Beta defense" })).toHaveCount(0);
  await page.getByRole("link", { name: "Deleted", exact: true }).click();
  const gone = page.getByRole("article", { exact: true, name: "Beta defense" });
  await expect(gone).toContainText("Deleted");
  await gone.getByRole("button", { name: "Restore Beta defense from deleted sessions" }).click();
  await expect(toast(page, "Session restored")).toBeVisible();
  await page.getByRole("link", { name: "Active", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(2);

  // duplicate from the list
  await page.getByRole("button", { name: "Duplicate Alpha shooting" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Copy of Alpha shooting" }),
  ).toBeVisible();
});

test("keyboard-only: the timeline is fully operable without a mouse or dragging", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await signedIn(page);
  await createSession(page, { title: "Keyboard session", objective: "Passing" });
  await addBreak(page, "First break", 2);
  await addBreak(page, "Second break", 3);
  await addBreak(page, "Third break", 4);
  await expect(timelineTitles(page)).toHaveText(["First break", "Second break", "Third break"]);

  // Move down with Enter on the labelled button; focus stays on the same control
  const down = page.getByRole("button", { name: "Move First break down" });
  await down.focus();
  await page.keyboard.press("Enter");
  await expect(timelineTitles(page)).toHaveText(["Second break", "First break", "Third break"]);
  await expect(page.getByRole("button", { name: "Move First break down" })).toBeFocused();
  await expect(
    page.getByRole("status").filter({ hasText: "Moved First break to position 2 of 3." }),
  ).toBeAttached();
  await page.keyboard.press("Enter");
  await expect(timelineTitles(page)).toHaveText(["Second break", "Third break", "First break"]);
  // at the bottom the "down" button is disabled and focus moves to "up" instead of being lost
  await expect(page.getByRole("button", { name: "Move First break up" })).toBeFocused();

  // dragging works from the keyboard too: Space lifts, arrows move, Space drops
  // (dnd-kit attaches its key listeners a moment after lifting, so wait for each announcement)
  await page.getByRole("button", { name: "Drag Third break to reorder" }).focus();
  await page.keyboard.press("Space");
  const live = page.locator('[id^="DndLiveRegion"]');
  // (lifting announces "Picked up…" and, at once, where it is: either is proof the drag started)
  await expect(live).toContainText(/Picked up Third break|Third break is over position 2 of 3/);
  await page.keyboard.press("ArrowDown");
  await expect(live).toContainText("Third break is over position 3 of 3.");
  await page.keyboard.press("Space");
  await expect(live).toContainText("Dropped Third break at position 3 of 3.");
  await expect(timelineTitles(page)).toHaveText(["Second break", "First break", "Third break"]);
  await page.reload();
  await expect(timelineTitles(page)).toHaveText(["Second break", "First break", "Third break"]);

  // an edit dialog traps focus, closes on Escape and returns focus to where it started
  const edit = page.getByRole("button", { name: "Edit Second break" });
  await edit.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(edit).toBeFocused();
});

test("read-only sessions: a colleague-less archived session cannot be edited and says why", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signedIn(page);
  const builder = await createSession(page, { title: "Frozen session", objective: "Footwork" });
  await addBreak(page, "A break", 2);
  await page.getByRole("button", { name: "Session actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(toast(page, "Session archived")).toBeVisible();
  await page.goto(builder);
  await expect(
    page.getByRole("note").filter({ hasText: "This session is archived, so it cannot be edited." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Break", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit A break" })).toHaveCount(0);
  await expect(field(page, "Session title")).toBeDisabled();
  // the drill picker sends a read-only session back to its builder
  await page.goto(`${builder}/drills`);
  await expect(page).toHaveURL(new RegExp(`${builder}$`));
  // …and it can be restored from the menu
  await page.getByRole("button", { name: "Session actions" }).click();
  await page.getByRole("menuitem", { name: "Restore" }).click();
  await expect(page.getByRole("button", { name: "Break", exact: true })).toBeVisible();
});

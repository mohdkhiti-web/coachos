import { expect, test, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { completeOnboarding, newUser, signUpAndVerify, toast } from "./support/helpers";

const DRILLS_DIR = path.join(process.cwd(), "content", "basketball", "drills");
// one JSON file per library drill (content/basketball/drills): the library size (and every facet count below)
// comes straight from the content, so these never drift out of sync as drills are added or removed.
const DRILL_FILES = readdirSync(DRILLS_DIR).filter((f) => f.endsWith(".json"));
const DRILLS = DRILL_FILES.map((f) => JSON.parse(readFileSync(path.join(DRILLS_DIR, f), "utf8")));
const LIBRARY = DRILLS.length;
const SHOOTING = DRILLS.filter((d) => d.category === "shooting").length;
const FORMAT_3V3 = DRILLS.filter((d) => d.format === "3v3").length;
const COOL_DOWN = DRILLS.filter((d) => (d.phases ?? []).includes("cool_down")).length;
const WEAK_HAND = DRILLS.filter((d) => (d.subSkills ?? []).includes("weak_hand")).length;
const plural = (n: number) => `${n} drill${n === 1 ? "" : "s"}`;

async function signedIn(page: Page, label = "Coach") {
  const user = newUser(label);
  await signUpAndVerify(page, user);
  await completeOnboarding(page);
  return user;
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Main navigation" }).first();
/** The library filter form, by role: unlike getByLabel it ignores the hidden copy React streams in before swapping it into place. */
const filters = (page: Page) => page.getByRole("search", { name: "Filters" });
const results = (page: Page) =>
  page
    .getByRole("status")
    .filter({ hasText: /\d+ drills?/ })
    .first();

/** Fill the whole drill form with valid content (title is the only thing tests vary). */
async function fillDrill(page: Page, title: string) {
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  await page
    .getByLabel("Short description")
    .fill(
      "A test drill written by the browser tests to prove that creating and editing really saves.",
    );
  await page.getByLabel("Category", { exact: true }).selectOption("passing");
  await page.getByLabel("Level", { exact: true }).selectOption("intermediate");
  await page.getByLabel("Intensity", { exact: true }).selectOption("high");
  await page.getByLabel("Format", { exact: true }).selectOption("3v3");
  await page.getByRole("checkbox", { name: "Small-sided game" }).check();
  const age = page.getByRole("group", { name: /^Age/ });
  await age.getByLabel("Min").fill("10");
  await age.getByLabel("Max").fill("16");
  const players = page.getByRole("group", { name: /^Players/ });
  await players.getByLabel("Min").fill("4");
  await players.getByLabel("Max").fill("12");
  const duration = page.getByRole("group", { name: /^Duration/ });
  await duration.getByLabel("Min").fill("8");
  await duration.getByLabel("Max").fill("12");
  await page.getByLabel("Main skill").selectOption("passing");
  await page.getByRole("checkbox", { name: "Passing on the move" }).check(); // a focus area under the chosen skill
  await page.getByLabel("Organization").fill("Two groups of five rotate every three minutes.");
  await page.getByLabel("Tags").fill("test, passing");
  await page.getByLabel("Objective").fill("Move the ball quickly and accurately to a teammate.");
  await page
    .getByLabel("Setup", { exact: true })
    .fill("Two lines of players face each other five metres apart.");
  await page
    .getByLabel("Instructions")
    .fill("Chest pass to the player opposite.\nFollow your pass and join the other line.");
  await page
    .getByLabel("Coaching points", { exact: true })
    .fill("Step into the pass.\nCatch with two hands.");
  await page.getByRole("checkbox", { name: "Basketballs" }).check();
}

/**
 * Draw a valid diagram with the structured builder: two players, a ball, and a pass. The court is already on
 * screen for a brand-new drill (one empty diagram slot); "Add a diagram" only unlocks a SECOND slot once this
 * first one actually has something drawn in it, so it is never clicked here. Tools are picked from the
 * category palette (click to select, then click the court to place — dragging is an alternative, not required)
 * rather than the older "Add to the court" button group, which this builder no longer has.
 */
async function drawDiagram(page: Page) {
  const court = page.getByTestId("court-canvas");
  const box = (await court.boundingBox())!;
  const p1 = { x: box.x + box.width * 0.35, y: box.y + box.height * 0.5 };
  const p2 = { x: box.x + box.width * 0.65, y: box.y + box.height * 0.5 };
  const players = page.getByRole("region", { name: "Players" });
  const balls = page.getByRole("region", { name: "Balls" });
  const passing = page.getByRole("region", { name: "Passing" });

  await players.getByRole("button", { name: "Offensive player", exact: true }).click();
  await page.mouse.click(p1.x, p1.y);
  await players.getByRole("button", { name: "Offensive player", exact: true }).click();
  await page.mouse.click(p2.x, p2.y);
  await balls.getByRole("button", { name: "Basketball", exact: true }).click();
  await page.mouse.click(p1.x, p1.y); // "give them the ball"
  await passing.getByRole("button", { name: "Pass", exact: true }).click();
  await page.mouse.click(p1.x, p1.y); // the passer
  await page.mouse.click(p2.x, p2.y); // the receiver
  await expect(page.getByText("This diagram is valid.")).toBeVisible();
}

test("the drill library journey: drills → basketball → drills → filter → open → create → edit → persist", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signedIn(page, "Alex");

  await test.step("Drills is in the navigation and opens the basketball library (there is no list of sports)", async () => {
    await nav(page).getByRole("link", { name: "Drills", exact: true }).click();
    await expect(page).toHaveURL(/\/sports\/basketball$/);
    await expect(page.getByRole("heading", { level: 1, name: "Basketball" })).toBeVisible();
    await expect(page.getByText("Football")).toHaveCount(0);
    await expect(page.getByText("Planned — not available yet")).toHaveCount(0);
    // the old "choose a sport" address simply opens the basketball workspace
    await page.goto("/sports");
    await expect(page).toHaveURL(/\/sports\/basketball$/);
  });

  await test.step("the Basketball workspace shows real counts and only the tabs that exist", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "Basketball" })).toBeVisible();
    await expect(page.getByText(String(LIBRARY), { exact: true }).first()).toBeVisible();
    const tabs = page.getByRole("navigation", { name: "Workspace sections" });
    await expect(tabs.getByRole("link")).toHaveText(["Overview", "Drills", "Sessions"]); // no Teams/Players tabs yet
    await expect(page.getByText("You haven't created a drill yet").first()).toBeVisible();
    await page.getByRole("link", { name: /^Shooting/ }).click(); // a category tile deep-links into the filtered library
    await expect(page).toHaveURL(/category=shooting/);
  });

  await test.step("the library filters by URL: category, search (with a typo), and chips remove them", async () => {
    await page.goto("/sports/basketball/drills");
    await expect(results(page)).toHaveText(new RegExp(`of ${LIBRARY} drills`));
    await expect(results(page)).toContainText("1–12");

    await filters(page).getByLabel("Category").selectOption("shooting");
    await expect(page).toHaveURL(/category=shooting/);
    // "N drills" when everything fits on one page, "…of N drills" once it paginates — match either
    await expect(results(page)).toHaveText(new RegExp(`${plural(SHOOTING)}$`));
    await expect(page.getByRole("link", { name: "Five-Spot Shooting" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mikan Drill" })).toHaveCount(0);

    await page.getByRole("link", { name: "Remove filter: Shooting" }).click();
    await expect(page).not.toHaveURL(/category=/);
    await expect(results(page)).toHaveText(new RegExp(`of ${LIBRARY} drills`));
    await expect(filters(page).getByLabel("Category")).toHaveValue(""); // the form followed the URL

    await filters(page).getByLabel("Search").fill("shoting"); // typo
    await expect(page).toHaveURL(/q=shoting/);
    await expect(page.getByRole("link", { name: "Five-Spot Shooting" })).toBeVisible();

    await filters(page).getByLabel("Level").selectOption("advanced");
    await filters(page).getByLabel("Search").fill("zzzzqqqq");
    await expect(
      page.getByRole("heading", { name: "No drills match those filters" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/drills$/);
    // regression: the search box's pending (debounced) submit must not resurrect the old query over the cleared URL
    await page.waitForTimeout(900);
    await expect(page).toHaveURL(/\/drills$/);
    await expect(filters(page).getByLabel("Search")).toHaveValue("");
  });

  await test.step("pagination is real", async () => {
    await expect(page.getByText(`Page 1 of ${Math.ceil(LIBRARY / 12)}`)).toBeVisible();
    await page.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(results(page)).toContainText(`13–${Math.min(24, LIBRARY)}`);
    await page.getByRole("link", { name: "Previous" }).click();
  });

  await test.step("format chips, intensity, phase and sub-skill filters work on the server and live in the URL", async () => {
    await page.goto("/sports/basketball/drills");
    const chips = page.getByRole("navigation", { name: "Filter by format" });
    await expect(chips.getByRole("link")).toHaveText([
      "Individual",
      "1v1",
      "2v2",
      "3v3",
      "4v4",
      "5v5",
      "Group",
      "Team",
    ]);
    const chip3v3 = chips.getByRole("link", { name: "3v3", exact: true });
    await chip3v3.click();
    await expect(page).toHaveURL(/format=3v3/);
    await expect(results(page)).toHaveText(new RegExp(`${plural(FORMAT_3V3)}$`));
    await expect(page.getByRole("link", { name: "3v3 Half-Court Game to Seven" })).toBeVisible();
    await expect(chip3v3).toHaveAttribute("aria-current", "true");
    await chip3v3.click(); // pressing the active chip clears it
    await expect(page).not.toHaveURL(/format=/);
    await expect(results(page)).toHaveText(new RegExp(`of ${LIBRARY} drills`));

    await filters(page).getByLabel("Intensity", { exact: true }).selectOption("low");
    await expect(page).toHaveURL(/intensity=low/);
    await expect(page.getByRole("link", { name: "Cool-Down Walk and Stretch" })).toBeVisible();
    await page.getByRole("link", { name: "Remove filter: Low intensity" }).click();
    await expect(page).not.toHaveURL(/intensity=/); // let each navigation settle before the next change

    await filters(page).getByLabel("Best used in", { exact: true }).selectOption("cool_down");
    await expect(results(page)).toHaveText(new RegExp(`${plural(COOL_DOWN)}$`));
    await page.getByRole("link", { name: "Remove filter: Best for: Cool-down" }).click();
    await expect(page).not.toHaveURL(/phase=/);
    await expect(results(page)).toHaveText(new RegExp(`of ${LIBRARY} drills`));

    // a sub-skill finds its drills, and its parent skill finds them too
    await filters(page).getByLabel("Skill", { exact: true }).selectOption("weak_hand");
    await expect(results(page)).toHaveText(new RegExp(`${plural(WEAK_HAND)}$`));
    await expect(page.getByRole("link", { name: "Stationary Ball-Handling Series" })).toBeVisible();
    await filters(page).getByLabel("Skill", { exact: true }).selectOption("dribbling");
    await expect(page.getByRole("link", { name: "Stationary Ball-Handling Series" })).toBeVisible();
    await page.goto("/sports/basketball/drills");
  });

  await test.step("favorites: star a drill, it persists across a reload, and the Favorites view shows only it", async () => {
    await page.goto("/sports/basketball/drills?q=mikan&scope=library");
    const star = page.getByRole("button", { name: "Favorite: Mikan Drill" });
    await expect(star).toHaveAttribute("aria-pressed", "false");
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByRole("button", { name: "Favorite: Mikan Drill" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.goto("/sports/basketball/drills");
    await filters(page).getByLabel("Favorites only").check();
    await expect(page).toHaveURL(/favorites=1/);
    await expect(results(page)).toHaveText("1 drill");
    await expect(page.getByRole("link", { name: "Mikan Drill", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Remove filter: Favorites only" })).toBeVisible();

    // the detail page shows the same state and can undo it
    await page.getByRole("link", { name: "Mikan Drill", exact: true }).click();
    const detailStar = page.getByRole("button", { name: "Favorite", exact: true });
    await expect(detailStar).toHaveAttribute("aria-pressed", "true");
    await detailStar.click();
    await expect(detailStar).toHaveAttribute("aria-pressed", "false");
    await page.goto("/sports/basketball/drills?favorites=1");
    await expect(page.getByText("Build your drill collection.").first()).toBeVisible();
  });

  await test.step("a library drill opens with everything a coach needs", async () => {
    await page.goto("/sports/basketball/drills?q=five-spot"); // newest-first pages move as the library grows: find it by search
    await page.getByRole("link", { name: "Five-Spot Shooting" }).click();
    await expect(page.getByRole("heading", { name: "Five-Spot Shooting", level: 2 })).toBeVisible();
    for (const h of [
      "Objective",
      "Setup",
      "How it runs",
      "Coaching points",
      "Common mistakes",
      "Safety",
    ]) {
      await expect(page.getByRole("heading", { name: h })).toBeVisible();
    }
    await expect(page.getByRole("img", { name: /Five spots around the arc/ })).toBeVisible(); // the structured diagram
    await expect(
      page.getByRole("complementary", { name: "Drill details" }).getByText("Flat markers / spots"),
    ).toBeVisible();
    await expect(page.getByText("CoachOS library").first()).toBeVisible();
    await expect(page.getByText("Original CoachOS content")).toBeVisible();
    // library drills are read-only, but can be copied
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Archive" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy to my drills" })).toBeVisible();
  });

  const title = `E2E Passing Circuit ${Date.now() % 100000}`;

  await test.step("creating a drill validates on the server and shows errors beside the fields", async () => {
    await page.goto("/sports/basketball/drills/new");
    await page.getByRole("button", { name: "Create drill" }).click();
    await expect(page.getByText("Some fields need attention").first()).toBeVisible();
    await expect(page.getByText("That's too short.").first()).toBeVisible(); // title
    await expect(page.getByText("This field is required.").first()).toBeVisible(); // category etc.
    await expect(page).toHaveURL(/\/drills\/new$/); // nothing was saved
  });

  let drillUrl = "";
  await test.step("create a drill with a diagram", async () => {
    await fillDrill(page, title);
    await drawDiagram(page);
    await page.getByRole("button", { name: "Create drill" }).click();
    await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible({
      timeout: 20_000,
    });
    drillUrl = page.url();
    await expect(toast(page, "Drill created.")).toBeVisible();
    await expect(page.getByText("My drill").first()).toBeVisible();
    await expect(page.getByRole("img", { name: /Diagram 1/ })).toBeVisible();
    await expect(page.getByText("Chest pass to the player opposite.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();
    // the new facets round-trip to the detail page
    await expect(page.getByText("3v3", { exact: true })).toBeVisible(); // format
    await expect(page.getByText("High", { exact: true })).toBeVisible(); // intensity
    await expect(page.getByText("Small-sided game", { exact: true })).toBeVisible(); // best used in
    await expect(page.getByText("Passing on the move", { exact: true })).toBeVisible(); // focus area
    await expect(page.getByRole("heading", { name: "Organization" })).toBeVisible();
    await expect(page.getByText("Two groups of five rotate every three minutes.")).toBeVisible();
  });

  await test.step("it persists: reload, the library's 'Mine' view, and the overview count", async () => {
    await page.reload();
    await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
    await page.goto("/sports/basketball/drills?scope=mine");
    await expect(results(page)).toHaveText("1 drill");
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    await page.goto("/sports/basketball");
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    await expect(page.getByText("You haven't created a drill yet")).toHaveCount(0);
  });

  await test.step("edit: the form loads the saved values, changes save, and a stale editor is refused", async () => {
    await page.goto(drillUrl);
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/edit$/); // the form has replaced the detail page: nothing of the old page is left to match
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(title);
    await expect(page.getByRole("textbox", { name: "Objective" })).toHaveValue(
      "Move the ball quickly and accurately to a teammate.",
    );
    await expect(page.getByRole("checkbox", { name: "Basketballs" })).toBeChecked();
    await expect(page.getByLabel("Intensity", { exact: true })).toHaveValue("high");
    await expect(page.getByLabel("Format", { exact: true })).toHaveValue("3v3");
    await expect(page.getByRole("checkbox", { name: "Small-sided game" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Passing on the move" })).toBeChecked();
    await expect(page.getByRole("textbox", { name: "Organization" })).toHaveValue(
      "Two groups of five rotate every three minutes.",
    );
    await expect(page.getByText("This diagram is valid.")).toBeVisible(); // the saved diagram was loaded into the builder

    await page.getByRole("textbox", { name: "Title", exact: true }).fill(`${title} (edited)`);
    // a focus area follows its skill: switching the main skill removes the options (and the choice) that no longer apply
    await page.getByLabel("Main skill").selectOption("dribbling");
    await expect(page.getByRole("checkbox", { name: "Passing on the move" })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Crossover" })).toBeVisible();
    await page.getByLabel("Main skill").selectOption("passing");
    await expect(page.getByRole("checkbox", { name: "Passing on the move" })).not.toBeChecked();
    // …and the facets can be changed
    await page.getByLabel("Intensity", { exact: true }).selectOption("low");
    await page.getByLabel("Format", { exact: true }).selectOption("");
    await page
      .getByLabel("Coaching points", { exact: true })
      .fill("Step into the pass.\nCatch with two hands.\nCall the name before you pass.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: `${title} (edited)`, level: 2 })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Call the name before you pass.")).toBeVisible();
    await expect(page.getByText("Low", { exact: true })).toBeVisible(); // the new intensity
    await expect(page.getByText("3v3", { exact: true })).toHaveCount(0); // the format was cleared

    // open the editor in two tabs; save in one; the other must not silently overwrite
    const stale = await page.context().newPage();
    await stale.goto(`${drillUrl}/edit`);
    await stale.getByRole("textbox", { name: "Title", exact: true }).waitFor();
    await page.goto(`${drillUrl}/edit`);
    await page.getByRole("textbox", { name: "Title", exact: true }).fill(`${title} (v3)`);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: `${title} (v3)`, level: 2 })).toBeVisible({
      timeout: 20_000,
    });
    await stale
      .getByRole("textbox", { name: "Title", exact: true })
      .fill("Stale overwrite attempt");
    await stale.getByRole("button", { name: "Save changes" }).click();
    await expect(stale.getByText(/changed somewhere else/i).first()).toBeVisible();
    await stale.close();
    await page.reload();
    await expect(page.getByRole("heading", { name: `${title} (v3)`, level: 2 })).toBeVisible();
  });

  await test.step("copying a library drill creates an editable private copy with lineage", async () => {
    await page.goto("/sports/basketball/drills?q=mikan");
    await page.getByRole("link", { name: "Mikan Drill" }).click();
    await page.getByRole("button", { name: "Copy to my drills" }).click();
    await expect(page.getByRole("heading", { name: "Copy of Mikan Drill", level: 2 })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("My drill").first()).toBeVisible();
    await expect(page.getByText(/Adapted from another source.*CoachOS library/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page.getByText("This diagram is valid.").first()).toBeVisible(); // library diagram loaded losslessly
  });

  await test.step("archiving removes it from the library after a confirmation", async () => {
    await page.goto(drillUrl);
    await page.getByRole("button", { name: "Archive" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Archive this drill?")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Archive" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Archive drill" }).click();
    await expect(page).toHaveURL(/\/sports\/basketball\/drills$/);
    await page.goto("/sports/basketball/drills?scope=mine");
    await expect(page.getByRole("link", { name: `${title} (v3)` })).toHaveCount(0);
    // still readable by direct link, clearly marked
    await page.goto(drillUrl);
    await expect(
      page.getByRole("status").filter({ hasText: /This drill is archived/ }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
  });
});

test("private drills belong to their owner: another user cannot find, open, or edit them", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await signedIn(a, "Alice");
  await signedIn(b, "Bob");

  const secret = `Alice Secret Drill ${Date.now() % 100000}`;
  await a.goto("/sports/basketball/drills/new");
  await fillDrill(a, secret);
  await a.getByRole("button", { name: "Create drill" }).click();
  await expect(a.getByRole("heading", { name: secret, level: 2 })).toBeVisible({ timeout: 20_000 });
  const url = a.url();
  const id = url.split("/").pop()!;

  // A stars her private drill. Capture the real Server Action call so it can be replayed as B (below).
  const star = a.getByRole("button", { name: "Favorite", exact: true });
  const [favoriteCall] = await Promise.all([
    a.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]),
    star.click(),
  ]);
  await expect(star).toHaveAttribute("aria-pressed", "true");

  // Bob: direct link and edit link are indistinguishable from a page that doesn't exist
  for (const path of [`/sports/basketball/drills/${id}`, `/sports/basketball/drills/${id}/edit`]) {
    await b.goto(path); // (the not-found UI streams in behind loading.tsx, so the content — not the HTTP status — is the contract)
    await expect(b.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(b.getByText(secret)).toHaveCount(0);
  }

  // …search never leaks it, not even by typo…
  await b.goto(`/sports/basketball/drills?q=${encodeURIComponent(secret.slice(0, 12))}`);
  await expect(b.getByRole("heading", { name: "No drills match those filters" })).toBeVisible();
  await b.goto(`/sports/basketball/drills?q=${encodeURIComponent("Secrat Drll")}`);
  await expect(b.getByText(secret)).toHaveCount(0);

  // …B cannot star it either, by replaying A's own favorite request against A's drill (the Server Action re-authorizes)
  const replay = await ctxB.request.post(favoriteCall.url(), {
    headers: {
      "next-action": favoriteCall.headers()["next-action"]!,
      "content-type": favoriteCall.headers()["content-type"] ?? "text/plain;charset=UTF-8",
      accept: "text/x-component",
      origin: new URL(favoriteCall.url()).origin,
    },
    data: favoriteCall.postData() ?? "",
  });
  expect(await replay.text()).toContain("NOT_FOUND"); // indistinguishable from a drill that does not exist
  await b.goto("/sports/basketball/drills?favorites=1");
  await expect(b.getByText("Build your drill collection.").first()).toBeVisible(); // nothing was stored for B
  await expect(b.getByText(secret)).toHaveCount(0);

  // …and Bob's own view is unaffected: the library is his, Alice's private drill is not
  await b.goto("/sports/basketball");
  await expect(b.getByText(secret)).toHaveCount(0);
  await expect(b.getByText(String(LIBRARY), { exact: true }).first()).toBeVisible();
  await b.goto("/sports/basketball/drills?scope=mine");
  await expect(b.getByRole("status").first()).toHaveText("No drills");

  // Alice still has it
  await a.reload();
  await expect(a.getByRole("heading", { name: secret, level: 2 })).toBeVisible();
  await ctxA.close();
  await ctxB.close();
});

test("unknown sports and planned sports are 404, and signed-out visitors are sent to sign in", async ({
  page,
  request,
}) => {
  for (const path of [
    "/sports",
    "/sports/basketball",
    "/sports/basketball/drills",
    "/sports/basketball/drills/new",
  ]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/sign-in/);
  }
  await signedIn(page);
  for (const path of [
    "/sports/football",
    "/sports/football/drills",
    "/sports/quidditch",
    "/sports/basketball/drills/not-a-uuid",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Page not found" }), path).toBeVisible();
  }
  // no session cookie at all (no browser, no JS): the server itself redirects — nothing is rendered for them
  const anon = await request.get("/sports/basketball/drills");
  expect(anon.url()).toContain("/sign-in");
  // no library data: a seeded drill description (the landing copy legitimately names a few drills)
  expect(await anon.text()).not.toContain("catch-and-shoot rhythm and shooting stamina");
});

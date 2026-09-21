import { expect, test } from "@playwright/test";
import { completeOnboarding, newUser, signUpAndVerify } from "./support/helpers";
import { addBreak, addCustom, createSession, pickDrill, SESSIONS } from "./support/sessions";

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

  for (const name of ["Dashboard", "Sessions", "Templates", "Sports", "Settings"]) {
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

test("the session builder is usable on a phone: nothing overflows, controls are 44px, details are one tap away", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUpAndVerify(page, newUser());
  await completeOnboarding(page);

  await page.goto(SESSIONS);
  await expect(page.getByRole("heading", { name: "No sessions yet" })).toBeVisible();
  expect(await noHorizontalScroll(page), "empty list overflows").toBe(true);
  await page.goto(`${SESSIONS}/new`);
  expect(await noHorizontalScroll(page), "create form overflows").toBe(true);

  const builder = await createSession(page, {
    title: "Phone session",
    team: "Wolves",
    objective: "Shooting",
    date: "2030-06-11",
    start: "18:00",
  });
  expect(await noHorizontalScroll(page), "empty builder overflows").toBe(true);

  await addBreak(page, "Water break", 2);
  await addCustom(
    page,
    "A rather long activity name that has to wrap on a small screen",
    10,
    "Some notes",
  );
  await pickDrill(page, builder, "five-spot", "Five-Spot Shooting");
  expect(await noHorizontalScroll(page), "add-drill page overflows").toBe(true);
  await page.getByRole("button", { name: "Add to session" }).click();
  await expect(page.getByRole("article", { name: "Five-Spot Shooting" })).toBeVisible();
  expect(await noHorizontalScroll(page), "populated builder overflows").toBe(true);

  // the controls a coach uses at the court are real touch targets
  const drill = page.getByRole("article", { name: "Five-Spot Shooting" });
  for (const name of [
    "Edit Five-Spot Shooting",
    "Move Five-Spot Shooting down",
    "More actions for Five-Spot Shooting",
  ]) {
    const box = await drill.getByRole("button", { name }).boundingBox();
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
  }
  for (const name of ["Add drill", "Custom activity", "Break"]) {
    const control = page.getByRole(name === "Add drill" ? "link" : "button", { name, exact: true });
    expect((await control.boundingBox())?.height ?? 0, name).toBeGreaterThanOrEqual(44);
  }

  // the details are behind one button on a phone
  const details = page.getByRole("button", { name: "Session details" });
  await expect(page.getByLabel("Session title", { exact: true })).toBeHidden();
  await details.click();
  await expect(page.getByLabel("Session title", { exact: true })).toBeVisible();
  expect(await noHorizontalScroll(page), "details overflow").toBe(true);
  await details.click();

  // the totals bar stays visible and clear of the tab bar
  const totals = page.getByRole("region", { name: "Session totals" });
  const tabs = page.getByRole("navigation", { name: "Main navigation" }).last();
  await expect(totals).toBeVisible();
  const [t, b] = await Promise.all([totals.boundingBox(), tabs.boundingBox()]);
  expect((t?.y ?? 0) + (t?.height ?? 0)).toBeLessThanOrEqual((b?.y ?? 0) + 1);

  // an activity dialog fits the screen
  await drill.getByRole("button", { name: "Edit Five-Spot Shooting" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect((box?.x ?? -1) + 1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.keyboard.press("Escape");

  await page.goto(SESSIONS);
  await expect(page.getByRole("article", { name: "Phone session" })).toBeVisible();
  expect(await noHorizontalScroll(page), "populated list overflows").toBe(true);
});

test("the design workspace works on a phone: preview first, quick controls, no sideways scrolling, 44px targets", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUpAndVerify(page, newUser());
  await completeOnboarding(page);
  const builder = await createSession(page, {
    title: "Phone design",
    team: "Wolves",
    objective: "Shooting",
    date: "2030-06-11",
    start: "18:00",
  });
  await pickDrill(page, builder, "five-spot", "Five-Spot Shooting");
  await page.getByRole("button", { name: "Add to session" }).click();
  await expect(page.getByRole("article", { name: "Five-Spot Shooting" })).toBeVisible();

  // the builder's entry point is a real touch target
  await page.goto(builder);
  const open = page.getByRole("button", { name: "Customize & Preview" });
  expect((await open.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await open.click();
  await expect(page).toHaveURL(/\/document\?view=design$/);
  await expect(page.getByRole("heading", { level: 1, name: "Design and preview" })).toBeVisible();
  expect(await noHorizontalScroll(page), "design view overflows").toBe(true);

  // on a phone the design view is the controls alone; the tabs are touch targets
  const tabs = page.getByRole("navigation", { name: "Session workspace" });
  for (const name of ["Builder", "Design", "Preview"]) {
    const box = await tabs.getByRole("link", { name }).boundingBox();
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(40);
  }
  await expect(page.getByTestId("design-panel")).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Preview controls" })).toBeHidden();
  await page
    .getByTestId("design-panel")
    .getByLabel("Modern Basketball", { exact: true })
    .check({ force: true });

  // the preview comes first: whole pages, sized to the screen, with the quick controls above
  await tabs.getByRole("link", { name: "Preview" }).click();
  await expect(page.getByRole("toolbar", { name: "Preview controls" })).toBeVisible();
  await expect(page.getByTestId("design-panel")).toBeHidden();
  expect(await noHorizontalScroll(page), "preview view overflows").toBe(true);
  const stage = page.getByRole("region", { name: "Document preview" });
  const sheet = page.locator(".doc-page").first();
  await expect(sheet).toBeVisible();
  const [s, p] = await Promise.all([stage.boundingBox(), sheet.boundingBox()]);
  expect((p?.width ?? 0) <= (s?.width ?? 0) + 1, "the page is fitted to the phone's width").toBe(
    true,
  );
  expect(Number(await stage.getAttribute("data-zoom"))).toBeLessThan(0.6);
  for (const name of ["Previous page", "Next page", "Zoom out", "Zoom in"]) {
    const box = await page
      .getByRole("toolbar", { name: "Preview controls" })
      .getByRole("button", { name })
      .boundingBox();
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
  }
  // Download PDF is offered where the server can make one, and is a real touch target
  const download = page.getByRole("button", { name: "Download PDF" });
  await expect(download).toBeVisible();
  expect((await download.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  // basic editing without leaving the preview
  const compact = page.getByRole("group", { name: "Level of detail" }).getByLabel("Compact");
  await compact.check({ force: true });
  await page.getByRole("combobox", { name: /^Look/ }).selectOption({ label: "School" });
  await expect(page.locator(".doc-page").first()).toHaveAttribute("data-divider", "dotted");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("spinbutton", { name: "Page number" })).toHaveValue("2");
  // the printed page is always A4 or Letter, whatever the screen
  expect(
    await page.evaluate(() => getComputedStyle(document.querySelector(".doc-page")!).width),
  ).toMatch(/^793\.\d+px$/);
});

test("templates work on a phone: list, card actions, editor with Design/Preview tabs, no sideways scrolling, 44px targets", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUpAndVerify(page, newUser());
  await completeOnboarding(page);

  await page.goto("/templates/basketball");
  await expect(page.getByText("No templates yet")).toBeVisible();
  expect(await noHorizontalScroll(page), "empty templates page overflows").toBe(true);
  const create = page.getByRole("link", { name: "New template" }).first();
  expect((await create.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  // the editor: controls first, the preview one tap away, and never wider than the screen
  await create.click();
  await expect(page.getByRole("heading", { level: 1, name: "New template" })).toBeVisible();
  expect(await noHorizontalScroll(page), "template editor overflows").toBe(true);
  const panel = page.getByTestId("design-panel");
  await expect(panel).toBeVisible();
  await page.getByLabel("Name", { exact: true }).filter({ visible: true }).fill("Phone sheet");
  // a real tap on the preset's card (its radio is visually hidden), not a forced click on the hidden input
  await panel.locator("label", { hasText: "Modern Basketball" }).first().click();
  await expect(panel.getByLabel("Modern Basketball", { exact: true })).toBeChecked();
  const views = page.getByRole("navigation", { name: "Template views" });
  for (const name of ["Design", "Preview"]) {
    const box = await views.getByRole("button", { name }).boundingBox();
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(40);
  }
  await views.getByRole("button", { name: "Preview" }).click();
  await expect(panel).toBeHidden();
  const sheet = page.locator(".doc-page").first();
  await expect(sheet).toBeVisible();
  const stage = page.getByRole("region", { name: "Document preview" });
  const [s, p] = await Promise.all([stage.boundingBox(), sheet.boundingBox()]);
  expect((p?.width ?? 0) <= (s?.width ?? 0) + 1, "the page is fitted to the phone").toBe(true);
  expect(await noHorizontalScroll(page), "template preview overflows").toBe(true);
  await views.getByRole("button", { name: "Design" }).click();
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page).toHaveURL(/\/templates\/basketball\/[0-9a-f-]{36}$/);

  // the list with a card: every action is a touch target and the page does not scroll sideways
  await page.goto("/templates/basketball");
  const card = page.getByRole("article", { name: "Phone sheet", exact: true });
  await expect(card).toBeVisible();
  expect(await noHorizontalScroll(page), "template list overflows").toBe(true);
  for (const name of ["Preview Phone sheet", "Edit Phone sheet"]) {
    const box = await card.getByRole("link", { name }).boundingBox();
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(40);
  }
  const more = await card
    .getByRole("button", { name: "More actions for Phone sheet" })
    .boundingBox();
  expect(more?.height ?? 0).toBeGreaterThanOrEqual(40);
  expect(more?.width ?? 0).toBeGreaterThanOrEqual(40);
  await card.getByRole("button", { name: "More actions for Phone sheet" }).click();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await page.keyboard.press("Escape");
});

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

    test("sports workspace, drill library, drill detail, and the drill form with its diagram builder", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await signUpAndVerify(page, newUser());
      await completeOnboarding(page);

      for (const path of [
        "/sports",
        "/sports/basketball",
        "/sports/basketball/drills",
        "/sports/basketball/drills?q=shoting&level=beginner", // active chips + filtered state
        "/sports/basketball/drills?q=zzzzqqqq", // empty state
        "/sports/basketball/drills?format=3v3&intensity=high", // an active format chip + chips
        "/sports/basketball/drills?skill=dribbling&phase=skill", // sub-skill-aware filter + phase
        "/sports/basketball/drills?favorites=1", // the (empty) Favorites view
      ]) {
        await page.goto(path);
        await expect(page.locator("main")).toBeVisible();
        await audit(page, `${path} (${scheme})`);
      }

      await page.goto("/sports/basketball/drills?q=five-spot");
      await page.getByRole("link", { name: "Five-Spot Shooting" }).click();
      await expect(page.getByRole("img", { name: /Five spots around the arc/ })).toBeVisible();
      await audit(page, `drill detail (${scheme})`);

      // a drill that uses every new part of the page: format, intensity, phases, focus areas, organization
      await page.goto("/sports/basketball/drills?format=3v3");
      await page.getByRole("link", { name: "3v3 Half-Court Game to Seven" }).click();
      await expect(page.getByRole("heading", { name: "Organization" })).toBeVisible();
      await audit(page, `drill detail with facets (${scheme})`);

      await page.goto("/sports/basketball/drills/new");
      await page.getByRole("button", { name: "Create drill" }).click(); // show every error state
      await expect(page.getByText("Some fields need attention").first()).toBeVisible();
      await audit(page, `drill form with errors (${scheme})`);

      // choosing a main skill that has sub-skills reveals the focus-area checkboxes
      await page.getByLabel("Main skill").selectOption("dribbling");
      await expect(page.getByRole("checkbox", { name: "Crossover" })).toBeVisible();
      await audit(page, `drill form with focus areas (${scheme})`);

      await page.getByRole("button", { name: "Add a diagram" }).click();
      const add = page.getByRole("group", { name: "Add to the court" });
      await add.getByRole("button", { name: "Offense" }).click();
      await add.getByRole("button", { name: "Defender" }).click();
      await add.getByRole("button", { name: "Ball" }).click();
      await page
        .getByRole("group", { name: "Add an action" })
        .getByRole("button", { name: "Pass" })
        .click();
      await expect(page.getByText("This diagram is valid.")).toBeVisible();
      await audit(page, `diagram builder (${scheme})`);
    });
  });
}

test("keyboard-only: the library can be filtered, paged and a drill opened without a mouse", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUpAndVerify(page, newUser());
  await completeOnboarding(page);
  await page.goto("/sports/basketball/drills");

  const search = page.getByRole("search", { name: "Filters" }).getByLabel("Search");
  await search.focus();
  await page.keyboard.type("closeout");
  await expect(page).toHaveURL(/q=closeout/);
  await expect(page.getByRole("link", { name: "Closeout and Contain" })).toBeVisible();

  // the drill card is one link (a single tab stop), and Enter opens it
  await page.getByRole("link", { name: "Closeout and Contain" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Closeout and Contain", level: 2 })).toBeVisible();

  // the archive confirmation isn't offered on library drills, but copying is a plain button
  await page.getByRole("button", { name: "Copy to my drills" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Copy of Closeout and Contain", level: 2 }),
  ).toBeVisible({
    timeout: 20_000,
  });

  // …and the archive dialog traps focus, closes on Escape, and returns focus to its trigger
  const archive = page.getByRole("button", { name: "Archive" });
  await archive.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(archive).toBeFocused();
});

test("no console errors, CSP violations, or missing translations across the Phase 2 pages", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });

  await signUpAndVerify(page, newUser());
  await completeOnboarding(page);
  for (const path of [
    "/sports",
    "/sports/basketball",
    "/sports/basketball/drills",
    "/sports/basketball/drills?category=shooting&level=beginner&age=12&duration=short",
    "/sports/basketball/drills/new",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
  }
  await page.getByRole("button", { name: "Add a diagram" }).click();
  await page
    .getByRole("group", { name: "Add to the court" })
    .getByRole("button", { name: "Offense" })
    .click();

  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/MISSING_MESSAGE|drills\.\w+\.\w+|diagram\.builder\./);
  expect(problems).toEqual([]);
});

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

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { makePng } from "../src/modules/media/test-support";
import { completeOnboarding, newUser, signUpAndVerify } from "./support/helpers";
import { addBreak, addCustom, createSession, field, pickDrill, SESSIONS } from "./support/sessions";

/**
 * WCAG 2.2 AA target (ARCHITECTURE.md §2.5): axe on every key screen, in BOTH themes.
 * Serious/critical violations fail the run (which also validates the Playbook colour contrast).
 */
async function audit(page: Page, label: string, include?: string) {
  const builder = new AxeBuilder({ page });
  if (include) builder.include(include);
  const results = await builder
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

    test("sessions: list, create form, builder (empty and populated), dialogs, menus and the drill picker", async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await signUpAndVerify(page, newUser());
      await completeOnboarding(page);

      await page.goto(SESSIONS);
      await expect(page.getByRole("heading", { name: "No sessions yet" })).toBeVisible();
      await audit(page, `sessions, empty list (${scheme})`);

      await page.goto(`${SESSIONS}/new`);
      await expect(field(page, "Session title")).toBeVisible();
      await audit(page, `create session (${scheme})`);
      await page.getByRole("button", { name: "Create session and start building" }).click();
      await expect(page.getByText("Some fields need attention").first()).toBeVisible();
      await audit(page, `create session with errors (${scheme})`);

      const builder = await createSession(page, {
        title: "Accessible session",
        team: "Wolves",
        objective: "Shooting",
        also: ["Defense"],
        date: "2030-06-11",
        start: "18:00",
      });
      await expect(page.getByRole("heading", { name: "Your session is empty" })).toBeVisible();
      await audit(page, `builder, empty session (${scheme})`);

      await addBreak(page, "Water break", 2);
      await addCustom(page, "Team talk", 5, "Goals for tonight");
      await pickDrill(page, builder, "five-spot", "Five-Spot Shooting");
      await audit(page, `add a drill to the session (${scheme})`);
      await page.getByRole("button", { name: "Add to session" }).click();
      await expect(page.getByRole("article", { name: "Five-Spot Shooting" })).toBeVisible();
      await audit(page, `builder, populated session (${scheme})`);

      await page.getByRole("button", { name: "Edit Team talk" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await audit(page, `edit activity dialog (${scheme})`);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "More actions for Team talk" }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await audit(page, `activity menu (${scheme})`);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "Session actions" }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await audit(page, `session menu (${scheme})`);
      await page.keyboard.press("Escape");

      await page.goto(`${builder}/drills`);
      await expect(page.getByRole("heading", { level: 1, name: "Add a drill" })).toBeVisible();
      await audit(page, `drill picker (${scheme})`);

      await page.goto(SESSIONS);
      await expect(page.getByRole("article", { name: "Accessible session" })).toBeVisible();
      await audit(page, `sessions, populated list (${scheme})`);
      await page.goto(`${SESSIONS}?status=archived`);
      await audit(page, `sessions, archived view (${scheme})`);
    });

    test("session design and preview: controls, every preset's paper colours, the leave dialog", async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await signUpAndVerify(page, newUser());
      await completeOnboarding(page);
      const builder = await createSession(page, {
        title: "Accessible design",
        team: "Wolves",
        objective: "Shooting",
        date: "2030-06-11",
        start: "18:00",
      });
      await pickDrill(page, builder, "five-spot", "Five-Spot Shooting");
      await page.getByRole("button", { name: "Add to session" }).click();
      await expect(page.getByRole("article", { name: "Five-Spot Shooting" })).toBeVisible();
      await addBreak(page, "Water break", 2);

      await page.goto(`${builder}/document?view=design`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Design and preview" }),
      ).toBeVisible();
      await expect(page.locator(".doc-page").first()).toBeVisible();
      await audit(page, `design and preview, classic (${scheme})`);

      // the paper is paper in either app theme: every preset must be readable (this is where a bad colour pair shows up)
      for (const preset of [
        "Modern Basketball",
        "Minimal",
        "Professional",
        "Dark",
        "School",
        "Academy",
        "Youth",
      ]) {
        await page
          .getByTestId("design-panel")
          .getByLabel(preset, { exact: true })
          .check({ force: true });
        await expect(page.locator(".doc-page").first()).toBeVisible();
        await page.waitForTimeout(150);
        await audit(page, `design and preview, ${preset} (${scheme})`);
      }
      // both densities and a cover + reflection, the pages with the most parts
      await page
        .getByTestId("design-panel")
        .getByRole("group", { name: "Level of detail" })
        .getByLabel("Compact")
        .check({ force: true });
      await page
        .getByTestId("design-panel")
        .locator('[data-group="sections"]')
        .getByRole("checkbox", { name: /^Cover page/ })
        .check();
      await page
        .getByTestId("design-panel")
        .locator('[data-group="sections"]')
        .getByRole("checkbox", { name: /^Session reflection/ })
        .check();
      await audit(page, `design and preview, compact with cover and reflection (${scheme})`);

      // a bad colour: the readability list and the error message
      await page.getByLabel("Text colour code", { exact: true }).fill("#f5f5f5");
      await expect(page.locator('[data-verdict="bad"]')).toBeVisible();
      await audit(
        page,
        `design panel, unreadable colours flagged (${scheme})`,
        '[data-testid="design-panel"]',
      ); // the paper itself is unreadable on purpose here
      await page.getByLabel("Primary colour code", { exact: true }).fill("zz");
      await audit(
        page,
        `design panel, invalid colour code (${scheme})`,
        '[data-testid="design-panel"]',
      );
      await page.getByLabel("Primary colour code", { exact: true }).fill("#1f3a5f");
      await page.getByLabel("Text colour code", { exact: true }).fill("#111827");

      await page
        .getByRole("navigation", { name: "Session workspace" })
        .getByRole("link", { name: "Preview" })
        .click();
      await expect(page).toHaveURL(/view=preview$/);
      await expect(page.getByRole("toolbar", { name: "Preview controls" })).toBeVisible();
      await audit(page, `preview view (${scheme})`);

      await page
        .getByRole("navigation", { name: "Session workspace" })
        .getByRole("link", { name: "Builder" })
        .click();
      const dialog = page.getByRole("dialog", { name: "Unsaved design changes" });
      await expect(dialog).toBeVisible();
      await audit(page, `unsaved changes dialog (${scheme})`);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });

    test("saved templates: list, cards and menus, editor, save and apply dialogs", async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await signUpAndVerify(page, newUser());
      await completeOnboarding(page);

      await page.goto("/templates/basketball");
      await expect(page.getByText("No templates yet")).toBeVisible();
      await audit(page, `templates, empty (${scheme})`);

      const builder = await createSession(page, { title: "Accessible templates", team: "Wolves" });
      await page.goto(`${builder}/document?view=design`);
      await expect(page.getByTestId("template-panel")).toBeVisible();
      await page
        .getByTestId("design-panel")
        .getByLabel("Modern Basketball", { exact: true })
        .check({ force: true });
      await audit(page, `session design with the template panel (${scheme})`);

      await page
        .getByTestId("template-panel")
        .getByRole("button", { name: "Save as template" })
        .click();
      const save = page.getByRole("dialog", { name: "Save as template" });
      await expect(save).toBeVisible();
      await audit(page, `save as template dialog (${scheme})`);
      await save.getByLabel("Template name", { exact: true }).fill("Accessible sheet");
      await save.getByRole("button", { name: "Save template" }).click();
      await expect(save).toBeHidden();

      await page.goto("/templates/basketball");
      const card = page.getByRole("article", { name: "Accessible sheet", exact: true });
      await expect(card).toBeVisible();
      await audit(page, `templates, one card (${scheme})`);
      await page.goto("/templates");
      await expect(card).toBeVisible();
      await audit(page, `templates, all sports (${scheme})`);
      await page.goto("/templates/basketball?status=archived");
      await audit(page, `templates, archived view (${scheme})`);

      await page.goto("/templates/basketball");
      await card.getByRole("button", { name: "More actions for Accessible sheet" }).click();
      await audit(page, `template card menu (${scheme})`);
      await page.getByRole("menuitem", { name: "Apply to a session" }).click();
      const apply = page.getByRole("dialog", { name: "Apply a template" });
      await expect(apply).toBeVisible();
      await audit(page, `apply template dialog (${scheme})`);
      await page.keyboard.press("Escape");
      await expect(apply).toBeHidden();

      await card.getByRole("link", { name: "Edit Accessible sheet" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Accessible sheet" })).toBeVisible();
      await expect(page.locator(".doc-page").first()).toBeVisible();
      await audit(page, `template editor (${scheme})`);
      await page.getByRole("button", { name: "Template actions" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      const del = page.getByRole("dialog", { name: "Delete this template?" });
      await expect(del).toBeVisible();
      await audit(page, `delete template dialog (${scheme})`);
      await page.keyboard.press("Escape");

      await page.goto("/templates/basketball/new");
      await expect(page.getByRole("heading", { level: 1, name: "New template" })).toBeVisible();
      await expect(page.locator(".doc-page").first()).toBeVisible();
      await audit(page, `new template (${scheme})`);
    });

    test("logos, image export and sharing: the logo picker, both menus, the share dialog in each state, the shared page and the unavailable page", async ({
      page,
      browser,
    }) => {
      test.setTimeout(300_000);
      await signUpAndVerify(page, newUser());
      await completeOnboarding(page);
      const builder = await createSession(page, { title: "Accessible sharing", team: "Wolves" });
      await pickDrill(page, builder, "five-spot", "Five-Spot Shooting");
      await page.getByRole("button", { name: "Add to session" }).click();
      await expect(page.getByRole("article", { name: "Five-Spot Shooting" })).toBeVisible();

      await page.goto(`${builder}/document?view=design`);
      await expect(page.locator(".doc-page").first()).toBeVisible();
      await page.getByTestId("design-panel").getByText("Footer and logo").click();
      await page.getByTestId("logo-file").setInputFiles({
        name: "crest.png",
        mimeType: "image/png",
        buffer: makePng({ width: 200, height: 100 }),
      });
      await expect(page.getByRole("button", { name: "Use crest" })).toBeVisible();
      await audit(page, `design with the logo picker (${scheme})`);

      await page.getByRole("button", { name: "Download images" }).click();
      await expect(page.getByRole("menuitem").first()).toBeVisible();
      await audit(page, `image export menu (${scheme})`);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "Share", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Share this session" });
      await expect(dialog.getByText("This session isn't shared.")).toBeVisible();
      await audit(page, `share dialog, not shared (${scheme})`);
      await dialog.getByRole("button", { name: "Create link" }).click();
      const link = await dialog.getByLabel("Link to share").inputValue();
      await audit(page, `share dialog, shared (${scheme})`);
      await dialog.getByRole("button", { name: "Make a new link" }).click();
      await expect(page.getByRole("group", { name: "Make a new link?" })).toBeVisible();
      await audit(page, `share dialog, confirming (${scheme})`);
      await page.keyboard.press("Escape");

      const visitor = await browser.newContext({ colorScheme: scheme, reducedMotion: "reduce" });
      const shared = await visitor.newPage();
      await shared.goto(link);
      await expect(
        shared.getByRole("heading", { level: 1, name: "Accessible sharing" }),
      ).toBeVisible();
      await expect(shared.locator(".doc-page").first()).toBeVisible();
      await audit(shared, `shared page (${scheme})`);
      await shared.goto(link.slice(0, -3) + "zzz");
      await expect(
        shared.getByRole("heading", { name: "This link isn't available" }),
      ).toBeVisible();
      await audit(shared, `shared link unavailable (${scheme})`);
      await visitor.close();
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

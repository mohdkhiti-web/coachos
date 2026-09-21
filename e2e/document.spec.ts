import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, newUser, signUpAndVerify, toast } from "./support/helpers";
import {
  buildSession,
  choose,
  docVar,
  expectVar,
  hex,
  measure,
  MM_TO_PT,
  pages,
  panel,
  pdfInfo,
  preview,
  saveButton,
  section,
  settled,
  status,
  toolbar,
} from "./support/document";
import { card, field, SESSIONS, timelineTitles } from "./support/sessions";

async function signedIn(page: Page) {
  const user = newUser("Designer");
  await signUpAndVerify(page, user);
  await completeOnboarding(page);
  return user;
}

const workspaceTabs = (page: Page) => page.getByRole("navigation", { name: "Session workspace" });
const openDesign = async (page: Page, builder: string, view: "design" | "preview" = "design") => {
  await page.goto(`${builder}/document?view=${view}`);
  await expect(page.getByRole("heading", { level: 1, name: "Design and preview" })).toBeVisible();
  await settled(page);
};

test("build → customize → preview: presets, colours, sections, layout, save, reload", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await signedIn(page);
  const builder = await buildSession(page, "Design journey");

  // ---- Builder → Design: one click, the session comes with it ---------------------------------------------
  await page.goto(builder);
  await expect(workspaceTabs(page).locator('[aria-current="page"]')).toHaveText("Builder");
  await page.getByRole("button", { name: "Customize & Preview" }).click();
  await expect(page).toHaveURL(new RegExp(`${builder}/document\\?view=design$`));
  await expect(page.getByRole("heading", { level: 1, name: "Design and preview" })).toBeVisible();
  await expect(workspaceTabs(page).locator('[aria-current="page"]')).toHaveText("Design");
  await settled(page);
  // the document is this session: its own activities, with the times the builder showed
  for (const title of ["Five-Spot Shooting", "Give-and-Go (Pass and Cut)", "3-on-2 Fast Break"])
    await expect(pages(page).getByRole("article", { name: title })).toBeVisible();
  await expect(pages(page).getByRole("article", { name: "Free throws to finish" })).toBeVisible();
  await expect(pages(page).first()).toContainText("Design journey");
  await expect(pages(page).first().getByText("00:00–12:00")).toBeVisible(); // the same offsets as the timeline
  await expect(status(page)).toHaveAttribute("data-state", "saved");
  await expect(saveButton(page)).toBeDisabled();

  // ---- presets: eight looks; choosing one changes the document at once, not its content ------------------------
  const presets = [
    "Classic Coach",
    "Modern Basketball",
    "Minimal",
    "Professional",
    "Dark",
    "School",
    "Academy",
    "Youth",
  ];
  for (const name of presets)
    await expect(panel(page).getByLabel(name, { exact: true })).toBeAttached();
  await expect(panel(page).getByLabel("Classic Coach", { exact: true })).toBeChecked();
  const pageCountBefore = await pages(page).count();
  await panel(page).getByLabel("Modern Basketball", { exact: true }).check({ force: true });
  await expectVar(page, "--d-primary", "#ea580c");
  await expect(page.locator(".doc-head").first()).toHaveAttribute("data-style", "band");
  await expect(status(page)).toHaveAttribute("data-state", "unsaved");
  await expect(status(page)).toHaveText("Unsaved design changes");
  await expect(saveButton(page)).toBeEnabled();
  await expect.poll(() => pages(page).count()).toBe(pageCountBefore); // a preset is a look, not a layout

  // ---- colours: HEX validation, picker, shorthand, readability ---------------------------------------------
  await hex(page, "Accent").fill("zz");
  await expect(hex(page, "Accent")).toHaveAttribute("aria-invalid", "true");
  await expect(panel(page).getByText("Enter a colour like #1f3a5f.")).toBeVisible();
  await expectVar(page, "--d-accent", "#2563eb"); // the bad value never reached the page
  await hex(page, "Accent").fill("#0a7d4b");
  await expectVar(page, "--d-accent", "#0a7d4b");
  await hex(page, "Accent").fill("#abc");
  await expectVar(page, "--d-accent", "#aabbcc"); // #RGB is expanded
  await panel(page).getByLabel("Accent colour picker").fill("#0a7d4b");
  await expect(hex(page, "Accent")).toHaveValue("#0a7d4b");
  await expect(panel(page).locator('[data-verdict="good"]').first()).toBeVisible();

  await hex(page, "Text").fill("#f5f5f5"); // pale text on the white page
  await expect(panel(page).locator('[data-verdict="bad"]')).toBeVisible();
  await expect(status(page)).toHaveAttribute("data-state", "unreadable");
  await expect(saveButton(page)).toBeDisabled(); // an unreadable page is never saved
  await hex(page, "Text").fill("#8a8a8a"); // readable but weak: a warning, not a block
  await expect(panel(page).locator('[data-verdict="low"]').first()).toBeVisible();
  await expect(saveButton(page)).toBeEnabled();
  await hex(page, "Text").fill("#111827");

  // ---- section toggles: switched off, gone from the document ---------------------------------------------
  const heading = (name: string) =>
    pages(page).getByRole("heading", { level: 2, name, exact: true });
  await expect(heading("Timeline")).toBeVisible();
  await section(page, "Timeline").uncheck();
  await expect(heading("Timeline")).toHaveCount(0);
  await section(page, "Timeline").check();
  await expect(heading("Timeline")).toBeVisible();

  const diagrams = pages(page).locator('svg[role="img"]');
  await expect.poll(() => diagrams.count()).toBeGreaterThanOrEqual(3);
  await section(page, "Diagrams").uncheck();
  await expect(diagrams).toHaveCount(0);
  await section(page, "Diagrams").check();
  await expect.poll(() => diagrams.count()).toBeGreaterThanOrEqual(3);

  for (const [label, heading2] of [
    ["Equipment", "Equipment"],
    ["Objectives", "Objectives"],
    ["Session overview", "Session overview"],
  ] as const) {
    await section(page, label).uncheck();
    await expect(heading(heading2)).toHaveCount(0);
    await section(page, label).check();
    await expect(heading(heading2)).toBeVisible();
  }

  await section(page, "Safety").uncheck();
  await expect(pages(page).getByText("Safety", { exact: true })).toHaveCount(0);
  await section(page, "Safety").check();
  await expect(pages(page).getByText("Safety", { exact: true }).first()).toBeVisible();

  await expect(pages(page).first()).toHaveAttribute("data-kind", "body");
  await section(page, "Cover page").check();
  await expect(pages(page).first()).toHaveAttribute("data-kind", "cover");
  await expect(
    pages(page).first().getByRole("heading", { level: 2, name: "Design journey" }),
  ).toBeVisible();
  await expect.poll(() => pages(page).count()).toBe(pageCountBefore + 1);
  await section(page, "Cover page").uncheck();
  await expect.poll(() => pages(page).count()).toBe(pageCountBefore);

  // ---- compact and detailed: switch instantly; compact needs fewer pages and locks the detailed-only sections
  const label = (name: string) =>
    pages(page).locator(".doc-label", { hasText: new RegExp(`^${name}$`, "i") });
  await expect(label("Instructions").first()).toBeVisible();
  await expect(label("Common mistakes").first()).toBeVisible();
  await choose(page, "Level of detail", "Compact");
  await expect(label("Instructions")).toHaveCount(0);
  await expect(label("Common mistakes")).toHaveCount(0);
  await expect(label("Coaching points").first()).toBeVisible(); // the key coaching points stay
  await expect(section(page, "Instructions")).toBeDisabled();
  await expect(panel(page).getByText("Detailed only").first()).toBeVisible();
  await expect.poll(() => pages(page).count()).toBeLessThan(pageCountBefore);
  await choose(page, "Level of detail", "Detailed");
  await expect(section(page, "Instructions")).toBeEnabled();
  await expect(label("Instructions").first()).toBeVisible();
  await expect.poll(() => pages(page).count()).toBe(pageCountBefore);

  // ---- paper, orientation, margins, columns, spacing ------------------------------------------------------
  const sheet = pages(page).first();
  const size = () =>
    sheet.evaluate((el) => {
      const cs = getComputedStyle(el);
      return [
        Math.round((parseFloat(cs.width) * 25.4) / 96),
        Math.round((parseFloat(cs.height) * 25.4) / 96),
      ];
    });
  await expect.poll(size).toEqual([210, 297]); // A4 portrait
  await choose(page, "Paper", "Letter");
  await expectVar(page, "--d-page-w", "215.9mm");
  await expect.poll(size).toEqual([216, 279]);
  await choose(page, "Orientation", "Landscape");
  await expect.poll(size).toEqual([279, 216]);
  await choose(page, "Paper", "A4");
  await expect.poll(size).toEqual([297, 210]);
  await expect(sheet).toHaveAttribute("data-paper", "a4");
  await expect(sheet).toHaveAttribute("data-orientation", "landscape");
  await choose(page, "Orientation", "Portrait");
  await expect.poll(size).toEqual([210, 297]);

  await choose(page, "Margins", "Wide");
  await expectVar(page, "--d-margin", "24mm");
  await choose(page, "Margins", "Narrow");
  await expectVar(page, "--d-margin", "12mm");
  await choose(page, "Margins", "Normal");
  await choose(page, "Spacing", "Spacious");
  await expectVar(page, "--d-lh", "1.55");
  await choose(page, "Spacing", "Normal");

  await expect.poll(() => pages(page).locator(".doc-body--cols").count()).toBe(0);
  await choose(page, "Columns", "2 columns");
  await expect.poll(() => pages(page).locator(".doc-body--cols").count()).toBeGreaterThan(0);
  await choose(page, "Columns", "1 column");
  await expect.poll(() => pages(page).locator(".doc-body--cols").count()).toBe(0);

  // ---- header, footer, border, divider, typeface ----------------------------------------------------------
  await panel(page).getByText("Type and style").click();
  await panel(page)
    .getByRole("combobox", { name: /^Header/ })
    .selectOption({ label: "None" });
  await expect(page.locator(".doc-head")).toHaveCount(0);
  await panel(page)
    .getByRole("combobox", { name: /^Header/ })
    .selectOption({ label: "Line" });
  await expect(page.locator(".doc-head").first()).toHaveAttribute("data-style", "line");
  await panel(page)
    .getByRole("combobox", { name: /^Page border/ })
    .selectOption({ label: "Framed" });
  await expect(sheet).toHaveAttribute("data-border", "frame");
  await panel(page)
    .getByRole("combobox", { name: /^Section divider/ })
    .selectOption({ label: "Dotted" });
  await expect(sheet).toHaveAttribute("data-divider", "dotted");
  await panel(page)
    .getByRole("combobox", { name: /^Typeface/ })
    .selectOption({ label: "Merriweather (serif)" });
  await expect.poll(() => docVar(page, "--d-font")).toContain("Merriweather");
  await panel(page)
    .getByRole("combobox", { name: /^Typeface/ })
    .selectOption({ label: "Inter" });
  await settled(page);
  // the typefaces are self-hosted: every font file the page fetched came from our own origin
  const fontFiles = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((e) => new URL(e.name))
      .filter((u) => /\.(woff2?|ttf|otf)$/i.test(u.pathname))
      .map((u) => u.origin),
  );
  expect(fontFiles.length).toBeGreaterThan(0);
  expect(new Set(fontFiles)).toEqual(new Set([new URL(page.url()).origin]));

  await panel(page).getByText("Footer and logo").click();
  await panel(page).getByLabel("Footer text", { exact: true }).fill("Riverside BC · Staff copy");
  await expect(pages(page).first().locator(".doc-foot")).toContainText("Riverside BC · Staff copy");
  await expect(pages(page).first().locator(".doc-foot")).toContainText("Page 1 of");
  // the logo controls are real now (uploading is exercised in logos-png-share.spec.ts)
  await expect(panel(page).getByTestId("logo-picker")).toContainText("No logo in this design.");
  await expect(panel(page).getByRole("button", { name: "Upload a logo" })).toBeVisible();

  // ---- reflection: prompts with the coach's own words -----------------------------------------------------
  await section(page, "Session reflection").check();
  await panel(page).getByText("Session reflection text").click();
  await panel(page)
    .getByLabel("What went well?", { exact: true })
    .fill("Great spacing in transition.");
  await expect(
    page.locator(".doc-reflect__box", { hasText: "Great spacing in transition." }),
  ).toBeVisible();
  await expect(page.locator(".doc-reflect__box[data-blank='true']").first()).toBeVisible(); // room to write the rest

  // ---- the preview: pages, page controls and zoom ---------------------------------------------------------
  await expect.poll(() => pages(page).count()).toBeGreaterThanOrEqual(5);
  const total = await pages(page).count();
  const pageNumber = toolbar(page).getByRole("spinbutton", { name: "Page number" });
  await expect(pageNumber).toHaveValue("1");
  await expect(toolbar(page).getByText(`of ${total}`, { exact: true })).toBeVisible();
  await expect(toolbar(page).getByRole("button", { name: "Previous page" })).toBeDisabled();
  await toolbar(page).getByRole("button", { name: "Next page" }).click();
  await expect(pageNumber).toHaveValue("2");
  await expect(page.getByText(`Page 2 of ${total}`, { exact: true }).first()).toBeAttached();
  await pageNumber.fill("4");
  await expect(pageNumber).toHaveValue("4");
  const inView = async (n: number) => {
    const stage = await preview(page).boundingBox();
    const sheetBox = await pages(page)
      .nth(n - 1)
      .boundingBox();
    return (
      !!stage && !!sheetBox && sheetBox.y >= stage.y - 4 && sheetBox.y < stage.y + stage.height / 2
    );
  };
  await expect.poll(() => inView(4)).toBe(true); // the page the coach asked for is at the top of the stage
  await toolbar(page).getByRole("button", { name: "Previous page" }).click();
  await expect(pageNumber).toHaveValue("3");
  await pageNumber.fill(String(total));
  await expect(toolbar(page).getByRole("button", { name: "Next page" })).toBeDisabled();
  await toolbar(page).getByRole("button", { name: "Previous page" }).click();
  await expect(pageNumber).toHaveValue(String(total - 1));

  const level = () => toolbar(page).getByTestId("zoom-level");
  const percent = async () => Number((await level().innerText()).replace("%", ""));
  await toolbar(page).getByRole("button", { name: "Fit width" }).click();
  await expect(toolbar(page).getByRole("button", { name: "Fit width" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const fitWidth = await percent();
  await toolbar(page).getByRole("button", { name: "Zoom in" }).click();
  const zoomedIn = await percent();
  expect(zoomedIn).toBeGreaterThan(fitWidth);
  await expect(preview(page)).toHaveAttribute("data-zoom", String(zoomedIn / 100));
  await toolbar(page).getByRole("button", { name: "Zoom out" }).click();
  await toolbar(page).getByRole("button", { name: "Zoom out" }).click();
  expect(await percent()).toBeLessThan(fitWidth);
  await toolbar(page).getByRole("button", { name: "Fit page" }).click();
  await expect(toolbar(page).getByRole("button", { name: "Fit page" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await percent()).toBeLessThanOrEqual(fitWidth); // a whole page is never larger than a page's width
  // zooming never rebuilt the document
  await expect.poll(() => pages(page).count()).toBe(total);

  // ---- save, and the design is still there after a reload ------------------------------------------------
  await expect(status(page)).toHaveAttribute("data-state", "unsaved");
  await saveButton(page).click();
  await expect(status(page)).toHaveAttribute("data-state", "saved");
  await expect(status(page)).toHaveText("Design saved");
  await expect(toast(page, "Design saved")).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Design and preview" })).toBeVisible();
  await settled(page);
  await expect(status(page)).toHaveAttribute("data-state", "saved");
  await expect(panel(page).getByLabel("Modern Basketball", { exact: true })).toBeChecked();
  await expectVar(page, "--d-accent", "#0a7d4b");
  await expectVar(page, "--d-primary", "#ea580c");
  await expect(page.locator(".doc-head").first()).toHaveAttribute("data-style", "line"); // the header style we set
  await expect(pages(page).first()).toHaveAttribute("data-border", "frame");
  await expect(pages(page).first()).toHaveAttribute("data-divider", "dotted");
  await expect(section(page, "Session reflection")).toBeChecked();
  await expect(pages(page).first().locator(".doc-foot")).toContainText("Riverside BC · Staff copy");
  await expect(
    page.locator(".doc-reflect__box", { hasText: "Great spacing in transition." }),
  ).toBeVisible();
  await expect.poll(() => pages(page).count()).toBe(total);

  // ---- Design ⇄ Preview ⇄ Builder without losing the session ---------------------------------------------
  await workspaceTabs(page).getByRole("link", { name: "Preview" }).click();
  await expect(page).toHaveURL(/view=preview$/);
  await expect(panel(page)).toBeHidden(); // the preview has the room to itself
  await expect(toolbar(page)).toBeVisible();
  await expect.poll(() => pages(page).count()).toBe(total);
  await workspaceTabs(page).getByRole("link", { name: "Builder" }).click(); // nothing unsaved: no question asked
  await expect(page).toHaveURL(new RegExp(`${builder}$`));
  await expect(timelineTitles(page)).toHaveText([
    "Five-Spot Shooting",
    "Water break",
    "Give-and-Go (Pass and Cut)",
    "3-on-2 Fast Break",
    "Free throws to finish",
  ]);
  await expect(card(page, "Five-Spot Shooting")).toBeVisible();
});

test("the builder's last edit is never left behind when the coach opens the design", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signedIn(page);
  const builder = await buildSession(page, "Before the edit", [
    ["five-spot", "Five-Spot Shooting"],
  ]);
  await page.goto(builder);
  await field(page, "Session title").fill("After the edit");
  // straight away — well inside the autosave delay
  await page.getByRole("button", { name: "Customize & Preview" }).click();
  await expect(page).toHaveURL(/\/document\?view=design$/);
  await settled(page);
  await expect(pages(page).first()).toContainText("After the edit");
  await expect(page.getByText("After the edit").first()).toBeVisible();
});

test("unsaved design changes are never lost by accident", async ({ page }) => {
  test.setTimeout(240_000);
  await signedIn(page);
  const builder = await buildSession(page, "Guarded", [["five-spot", "Five-Spot Shooting"]]);
  await openDesign(page, builder);

  const willUnload = () =>
    page.evaluate(() => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
  expect(await willUnload()).toBe(false); // nothing to lose

  await panel(page).getByLabel("Academy", { exact: true }).check({ force: true });
  await expect(status(page)).toHaveAttribute("data-state", "unsaved");
  expect(await willUnload()).toBe(true); // closing the tab or reloading asks first

  // a link in the app: asked first, and "keep editing" changes nothing
  const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
  await nav.getByRole("link", { name: "Dashboard" }).click();
  const dialog = page.getByRole("dialog", { name: "Unsaved design changes" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/document/);
  await expect(panel(page).getByLabel("Academy", { exact: true })).toBeChecked();

  // the Builder tab: leave without saving → the change is gone next time
  await workspaceTabs(page).getByRole("link", { name: "Builder" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Leave without saving" }).click();
  await expect(page).toHaveURL(new RegExp(`${builder}$`));
  await openDesign(page, builder);
  await expect(panel(page).getByLabel("Classic Coach", { exact: true })).toBeChecked();

  // …and "save and leave" keeps it
  await panel(page).getByLabel("Academy", { exact: true }).check({ force: true });
  await workspaceTabs(page).getByRole("link", { name: "Builder" }).click();
  await dialog.getByRole("button", { name: "Save and leave" }).click();
  await expect(page).toHaveURL(new RegExp(`${builder}$`));
  await openDesign(page, builder);
  await expect(panel(page).getByLabel("Academy", { exact: true })).toBeChecked();
  await expect(status(page)).toHaveAttribute("data-state", "saved");
  expect(await willUnload()).toBe(false);
});

test("print: the document alone, in colour, on the paper the design chose, page for page as previewed", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await signedIn(page);
  const builder = await buildSession(page, "Print run");
  await openDesign(page, builder);
  const previewPages = await pages(page).count();
  const previewFigures = await pages(page).locator('svg[role="img"]').count();
  expect(previewFigures).toBeGreaterThanOrEqual(3);

  // ---- the print stylesheet -------------------------------------------------------------------------------
  await panel(page).getByLabel("Dark", { exact: true }).check({ force: true });
  await page.emulateMedia({ media: "print" });
  // the app around the document is gone…
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeHidden();
  await expect(toolbar(page)).toBeHidden();
  await expect(panel(page)).toBeHidden();
  await expect(saveButton(page)).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Design and preview" })).toBeHidden();
  // …and what is left is the document, unscaled, unscrolled and unframed
  await expect(pages(page).first()).toBeVisible();
  await expect.poll(() => pages(page).count()).toBe(previewPages);
  const css = await page.evaluate(() => {
    const sheets = [...document.querySelectorAll<HTMLElement>(".doc-page")];
    const stage = document.querySelector<HTMLElement>(".doc-stage")!;
    const zoom = document.querySelector<HTMLElement>(".doc-zoom")!;
    return {
      colorAdjust: sheets.map((s) => getComputedStyle(s).printColorAdjust),
      background: getComputedStyle(sheets[0]!).backgroundColor,
      breaks: sheets.map((s) => getComputedStyle(s).breakAfter),
      shadow: getComputedStyle(sheets[0]!).boxShadow,
      stageOverflow: getComputedStyle(stage).overflow,
      stagePosition: getComputedStyle(stage).position,
      zoom: getComputedStyle(zoom).zoom,
      bodyPage: getComputedStyle(document.body).getPropertyValue("page"),
    };
  });
  expect(css.colorAdjust.every((v) => v === "exact")).toBe(true); // colours are kept, not "saved ink"
  expect(css.background).toBe("rgb(15, 23, 42)"); // the Dark preset's page
  expect(css.breaks.slice(0, -1).every((v) => v === "page")).toBe(true); // one sheet per page…
  expect(css.breaks.at(-1)).toBe("auto"); // …and no blank sheet after the last
  expect(css.shadow).toBe("none");
  expect(css.stageOverflow).toBe("visible");
  expect(css.stagePosition).toBe("static");
  expect(css.zoom).toBe("1");
  expect(css.bodyPage).toBe("doc-a4-portrait");
  // diagrams are the same live vector drawings, not pictures
  expect(await pages(page).locator('svg[role="img"]').count()).toBe(previewFigures);
  expect(await pages(page).locator("img, canvas").count()).toBe(0);
  await page.emulateMedia({ media: null }); // back to the default: page.pdf() prints with the print stylesheet by itself

  // ---- the printed file: the real print pipeline, with the paper the design asked for ---------------------
  const printIt = () => page.pdf({ preferCSSPageSize: true, printBackground: true });
  let pdf = pdfInfo(await printIt());
  expect(pdf.pages).toBe(previewPages);
  expect(pdf.width).toBeCloseTo(210 * MM_TO_PT, 0);
  expect(pdf.height).toBeCloseTo(297 * MM_TO_PT, 0);

  await choose(page, "Paper", "Letter");
  await choose(page, "Orientation", "Landscape");
  await settled(page);
  const landscapeLetter = await pages(page).count();
  pdf = pdfInfo(await printIt());
  expect(pdf.pages).toBe(landscapeLetter);
  expect(pdf.width).toBeCloseTo(11 * 72, 0);
  expect(pdf.height).toBeCloseTo(8.5 * 72, 0);

  await choose(page, "Paper", "A4");
  await choose(page, "Orientation", "Portrait");
  await section(page, "Cover page").check();
  await choose(page, "Level of detail", "Compact");
  await settled(page);
  const compactWithCover = await pages(page).count();
  pdf = pdfInfo(await printIt());
  expect(pdf.pages).toBe(compactWithCover); // section and mode choices reach the printed file too
  expect(pdf.width).toBeCloseTo(210 * MM_TO_PT, 0);

  // switching a section off removes it from print as well as from the preview
  await section(page, "Timeline").uncheck();
  await section(page, "Cover page").uncheck();
  await settled(page);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { level: 2, name: "Timeline", exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { level: 2, name: "Session overview", exact: true }),
  ).toBeVisible();
});

test("every page setup and typeface prints what was measured: nothing clipped, overlapping or blank", async ({
  page,
}) => {
  test.setTimeout(420_000);
  await signedIn(page);
  const builder = await buildSession(page, "Layout matrix", [
    ["five-spot", "Five-Spot Shooting"],
    ["give-and-go", "Give-and-Go (Pass and Cut)"],
    ["3-on-2", "3-on-2 Fast Break"],
    ["shell defense", "Shell Defense 4-on-4"],
    ["press break", "Five-Out Press Release"],
    ["late game", "Late-Game Scenario Game"],
  ]);
  await openDesign(page, builder);
  await section(page, "Cover page").check();
  await section(page, "Session reflection").check();
  await panel(page).getByText("Type and style").click();

  const layouts = [
    {
      name: "A4 portrait, one column",
      paper: "A4",
      orientation: "Portrait",
      margins: "Normal",
      columns: "1 column",
      spacing: "Normal",
      mode: "Detailed",
    },
    {
      name: "Letter landscape, narrow margins",
      paper: "Letter",
      orientation: "Landscape",
      margins: "Narrow",
      columns: "1 column",
      spacing: "Compact",
      mode: "Detailed",
    },
    {
      name: "A4 portrait, two columns, wide and spacious",
      paper: "A4",
      orientation: "Portrait",
      margins: "Wide",
      columns: "2 columns",
      spacing: "Spacious",
      mode: "Detailed",
    },
    {
      name: "Letter portrait, two columns, compact",
      paper: "Letter",
      orientation: "Portrait",
      margins: "Narrow",
      columns: "2 columns",
      spacing: "Compact",
      mode: "Compact",
    },
    {
      name: "A4 landscape, two columns",
      paper: "A4",
      orientation: "Landscape",
      margins: "Normal",
      columns: "2 columns",
      spacing: "Normal",
      mode: "Detailed",
    },
  ] as const;

  for (const font of ["Inter", "Source Sans", "Merriweather (serif)", "System default"]) {
    await panel(page)
      .getByRole("combobox", { name: /^Typeface/ })
      .selectOption({ label: font });
    for (const l of layouts) {
      await choose(page, "Paper", l.paper);
      await choose(page, "Orientation", l.orientation);
      await choose(page, "Margins", l.margins);
      await choose(page, "Columns", l.columns);
      await choose(page, "Spacing", l.spacing);
      await choose(page, "Level of detail", l.mode);
      await settled(page);
      const m = await measure(page);
      const where = `${font} · ${l.name}`;
      expect(m.pages, `${where}: pages`).toBeGreaterThan(2);
      expect(m.under, `${where}: a piece taller than the model believed`).toEqual([]);
      expect(m.overflow, `${where}: overflowing pages`).toEqual([]);
      expect(m.wide, `${where}: sticking out sideways`).toEqual([]);
    }
  }
});

test("the design workspace offers what a coach may change to the author only", async ({ page }) => {
  test.setTimeout(240_000);
  await signedIn(page);
  const builder = await buildSession(page, "Archived look", [["five-spot", "Five-Spot Shooting"]]);
  // archive the session: its design is frozen with the rest of it, but it can still be previewed and printed
  await page.goto(builder);
  await page.getByRole("button", { name: "Session actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page.getByText("Archived", { exact: true }).first()).toBeVisible();
  await openDesign(page, builder);
  await expect(
    page.getByText(/This session is archived, so its design can’t be saved/),
  ).toBeVisible();
  await expect(saveButton(page)).toHaveCount(0);
  await panel(page).getByLabel("Youth", { exact: true }).check({ force: true }); // it can still be tried out
  await expectVar(page, "--d-primary", "#0077b6");
  await expect(toolbar(page).getByRole("button", { name: "Print" })).toBeEnabled();
  await page.goto(SESSIONS);
});

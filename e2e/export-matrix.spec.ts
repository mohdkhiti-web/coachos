import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, newUser, signUpAndVerify } from "./support/helpers";
import { buildSession, choose, panel, pages, section, settled, status } from "./support/document";
import { addCustom, createSession, pickDrill } from "./support/sessions";
import { A4, inspectPdf, leaks, LETTER, type PdfReport } from "./support/pdf";

/**
 * The PDF matrix (Step 6): real PDFs from the real endpoint, taken apart with pdf.js. For every setup the file must
 * have the pages the preview showed, on the paper the design chose, with selectable text, embedded fonts, vector
 * diagrams, the footer's page numbers, its document properties, and none of the app's internal identifiers.
 */

const DRILLS_DIR = path.resolve(__dirname, "../content/basketball/drills");
const libraryTitles = readdirSync(DRILLS_DIR)
  .filter((f) => f.endsWith(".json"))
  .map(
    (f) => (JSON.parse(readFileSync(path.join(DRILLS_DIR, f), "utf8")) as { title: string }).title,
  )
  .sort();

async function signedIn(page: Page) {
  await signUpAndVerify(page, newUser("Matrix"));
  await completeOnboarding(page);
}
const openDesign = async (page: Page, builder: string) => {
  await page.goto(`${builder}/document?view=design`);
  await expect(page.getByRole("heading", { level: 1, name: "Design and preview" })).toBeVisible();
  await settled(page);
};

/** Save (if needed), fetch the PDF from the endpoint, and take it apart. */
async function exportPdf(page: Page, builder: string): Promise<PdfReport> {
  const save = page.getByRole("button", { name: "Save design" });
  if (await save.isEnabled()) {
    await save.click();
    await expect(status(page)).toHaveAttribute("data-state", "saved");
  }
  const res = await page.request.get(`${builder}/document/pdf`, { timeout: 120_000 });
  expect(res.status(), "the PDF endpoint").toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  return inspectPdf(await res.body());
}

const near = (a: number, b: number) => Math.abs(a - b) < 1.5;
type Paper = "a4" | "letter";
function expectPaper(r: PdfReport, paper: Paper, landscape: boolean, why: string) {
  const [w, h] = paper === "a4" ? [A4.w, A4.h] : [LETTER.w, LETTER.h];
  for (const p of r.pages) {
    const ok = landscape
      ? near(p.width, h) && near(p.height, w)
      : near(p.width, w) && near(p.height, h);
    expect(ok, `${why}: page ${p.number} is ${p.width.toFixed(1)}×${p.height.toFixed(1)}pt`).toBe(
      true,
    );
  }
}

/** What every export must satisfy, whatever the design. */
async function expectSound(
  page: Page,
  r: PdfReport,
  o: {
    title: string;
    first: string;
    why: string;
    paper: Paper;
    landscape: boolean;
    system?: boolean;
  },
) {
  const previewPages = await pages(page).count();
  expect(r.pageCount, `${o.why}: page count against the preview`).toBe(previewPages);
  expectPaper(r, o.paper, o.landscape, o.why);
  expect(r.flat, `${o.why}: selectable text holds the title`).toContain(o.title);
  expect(r.flat, `${o.why}: …and the first activity`).toContain(o.first);
  // every page but a cover carries "Page n of N"; the last page says N of N
  const numbers = [...r.text.matchAll(/Page (\d+) of (\d+)/g)].map(
    (m) => [Number(m[1]), Number(m[2])] as const,
  );
  expect(
    numbers.length,
    `${o.why}: the footer numbers the pages (${numbers.length} of ${r.pageCount})`,
  ).toBeGreaterThanOrEqual(r.pageCount - 1);
  const total = numbers[0]![1];
  expect(
    numbers.every(([, t]) => t === total),
    `${o.why}: one total on every page`,
  ).toBe(true);
  expect(Math.max(...numbers.map(([n]) => n)), `${o.why}: the last page is numbered`).toBe(total);
  expect(r.fonts.length, `${o.why}: fonts are embedded`).toBeGreaterThan(0);
  if (!o.system)
    for (const f of r.fonts)
      expect(f, `${o.why}: only the app's own typefaces, never a system stand-in`).toMatch(
        /Inter|Source[s-]?Sans|Merriweather/i,
      );
  expect(
    r.pages.reduce((n, p) => n + p.images, 0),
    `${o.why}: no raster images (diagrams are vectors)`,
  ).toBe(0);
  expect(leaks(r.text), `${o.why}: internal identifiers in the text`).toEqual([]);
  expect(r.title).toBe(o.title);
  expect(r.creator).toBe("CoachOS");
  expect(r.producer).toBe("CoachOS PDF export");
  for (const p of r.pages)
    expect(p.text.trim().length, `${o.why}: page ${p.number} has text`).toBeGreaterThan(20);
}

test("the design matrix: paper, orientation, detail, columns, sections, presets, typefaces", async ({
  page,
}) => {
  test.setTimeout(900_000);
  await signedIn(page);
  const builder = await buildSession(page, "Matrix session");
  await openDesign(page, builder);
  const base = { title: "Matrix session", first: "Five-Spot Shooting" };

  // ---- paper × orientation ---------------------------------------------------------------------------------------
  let r = await exportPdf(page, builder);
  await expectSound(page, r, {
    ...base,
    why: "A4 portrait detailed",
    paper: "a4",
    landscape: false,
  });
  expect(r.pageCount).toBeGreaterThanOrEqual(3);
  expect(
    r.pages.some((p) => p.paths > 20),
    "diagrams are drawn as vector paths",
  ).toBe(true);
  for (const [paper, label] of [
    ["letter", "Letter"],
    ["a4", "A4"],
  ] as const) {
    for (const [landscape, orientation] of [
      [false, "Portrait"],
      [true, "Landscape"],
    ] as const) {
      await choose(page, "Paper", label);
      await choose(page, "Orientation", orientation);
      await settled(page);
      r = await exportPdf(page, builder);
      await expectSound(page, r, { ...base, why: `${label} ${orientation}`, paper, landscape });
    }
  }
  await choose(page, "Paper", "A4");
  await choose(page, "Orientation", "Portrait");

  // ---- detail, columns, spacing, margins ----------------------------------------------------------------------------
  const detailedPages = (await exportPdf(page, builder)).pageCount;
  await choose(page, "Level of detail", "Compact");
  await settled(page);
  r = await exportPdf(page, builder);
  await expectSound(page, r, { ...base, why: "compact", paper: "a4", landscape: false });
  expect(r.pageCount, "compact is shorter than detailed").toBeLessThan(detailedPages);
  expect(r.text.toLowerCase()).not.toContain("common mistakes"); // detailed-only sections stay out of a compact file
  await choose(page, "Level of detail", "Detailed");
  expect((await exportPdf(page, builder)).text.toLowerCase()).toContain("common mistakes");

  await choose(page, "Columns", "2 columns");
  await choose(page, "Margins", "Narrow");
  await choose(page, "Spacing", "Compact");
  await settled(page);
  r = await exportPdf(page, builder);
  await expectSound(page, r, {
    ...base,
    why: "two columns, narrow margins, compact spacing",
    paper: "a4",
    landscape: false,
  });
  await choose(page, "Columns", "1 column");
  await choose(page, "Margins", "Normal");
  await choose(page, "Spacing", "Normal");

  // ---- sections: cover, reflection, coach notes, and switching one off ---------------------------------------------
  await section(page, "Cover page").check();
  await section(page, "Session reflection").check();
  await settled(page);
  r = await exportPdf(page, builder);
  await expectSound(page, r, {
    ...base,
    why: "cover and reflection",
    paper: "a4",
    landscape: false,
  });
  expect(r.text.toLowerCase()).toContain("prepared with coachos");
  expect(r.text.toLowerCase()).toContain("what went well?");
  expect(r.text.toLowerCase()).toContain("next session focus");
  await section(page, "Timeline").uncheck();
  await settled(page);
  r = await exportPdf(page, builder);
  expect(r.text, "a switched-off section is not in the file").not.toMatch(/\bTimeline\b/);
  await expectSound(page, r, { ...base, why: "no timeline", paper: "a4", landscape: false });
  await section(page, "Timeline").check();
  await section(page, "Cover page").uncheck();
  await section(page, "Session reflection").uncheck();

  // ---- the presets --------------------------------------------------------------------------------------------------
  for (const preset of [
    "Modern Basketball",
    "Minimal",
    "Professional",
    "Dark",
    "School",
    "Academy",
    "Youth",
    "Classic Coach",
  ]) {
    await panel(page).getByLabel(preset, { exact: true }).check({ force: true });
    await settled(page);
    r = await exportPdf(page, builder);
    await expectSound(page, r, { ...base, why: `preset ${preset}`, paper: "a4", landscape: false });
  }

  // ---- the font matrix: each typeface really is what the file is set in --------------------------------------------
  const faces: Array<[label: string, expected: RegExp | null]> = [
    ["Inter", /Inter/i],
    ["Source Sans", /Source[\s-]?Sans/i],
    ["Merriweather (serif)", /Merriweather/i],
    ["System default", null],
  ];
  await panel(page).getByText("Type and style").click();
  for (const [label, expected] of faces) {
    await panel(page)
      .getByRole("combobox", { name: /^Typeface/ })
      .selectOption({ label });
    await settled(page);
    r = await exportPdf(page, builder);
    await expectSound(page, r, {
      ...base,
      why: `typeface ${label}`,
      paper: "a4",
      landscape: false,
      system: label === "System default",
    });
    if (expected)
      expect(
        r.fonts.some((f) => expected.test(f)),
        `${label}: embedded fonts were ${r.fonts.join(", ")}`,
      ).toBe(true);
  }
});

test("short, long and oversized content", async ({ page }) => {
  test.setTimeout(600_000);
  await signedIn(page);

  // ---- a short session: one activity, one page -----------------------------------------------------------------------
  const short = await createSession(page, { title: "Short one" });
  await addCustom(page, "Free throws", 10, "Ten each.");
  await openDesign(page, short);
  let r = await exportPdf(page, short);
  await expectSound(page, r, {
    title: "Short one",
    first: "Free throws",
    why: "short",
    paper: "a4",
    landscape: false,
  });
  expect(r.pageCount).toBeLessThanOrEqual(2);

  // ---- long text: a 120-character title, long notes and an activity with a 2000-character note -------------------------
  const longTitle =
    "Transition defence and finishing under pressure with quick decisions in tight spaces — 90 minutes".slice(
      0,
      118,
    );
  const long = await createSession(page, {
    title: longTitle,
    team: "The Riverside Under-16 Boys Development Squad",
  });
  const notes = Array.from(
    { length: 40 },
    (_, i) => `Note ${i + 1}: keep the ball moving, talk early and finish the possession.`,
  )
    .join(" ")
    .slice(0, 1990);
  await addCustom(
    page,
    "An unusually long custom activity title that has to wrap across more than one line on paper",
    15,
    `${notes} END-OF-NOTES`.slice(-2000),
  );
  await openDesign(page, long);
  r = await exportPdf(page, long);
  await expectSound(page, r, {
    title: longTitle,
    first: "An unusually long custom activity title",
    why: "long text",
    paper: "a4",
    landscape: false,
  });
  expect(r.flat, "the end of a very long note is not clipped").toContain("END-OF-NOTES");
});

test("a 25-drill session: every drill, correct pagination, all the way to the last page", async ({
  page,
}) => {
  test.setTimeout(900_000);
  await signedIn(page);
  const builder = await createSession(page, { title: "Everything session", objective: "Shooting" });
  expect(libraryTitles.length).toBeGreaterThanOrEqual(25);
  for (const title of libraryTitles)
    await pickDrill(page, builder, title, title).then(async () => {
      await page.getByRole("button", { name: "Add to session" }).click();
      await expect(page).toHaveURL(/\/sessions\/basketball\/[0-9a-f-]{36}#activity-/);
    });
  await openDesign(page, builder);
  const r = await exportPdf(page, builder);
  await expectSound(page, r, {
    title: "Everything session",
    first: libraryTitles[0]!,
    why: "25 drills",
    paper: "a4",
    landscape: false,
  });
  expect(r.pageCount).toBeGreaterThanOrEqual(25);
  for (const title of libraryTitles)
    expect(r.flat, `drill "${title}" is in the file`).toContain(title);
  expect(r.pages.filter((p) => p.paths > 20).length, "many diagrams").toBeGreaterThanOrEqual(15);

  await choose(page, "Paper", "Letter");
  await choose(page, "Orientation", "Landscape");
  await settled(page);
  const landscape = await exportPdf(page, builder);
  await expectSound(page, landscape, {
    title: "Everything session",
    first: libraryTitles[0]!,
    why: "25 drills, Letter landscape",
    paper: "letter",
    landscape: true,
  });
});

test("a saved template and the session's own changes reach the PDF", async ({ page }) => {
  test.setTimeout(400_000);
  await signedIn(page);
  const source = await createSession(page, { title: "Template source" });
  await openDesign(page, source);
  await choose(page, "Paper", "Letter");
  await choose(page, "Level of detail", "Compact");
  await page
    .getByTestId("template-panel")
    .getByRole("button", { name: "Save as template" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Save as template" });
  await dialog.getByLabel("Template name", { exact: true }).fill("Letter compact");
  await dialog.getByRole("checkbox", { name: /Base this session/ }).uncheck();
  await dialog.getByRole("button", { name: "Save template" }).click();
  await expect(dialog).toBeHidden();

  const builder = await buildSession(page, "Templated export", [
    ["five-spot", "Five-Spot Shooting"],
    ["give-and-go", "Give-and-Go (Pass and Cut)"],
  ]);
  await openDesign(page, builder);
  const plain = await exportPdf(page, builder);
  expectPaper(plain, "a4", false, "before the template");
  await page
    .getByTestId("template-panel")
    .getByRole("button", { name: "Choose a template" })
    .click();
  const apply = page.getByRole("dialog", { name: "Apply a template" });
  await apply.getByRole("button", { name: /^(Yes, apply template|Apply template)$/ }).click();
  await expect(apply).toBeHidden();
  await settled(page);
  const templated = await exportPdf(page, builder);
  await expectSound(page, templated, {
    title: "Templated export",
    first: "Five-Spot Shooting",
    why: "template",
    paper: "letter",
    landscape: false,
  });
  expect(templated.text.toLowerCase()).not.toContain("common mistakes"); // the template's compact mode

  // the session's own change wins over the template
  await choose(page, "Level of detail", "Detailed");
  await choose(page, "Paper", "A4");
  await settled(page);
  const override = await exportPdf(page, builder);
  await expectSound(page, override, {
    title: "Templated export",
    first: "Five-Spot Shooting",
    why: "override",
    paper: "a4",
    landscape: false,
  });
  expect(override.text.toLowerCase()).toContain("common mistakes");
});

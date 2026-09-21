import { expect, type Locator, type Page } from "@playwright/test";
import { addBreak, addCustom, createSession, field, pickDrill } from "./sessions";

/** The design controls (their own panel), found by test id so a hidden streamed copy is never matched. */
export const panel = (page: Page): Locator => page.getByTestId("design-panel");

/** One of the radio groups of the design panel (Paper, Orientation, Margins, Columns, Spacing, Level of detail). */
export async function choose(page: Page, legend: string, option: string) {
  await panel(page)
    .getByRole("group", { name: legend, exact: true })
    .getByLabel(option, { exact: true })
    .check({ force: true }); // the radio itself is visually hidden; its label is the button
}

/** A section toggle, by its label (a locked one also carries the hint "Detailed only" in its name). */
export const section = (page: Page, label: string): Locator =>
  panel(page)
    .locator('[data-group="sections"]')
    .getByRole("checkbox", { name: new RegExp("^" + label + "( Detailed only)?$") });

/** A colour's HEX field. */
export const hex = (page: Page, name: string): Locator =>
  panel(page)
    .getByLabel(name + " colour code", { exact: true })
    .filter({ visible: true }); // React streams a hidden copy ahead of the real one

export const preview = (page: Page): Locator =>
  page.getByRole("region", { name: "Document preview" });
export const pages = (page: Page): Locator => page.locator('[data-testid="document"] .doc-page');
export const toolbar = (page: Page): Locator =>
  page.getByRole("toolbar", { name: "Preview controls" });
export const saveButton = (page: Page): Locator =>
  page.getByRole("button", { name: "Save design" });
export const status = (page: Page): Locator => page.locator('[role="status"][data-state]');

/** Wait for the fonts, then for the document to settle (the model is rebuilt deferred). */
export async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
}

/** A CSS custom property of the document, as the browser resolved it. */
export const docVar = (page: Page, name: string) =>
  page.evaluate(
    (n) =>
      getComputedStyle(document.querySelector('[data-testid="document"]')!)
        .getPropertyValue(n)
        .trim(),
    name,
  );

/** The document's design is rebuilt a moment after a control changes (it is deferred, so typing stays snappy): wait for it. */
export const expectVar = (page: Page, name: string, value: string) =>
  expect.poll(() => docVar(page, name), { message: name + " of the document" }).toBe(value);

/** A session with drills, a break and a coach-written activity, built through the real screens. */
export async function buildSession(
  page: Page,
  title: string,
  drills: Array<[search: string, title: string]> = [
    ["five-spot", "Five-Spot Shooting"],
    ["give-and-go", "Give-and-Go (Pass and Cut)"],
    ["3-on-2", "3-on-2 Fast Break"],
  ],
  extra: Partial<Parameters<typeof createSession>[1]> = {},
): Promise<string> {
  const builder = await createSession(page, {
    title,
    team: "U14 Boys",
    ageGroup: "U14 (13–14)",
    level: "Intermediate",
    players: "14",
    date: "2030-06-11",
    start: "18:30",
    location: "Main gym",
    season: "2030/31",
    sessionNumber: "12",
    objective: "Shooting",
    also: ["Passing", "Transition"],
    ...extra,
  });
  for (const [i, [search, name]] of drills.entries()) {
    await pickDrill(page, builder, search, name);
    await field(page, "Duration (min)").fill("12");
    await page.getByRole("button", { name: "Add to session" }).click();
    await expect(page).toHaveURL(/\/sessions\/basketball\/[0-9a-f-]{36}#activity-/);
    if (i === 0) await addBreak(page, "Water break", 3);
  }
  await addCustom(page, "Free throws to finish", 8, "Pairs shoot ten each, then rotate.");
  return builder;
}

/**
 * Measure the rendered document against the model: every piece's real height (mm, at zoom 1) against the height
 * the paginator believed, and whether any page's body overflows. A piece that is TALLER than estimated is the
 * failure: it is what would clip or overlap on paper.
 */
export async function measure(page: Page) {
  return page.evaluate(() => {
    const zoom = document.querySelector<HTMLElement>(".doc-zoom");
    if (zoom) zoom.style.zoom = "1";
    const px = 96 / 25.4;
    const under: string[] = [];
    let pieces = 0;
    for (const el of document.querySelectorAll<HTMLElement>("[data-est]")) {
      const est = Number(el.dataset.est);
      const actual = el.getBoundingClientRect().height / px;
      pieces += 1;
      if (actual - est > 0.3) {
        under.push(
          (el.dataset.frag ?? el.className.toString().split(" ")[0]) +
            " on page " +
            el.closest<HTMLElement>(".doc-page")?.dataset.page +
            ": estimated " +
            est.toFixed(1) +
            "mm, real " +
            actual.toFixed(1) +
            "mm",
        );
      }
    }
    const overflow: string[] = [];
    for (const body of document.querySelectorAll<HTMLElement>(".doc-body")) {
      const n = body.closest<HTMLElement>(".doc-page")?.dataset.page;
      if (body.scrollHeight > body.clientHeight + 0.5) overflow.push("page " + n);
      for (const col of body.querySelectorAll<HTMLElement>(".doc-col"))
        if (col.scrollHeight > body.clientHeight + 0.5) overflow.push("a column of page " + n);
    }
    // nothing may stick out of its page sideways, except a title that is clipped with an ellipsis on purpose
    const wide: string[] = [];
    for (const pg of document.querySelectorAll<HTMLElement>(".doc-page")) {
      const pr = pg.getBoundingClientRect();
      for (const el of pg.querySelectorAll<HTMLElement>(".doc-body *:not(.doc-act__more)")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > pr.right + 1 || r.left < pr.left - 1)) {
          wide.push(el.tagName.toLowerCase() + " on page " + pg.dataset.page);
          break;
        }
      }
    }
    return { pieces, under, overflow, wide, pages: document.querySelectorAll(".doc-page").length };
  });
}

/** Page count and first page size (points) of a PDF, read from its page objects. Chrome writes them uncompressed. */
export function pdfInfo(buffer: Buffer) {
  const text = buffer.toString("latin1");
  const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const box = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
  return { pages, width: box ? Number(box[3]) : 0, height: box ? Number(box[4]) : 0 };
}

export const MM_TO_PT = 72 / 25.4;

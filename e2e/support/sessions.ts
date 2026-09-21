import { expect, type Locator, type Page } from "@playwright/test";

/** The basketball sessions area. */
export const SESSIONS = "/sessions/basketball";

/** A card of the timeline, found by the activity's title (the card is an article named by its heading). */
export const card = (page: Page, title: string): Locator =>
  page.getByRole("article", { name: title, exact: true });

/** A control by its exact label. Ignores the hidden copy React streams in ahead of the real one. */
export const field = (root: Page | Locator, label: string): Locator =>
  root.getByLabel(label, { exact: true }).filter({ visible: true });

/** The session totals bar (found by role, so a hidden streamed copy is never matched). */
export const totals = (page: Page) => page.getByRole("region", { name: "Session totals" });

/** The timeline's titles, top to bottom. */
export const timelineTitles = (page: Page) =>
  page.getByRole("list", { name: "Session timeline, in order" }).getByRole("heading", { level: 3 });

export type SessionFill = {
  title: string;
  team?: string;
  ageGroup?: string; // the option's label, e.g. "U14 (13–14)"
  level?: string;
  players?: string;
  date?: string;
  start?: string;
  location?: string;
  season?: string;
  sessionNumber?: string;
  objective?: string; // the main objective's name
  also?: string[]; // secondary objectives
  notes?: string; // the coach's private notes
};

/** Fill the "Create session" form (everything is optional but the title and the main objective). */
export async function fillSession(page: Page, s: SessionFill) {
  await field(page, "Session title").fill(s.title);
  if (s.team) await field(page, "Team").fill(s.team);
  if (s.ageGroup) await field(page, "Age group").selectOption({ label: s.ageGroup });
  if (s.level) await field(page, "Level").selectOption({ label: s.level });
  if (s.players) await field(page, "Number of players").fill(s.players);
  if (s.date) await field(page, "Date").fill(s.date);
  if (s.start) await field(page, "Start time").fill(s.start);
  if (s.location) await field(page, "Location / court").fill(s.location);
  if (s.season) await field(page, "Season").fill(s.season);
  if (s.sessionNumber) await field(page, "Session number").fill(s.sessionNumber);
  if (s.notes) await field(page, "Coach notes").fill(s.notes);
  await field(page, "Main objective").selectOption({ label: s.objective ?? "Shooting" });
  for (const name of s.also ?? []) await page.getByRole("button", { name, exact: true }).click();
}

/** Create a session through the real form and land in its builder. Returns the builder's path. */
export async function createSession(page: Page, s: SessionFill): Promise<string> {
  await page.goto(`${SESSIONS}/new`);
  await fillSession(page, s);
  await page.getByRole("button", { name: "Create session and start building" }).click();
  await expect(page).toHaveURL(/\/sessions\/basketball\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: s.title })).toBeVisible();
  return new URL(page.url()).pathname;
}

/** Add a break through its dialog and wait for it to appear. */
export async function addBreak(page: Page, title: string, minutes: number) {
  await page.getByRole("button", { name: "Break", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Break title").fill(title);
  await dialog.getByLabel("Duration (min)").fill(String(minutes));
  await dialog.getByRole("button", { name: "Add to session" }).click();
  await expect(card(page, title)).toBeVisible();
}

/** Add a custom activity through its dialog and wait for it to appear. */
export async function addCustom(page: Page, title: string, minutes: number, notes = "") {
  await page.getByRole("button", { name: "Custom activity", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Activity title").fill(title);
  await dialog.getByLabel("Duration (min)").fill(String(minutes));
  if (notes) await dialog.getByLabel("Notes").fill(notes);
  await dialog.getByRole("button", { name: "Add to session" }).click();
  await expect(card(page, title)).toBeVisible();
}

/** Search the picker for a drill title and open its add page (the picker is the library's own search). */
export async function pickDrill(page: Page, builderPath: string, search: string, title: string) {
  await page.goto(`${builderPath}/drills`);
  // on a phone the filters fold away behind a "Filters" button
  const toggle = page.getByRole("button", { name: /^Filters/ });
  const filters = page.getByRole("search", { name: "Filters" });
  await expect(toggle.or(filters).first()).toBeVisible(); // either is there once the page has rendered
  if (await toggle.isVisible()) await toggle.click();
  await filters.getByLabel("Search").fill(search);
  await expect(page).toHaveURL(/q=/);
  await page.getByRole("link", { name: `Add to session: ${title}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

import { expect, type Locator, type Page } from "@playwright/test";
import { field } from "./sessions";

export const TEMPLATES = "/templates/basketball";

/** A template's card on the Templates page (an article named by its heading). */
export const templateCard = (page: Page, name: string): Locator =>
  page.getByRole("article", { name, exact: true });

/** The saved-template controls on a session's design screen. */
export const templatePanel = (page: Page): Locator => page.getByTestId("template-panel");

/** A card's "More actions" menu, opened, with its items ready to pick. */
export async function openCardMenu(page: Page, name: string) {
  await templateCard(page, name)
    .getByRole("button", { name: `More actions for ${name}` })
    .click();
}

/** Pick an item of the open menu. */
export const menuItem = (page: Page, name: string) => page.getByRole("menuitem", { name });

/**
 * From a session's design screen, save the current design as a template through the real dialog. Returns once the
 * dialog has closed and the session says it is based on the new template.
 */
export async function saveAsTemplate(
  page: Page,
  t: { name: string; description?: string; category?: string; linkSession?: boolean },
) {
  await templatePanel(page).getByRole("button", { name: "Save as template" }).click();
  const dialog = page.getByRole("dialog", { name: "Save as template" });
  await expect(dialog).toBeVisible();
  await field(dialog, "Template name").fill(t.name);
  if (t.description) await field(dialog, "Description (optional)").fill(t.description);
  if (t.category) await field(dialog, "Category").selectOption({ label: t.category });
  const link = dialog.getByRole("checkbox", { name: /Base this session on the new template/ });
  if (t.linkSession === false) await link.uncheck();
  await dialog.getByRole("button", { name: "Save template" }).click();
  await expect(dialog).toBeHidden();
}

/** A template id, from the address of its editor. */
export const templateIdOf = (page: Page) => {
  const m = /\/templates\/basketball\/([0-9a-f-]{36})/.exec(page.url());
  if (!m) throw new Error(`not on a template page: ${page.url()}`);
  return m[1]!;
};

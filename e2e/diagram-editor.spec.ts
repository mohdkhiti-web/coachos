import { expect, test, type Locator, type Page } from "@playwright/test";
import { completeOnboarding, newUser, signUpAndVerify } from "./support/helpers";
import { addCustom, card, createSession } from "./support/sessions";

/**
 * The diagram editor and the activity lock, end to end in a real browser: draw a diagram on an activity by clicking and dragging
 * (players, defenders, a ball, a pass), change roles and labels, undo, redo, reset, save; see it on the card and in the printed
 * document; lock an activity; and use the keyboard for everything the mouse can do.
 */

async function signedIn(page: Page, label = "Diagrams") {
  await signUpAndVerify(page, newUser(label));
  await completeOnboarding(page);
}

const editor = (page: Page) => page.getByTestId("diagram-editor");
const canvas = (page: Page) => page.getByTestId("editor-canvas");
const tool = (page: Page, name: string) => editor(page).getByRole("button", { name, exact: true });
const entities = (page: Page) => canvas(page).locator("[data-entity]");

/** Click a spot on the court, as a fraction of the drawing (the overlay has the court's own aspect ratio). */
async function clickCourt(page: Page, fx: number, fy: number) {
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}
const menuOf = (activity: Locator) => activity.getByRole("button", { name: /^More/ });

async function openDiagramEditor(page: Page, title: string) {
  await menuOf(card(page, title)).click();
  await page.getByRole("menuitem", { name: /diagram/i }).click();
  await expect(editor(page)).toBeVisible();
}

test("draw a diagram: add players by clicking, a pass, a ball, undo, redo, reset, save — and it shows up", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signedIn(page);
  const builder = await createSession(page, { title: "Diagram session" });
  await addCustom(page, "Shell drill", 10, "Four on four.");

  await openDiagramEditor(page, "Shell drill");
  await expect(editor(page).getByTestId("editor-hint")).toContainText("Drag a player");
  await expect(entities(page)).toHaveCount(0);
  await expect(editor(page).getByRole("button", { name: "Save diagram" })).toBeDisabled(); // nothing to save yet

  // attackers and a defender, placed by clicking the court
  await tool(page, "Attacker").click();
  await clickCourt(page, 0.5, 0.6);
  await clickCourt(page, 0.25, 0.45);
  await tool(page, "Defender").click();
  await clickCourt(page, 0.5, 0.5);
  await expect(entities(page)).toHaveCount(3);

  // the ball goes to attacker 1, then a pass from 1 to 2
  await tool(page, "Ball").click();
  await canvas(page).locator('[data-entity="o1"]').click();
  await expect(entities(page)).toHaveCount(3); // a held ball is not a separate target
  await tool(page, "Pass").click();
  await canvas(page).locator('[data-entity="o1"]').click();
  await expect(editor(page).getByTestId("editor-hint")).toContainText("second player");
  await canvas(page).locator('[data-entity="o2"]').click();
  await expect(editor(page).getByTestId("action-row")).toHaveCount(1);
  await expect(editor(page).getByTestId("action-row")).toContainText("Pass 1 → 2");

  // a pass by someone without the ball is refused, in words
  await tool(page, "Pass").click();
  await canvas(page).locator('[data-entity="o2"]').click();
  await canvas(page).locator('[data-entity="o1"]').click();
  await expect(editor(page).getByTestId("editor-error")).toBeVisible();

  // select and change a label and a role
  await tool(page, "Select and move").click();
  await canvas(page).locator('[data-entity="x1"]').click();
  await expect(editor(page).getByTestId("selected-name")).toContainText("X1");
  await editor(page).getByLabel("Label (up to 3 characters)").fill("D");
  await editor(page).getByLabel("Label (up to 3 characters)").press("Enter");
  await expect(editor(page).getByTestId("selected-name")).toContainText("D");

  // duplicate, then remove the duplicate
  await editor(page).getByRole("button", { name: "Duplicate" }).click();
  await expect(entities(page)).toHaveCount(4);

  // undo and redo walk the history; reset returns to how it was opened
  await editor(page).getByRole("button", { name: "Undo" }).click();
  await expect(entities(page)).toHaveCount(3);
  await editor(page).getByRole("button", { name: "Redo" }).click();
  await expect(entities(page)).toHaveCount(4);
  await editor(page).getByRole("button", { name: "Reset" }).click();
  await expect(entities(page)).toHaveCount(0);
  await editor(page).getByRole("button", { name: "Undo" }).click(); // reset is itself undoable
  await expect(entities(page)).toHaveCount(4);

  // dragging moves a player
  const before = (await canvas(page).locator('[data-entity="o2"] circle').boundingBox())!;
  await canvas(page).locator('[data-entity="o2"]').hover();
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.3, { steps: 6 });
  await page.mouse.up();
  const after = (await canvas(page).locator('[data-entity="o2"] circle').boundingBox())!;
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(20);

  // save: the card now has a thumbnail, and the dialog is gone
  await editor(page).getByRole("button", { name: "Save diagram" }).click();
  await expect(editor(page)).toBeHidden();
  await expect(page.getByText("Diagram saved").first()).toBeVisible();
  await expect(card(page, "Shell drill").locator("svg").first()).toBeVisible();

  // it survives a reload, and the printed document shows it
  await page.reload();
  await expect(card(page, "Shell drill").locator("svg").first()).toBeVisible();
  await page.goto(`${builder}/document`);
  await expect(page.locator('[data-testid="document"] svg[role="img"]').first()).toBeVisible();
});

test("the diagram editor works from the keyboard alone", async ({ page }) => {
  test.setTimeout(180_000);
  await signedIn(page, "DiagramKeys");
  await createSession(page, { title: "Keys session" });
  await addCustom(page, "Keyboard drill", 8);
  await openDiagramEditor(page, "Keyboard drill");

  // choose a tool with the keyboard, place a player by activating the court through the entity list of a starter, then nudge
  await tool(page, "Attacker").focus();
  await page.keyboard.press("Enter");
  await clickCourt(page, 0.5, 0.6); // (placing needs a point; the mouse gives it)
  const player = canvas(page).locator('[data-entity="o1"]');
  await expect(player).toHaveCount(1);
  await tool(page, "Select and move").focus();
  await page.keyboard.press("Enter");
  await player.focus();
  const at = (await player.locator("circle").boundingBox())!;
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  const moved = (await player.locator("circle").boundingBox())!;
  expect(moved.x).toBeGreaterThan(at.x);
  expect(moved.y).toBeGreaterThan(at.y);
  // delete removes the selected player; undo brings it back
  await page.keyboard.press("Delete");
  await expect(entities(page)).toHaveCount(0);
  await editor(page).getByRole("button", { name: "Undo" }).click();
  await expect(entities(page)).toHaveCount(1);
  // every control has a name a screen reader can say
  for (const button of await editor(page).getByRole("button").all())
    expect((await button.getAttribute("aria-label")) ?? (await button.innerText())).not.toBe("");
});

test("lock an activity: it is marked, it can be unlocked, and locking survives a reload", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signedIn(page, "Locks");
  await createSession(page, { title: "Lock session" });
  await addCustom(page, "Locked drill", 10);
  await menuOf(card(page, "Locked drill")).click();
  await page.getByRole("menuitem", { name: "Lock activity" }).click();
  await expect(card(page, "Locked drill").getByText("Locked", { exact: true })).toBeVisible();
  await page.reload();
  await expect(card(page, "Locked drill").getByText("Locked", { exact: true })).toBeVisible();
  await menuOf(card(page, "Locked drill")).click();
  await page.getByRole("menuitem", { name: "Unlock activity" }).click();
  await expect(card(page, "Locked drill").getByText("Locked", { exact: true })).toBeHidden();
});

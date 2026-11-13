import { expect, test } from "@playwright/test";
import { completeOnboarding, newUser, signUpAndVerify } from "./support/helpers";

/**
 * The drill page plays its diagram: the drill's own movement data drives players and ball (arc, bounce, trail),
 * step by step, with play/pause, step, scrub, speed and a tilted "broadcast" camera. At rest it is the full diagram.
 */
test("a library drill's diagram plays, steps, scrubs and tilts into broadcast view", async ({
  page,
}, testInfo) => {
  await signUpAndVerify(page, newUser("Player"));
  await completeOnboarding(page);
  await page.goto("/sports/basketball/drills");
  await page
    .getByRole("search", { name: "Filters" })
    .getByLabel("Search")
    .fill("Ball Screen 2-on-2");
  await expect(page).toHaveURL(/q=Ball/);
  await page.getByRole("link", { name: "Ball Screen 2-on-2", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Ball Screen 2-on-2" })).toBeVisible();

  const controls = page.getByRole("group", { name: "Playback" });
  await expect(controls).toBeVisible();
  const scrub = controls.getByRole("slider", { name: "Playback position" });

  // it played by itself on arrival; pause it, then go phase by phase
  await controls
    .getByRole("button", { name: /Pause|Play again|Play the drill/ })
    .first()
    .click();
  await controls.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByText(/^Step 1 of \d+/)).toBeVisible();
  await controls.getByRole("button", { name: "Pause" }).click();
  await controls.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByText(/^Step 2 of \d+/)).toBeVisible();

  // scrubbing moves the clock: the slider value follows
  const max = Number(await scrub.getAttribute("max"));
  await scrub.fill((max / 2).toFixed(2));
  expect(Number(await scrub.inputValue())).toBeCloseTo(max / 2, 1);

  // mid-flight frames really move things: two different moments draw different pictures
  const svg = page.getByRole("region", { name: "Diagrams" }).locator("svg").first();
  await scrub.fill("0.6");
  const a = await svg.innerHTML();
  await scrub.fill((max * 0.8).toFixed(2));
  const b = await svg.innerHTML();
  expect(a).not.toEqual(b);

  // speed cycles, broadcast tilts, "Whole drill" returns to the static diagram
  await controls.getByRole("button", { name: /Playback speed 1×/ }).click();
  await expect(controls.getByRole("button", { name: /Playback speed 1\.5×/ })).toBeVisible();
  const broadcast = controls.getByRole("button", { name: "Broadcast" });
  await broadcast.click();
  await expect(broadcast).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(800); // let the camera settle for the screenshot
  await page.screenshot({ path: testInfo.outputPath("broadcast.png") });
  await controls.getByRole("button", { name: "Whole drill" }).click();
  await expect(page.getByText(/^Step \d+ of \d+/)).toHaveCount(0);
});

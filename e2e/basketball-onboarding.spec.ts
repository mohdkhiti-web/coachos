import { expect, test } from "@playwright/test";
import {
  answerOnboarding,
  completeOnboarding,
  newUser,
  signIn,
  signOut,
  signUpAndVerify,
  toast,
  waitForMail,
} from "./support/helpers";
import { field } from "./support/sessions";

/**
 * The basketball product experience end to end, against a real production build and real Postgres: the landing page, the
 * account, the six-question onboarding, the saved coaching profile, and everything personalised from it.
 */

test("new coach: landing → sign up → six questions → ready → a personalised dashboard, all persisted", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const user = newUser("Dana");
  const first = user.name.split(" ")[0]!;

  await test.step("the landing page is a basketball product, and Start Coaching goes to sign-up", async () => {
    await page.goto("/");
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toContainText("CoachOS");
    await expect(h1).toContainText("The Operating System for Basketball Coaches");
    for (const other of ["Football", "Soccer", "Volleyball", "Swimming", "Handball", "Cricket"])
      await expect(page.getByText(other, { exact: false })).toHaveCount(0);
    await page.getByRole("link", { name: "Start Coaching" }).first().click();
    await expect(page).toHaveURL(/\/sign-up/);
  });

  await test.step("register and verify (the ordinary email flow still works)", async () => {
    await page.getByLabel("Full name").fill(user.name);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/verify-email/);
    const mail = await waitForMail(user.email, /Verify your CoachOS email/);
    await page.goto(mail.text.match(/https?:\/\/[^\s]+/)![0]);
    await expect(page).toHaveURL(/\/onboarding/);
  });

  await test.step("onboarding: six questions, progress 01 / 06, an exact squad size", async () => {
    await expect(page.getByText("01 / 06")).toBeVisible();
    await answerOnboarding(page, { players: "13" });
    await expect(page.getByText("06 / 06")).toBeVisible();
  });

  await test.step("finish saves and shows the coach's own profile", async () => {
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByRole("heading", { name: "Your CoachOS is ready." })).toBeVisible();
    const chips = page.getByTestId("ready-profile");
    for (const chip of ["Basketball", "U14", "13 players", "Developing Coach"])
      await expect(chips).toContainText(chip);
    await expect(page.getByText("Shooting • Ball Handling • Defense")).toBeVisible();
    await page.getByRole("button", { name: "Enter CoachOS" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  await test.step("the dashboard is the Command Center, personalised from what they answered", async () => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      new RegExp(`Good (morning|afternoon|evening), Coach ${first}`),
    );
    await expect(page.getByText("Ready to build today's practice?")).toBeVisible();
    // real, working shortcuts only
    for (const name of [
      "Build a Session",
      "Generate a Session",
      "Explore Drills",
      "Session Templates",
    ])
      await expect(page.getByRole("link", { name })).toBeVisible();
    // the squad size they gave, and honest empty states for what does not exist yet
    await expect(page.getByText("Squad size").locator("..")).toContainText("13");
    await expect(page.getByText("No practice planned yet.")).toBeVisible();
    // recommendations: real library drills, labelled with the priority they were chosen for
    const rec = page.getByRole("region", { name: "Recommended for you" });
    await expect(rec).toContainText(
      "Based on your coaching profile: U14, Shooting, Ball Handling, Defense",
    );
    await expect(rec.getByText("For Shooting").first()).toBeVisible();
    await expect(rec.getByText("For Ball Handling").first()).toBeVisible();
    await expect(rec.getByRole("link").first()).toBeVisible();
    // the profile is finished, so the prompt is not shown
    await expect(page.getByText("Complete your coaching profile")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Your coaching profile" })).toContainText(
      "13 players",
    );
  });

  await test.step("it is stored, not remembered by the browser: Settings shows it after a fresh load", async () => {
    await page.goto("/settings/coaching-profile");
    await expect(page.getByRole("radio", { name: "Developing Coach" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "U14", exact: true })).toBeChecked();
    await expect(page.getByLabel("Exact number of players")).toHaveValue("13");
    for (const p of ["Shooting", "Ball Handling", "Defense"])
      await expect(page.getByRole("checkbox", { name: p, exact: true })).toBeChecked();
  });

  await test.step("a new session starts from the squad size, age group and first priority", async () => {
    await page.goto("/sessions/basketball/new");
    await expect(field(page, "Players")).toHaveValue("13");
    await expect(field(page, "Age group")).toHaveValue("u14");
    await expect(field(page, "Main objective")).toHaveValue("shooting");
  });

  await test.step("the coach can leave and come back: sign in lands on the dashboard, not onboarding", async () => {
    await signOut(page);
    await signIn(page, user);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("region", { name: "Your coaching profile" })).toBeVisible();
  });
});

test("skipping onboarding is allowed, keeps the coach in, and the profile stays on offer until it is done", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUpAndVerify(page, newUser("Sam"));
  await completeOnboarding(page); // Skip for now

  await test.step("a minimal profile: no fake personalisation, and a persistent prompt", async () => {
    await expect(page.getByText("Complete your coaching profile")).toBeVisible();
    await expect(page.getByText("Tell CoachOS how you coach")).toBeVisible();
    await expect(page.getByRole("region", { name: "Recommended for you" })).not.toContainText(
      "For Shooting",
    );
    // a new session form has no guessed defaults
    await page.goto("/sessions/basketball/new");
    await expect(field(page, "Players")).toHaveValue("");
    await expect(field(page, "Age group")).toHaveValue("");
    await page.goto("/dashboard");
  });

  await test.step("finishing it later from the prompt personalises everything", async () => {
    await page.getByRole("link", { name: "Finish my profile" }).click();
    await expect(page).toHaveURL(/\/settings\/coaching-profile/);
    const save = page.getByRole("button", { name: "Save coaching profile" });
    await expect(save).toBeDisabled(); // nothing answered yet
    await page.getByRole("radio", { name: "Experienced Coach" }).click();
    await page.getByRole("checkbox", { name: "U12", exact: true }).click();
    await page.getByRole("radio", { name: "8–10" }).click();
    await page.getByRole("checkbox", { name: "Passing", exact: true }).click();
    await page.getByRole("checkbox", { name: "Drill Discovery" }).click();
    await page.getByRole("checkbox", { name: "Balanced", exact: true }).click();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(toast(page, "Coaching profile saved.")).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByText("Complete your coaching profile")).toHaveCount(0);
    const rec = page.getByRole("region", { name: "Recommended for you" });
    await expect(rec).toContainText("Based on your coaching profile: U12, Passing");
    await expect(rec.getByText("For Passing").first()).toBeVisible();
  });
});

test("the questions guide the coach: nothing to continue with until answered, all-of-the-above stands alone, Back keeps answers", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUpAndVerify(page, newUser("Val"));
  const next = page.getByRole("button", { name: "Continue" });

  await expect(next).toBeDisabled();
  await page.getByRole("radio", { name: "New Coach" }).click();
  await expect(page.getByRole("radio", { name: "New Coach" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await next.click();

  await expect(next).toBeDisabled(); // age groups: choose at least one
  await page.getByRole("checkbox", { name: "U8", exact: true }).click();
  await page.getByRole("checkbox", { name: "U10", exact: true }).click(); // several age groups are allowed
  await next.click();

  await page.getByRole("radio", { name: "5–7" }).click();
  await expect(next).toBeEnabled();
  await page.getByLabel("Exact number of players").fill("99"); // out of range
  await expect(page.getByText("Enter a number within the allowed range.")).toBeVisible();
  await expect(next).toBeDisabled();
  await page.getByLabel("Exact number of players").fill("7");
  await expect(next).toBeEnabled();
  await next.click();

  await page.getByRole("checkbox", { name: "Rebounding", exact: true }).click();
  await next.click();

  await page.getByRole("checkbox", { name: "Practice Planning" }).click();
  await page.getByRole("checkbox", { name: "AI Coaching" }).click();
  await page.getByRole("checkbox", { name: "All of the above" }).click();
  await expect(page.getByRole("checkbox", { name: "All of the above" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("checkbox", { name: "Practice Planning" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await page.getByRole("checkbox", { name: "AI Coaching" }).click(); // choosing a specific one clears "all"
  await expect(page.getByRole("checkbox", { name: "All of the above" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  // features that do not exist yet say so
  await expect(page.getByRole("checkbox", { name: /Attendance/ })).toContainText("Coming soon");

  await page.getByRole("button", { name: "Back" }).click(); // Back keeps what was chosen
  await expect(page.getByRole("checkbox", { name: "Rebounding", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

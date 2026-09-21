import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  linkIn,
  newUser,
  signIn,
  signOut,
  signUpAndVerify,
  toast,
  waitForMail,
} from "./support/helpers";

/**
 * The Phase 1 exit criterion (ARCHITECTURE.md §23): register → verify → onboard → dashboard →
 * logout → login → reset → delete works end to end — here against a real production build,
 * real Postgres, and real emails captured from the file transport.
 */
test("full account lifecycle", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const user = newUser("Alex");
  const firstName = user.name.split(" ")[0]!;

  await test.step("register, verify by email, land on onboarding", async () => {
    await signUpAndVerify(page, user);
    await expect(page.getByRole("heading", { name: "Let's set up your workspace" })).toBeVisible();
    // the name is prefilled from sign-up
    await expect(page.getByLabel("Your name")).toHaveValue(user.name);
  });

  await test.step("onboarding validates, then saves and opens the dashboard", async () => {
    await page.getByRole("button", { name: "Go to my dashboard" }).click(); // no profession chosen
    await expect(page.getByText("This field is required.").first()).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding/);
    await completeOnboarding(page, { profession: "Coach", timezone: "Europe/Paris" });
  });

  await test.step("dashboard shows real, derived state", async () => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      new RegExp(`Good (morning|afternoon|evening), ${firstName}`),
    );
    await expect(page.getByText("2 of 3 done")).toBeAttached(); // email verified + profile complete; preferences open
    await expect(page.getByRole("link", { name: "Open preferences" })).toBeVisible();
    await expect(page.getByText("Personal workspace")).toBeVisible();
    await expect(page.getByText("Owner", { exact: true })).toBeVisible();
    // recent activity is read from the audit trail
    const activity = page.locator("section", {
      has: page.getByRole("heading", { name: "Recent activity" }),
    });
    await expect(activity.getByText("Account created")).toBeVisible();
    await expect(activity.getByText("Email verified")).toBeVisible();
    await expect(activity.getByText("Profile set up")).toBeVisible();
  });

  await test.step("navigation only offers modules that exist", async () => {
    const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
    // Sessions (the session builder), Templates (saved designs) and Sports (with each real sport workspace nested under it). Nothing for features that don't exist yet.
    await expect(nav.getByRole("link")).toHaveText([
      "Dashboard",
      "Sessions",
      "Templates",
      "Sports",
      "Basketball",
      "Settings",
    ]);
  });

  await test.step("profile: invalid input is rejected, valid input persists across reload", async () => {
    await page.goto("/settings/profile");
    await page.getByLabel("Your name").fill("   ");
    await page.getByRole("button", { name: "Save changes" }).first().click();
    await expect(page.getByText("This field is required.")).toBeVisible();

    await page.getByLabel("Your name").fill("Alex Renamed");
    await page.getByText("Both", { exact: true }).click();
    await page.getByRole("button", { name: "Save changes" }).first().click();
    await expect(toast(page, "Changes saved.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Your name")).toHaveValue("Alex Renamed");
    await expect(page.getByRole("radio", { name: /Both/ })).toBeChecked();
    // the shell (a layout) refreshed too
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Alex Renamed");
  });

  await test.step("workspace rename (owner is allowed by can())", async () => {
    await page.getByLabel("Workspace name").fill("Riverside Basketball");
    await page.getByRole("button", { name: "Save changes" }).nth(1).click();
    await expect(toast(page, "Changes saved.")).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByText("Riverside Basketball").first()).toBeVisible();
  });

  await test.step("preferences: reviewing them completes the checklist", async () => {
    await page.goto("/settings/preferences");
    await page.getByLabel("Units").selectOption("imperial");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(toast(page, "Changes saved.")).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "You're all set" })).toBeVisible();
    await expect(page.getByText("3 of 3 done")).toBeAttached();
  });

  await test.step("theme choice persists server-side (no flash on reload)", async () => {
    await page.goto("/settings/preferences");
    await page.getByText("Dark", { exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark"); // set by the server from the cookie
    await page.getByText("System", { exact: true }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  });

  await test.step("sessions: a second device can be revoked, and dies immediately", async () => {
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signIn(otherPage, user);
    await expect(otherPage).toHaveURL(/\/dashboard/);

    await page.goto("/settings/security");
    await expect(page.getByText("This device")).toBeVisible();
    const revoke = page.getByRole("button", { name: /^Revoke/ });
    await expect(revoke).toHaveCount(1);
    await revoke.click();
    await expect(toast(page, "Session revoked.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Revoke/ })).toHaveCount(0);

    // no cookie cache: the revoked device is signed out on its very next request
    await otherPage.goto("/dashboard");
    await expect(otherPage).toHaveURL(/\/sign-in/);
    await other.close();
  });

  const newPassword = "Another-Long-Passphrase-42";

  await test.step("change password: wrong current password is refused, valid change emails a notice", async () => {
    await page.goto("/settings/security");
    await page.getByLabel("Current password").fill("definitely-not-my-password");
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password").fill(newPassword);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("That password isn't correct.", { exact: true })).toBeVisible();

    await page.getByLabel("Current password").fill(user.password);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(toast(page, "Password changed.")).toBeVisible();
    await waitForMail(user.email, /password was changed/i);
    await expect(page.getByText("Password changed").first()).toBeVisible();
  });

  await test.step("sign out, then the old password no longer works but the new one does", async () => {
    await signOut(page);
    await signIn(page, { email: user.email, password: user.password });
    await expect(page.getByText("That email and password don't match.")).toBeVisible();
    await signIn(page, { email: user.email, password: newPassword });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  const resetPassword = "Reset-To-Something-New-77";

  await test.step("forgot password: reset link works once and signs the user in with the new password", async () => {
    await signOut(page);
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.getByLabel("Email").fill(user.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

    const mail = await waitForMail(user.email, /Reset your CoachOS password/);
    const link = linkIn(mail);
    await page.goto(link);
    await expect(page).toHaveURL(/\/reset-password\?token=/);
    await page.getByLabel("New password", { exact: true }).fill(resetPassword);
    await page.getByLabel("Confirm new password").fill(resetPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page).toHaveURL(/\/sign-in\?notice=reset/);
    await expect(page.getByText("Password updated.")).toBeVisible();

    // the link is single use
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "This reset link is invalid" })).toBeVisible();

    await signIn(page, { email: user.email, password: resetPassword });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  await test.step("change email requires approval from the current address", async () => {
    await page.goto("/settings/security");
    await page.getByLabel("New email").fill(`new-${user.email}`);
    await page.getByRole("button", { name: "Change email" }).click();
    await expect(page.getByText("Check your current inbox to approve the change.")).toBeVisible();
    await waitForMail(user.email, /Approve your CoachOS email change/);
  });

  await test.step("delete account: needs password + typed confirmation, then everything is gone", async () => {
    await page.goto("/settings/danger-zone");
    await page.getByRole("button", { name: "Delete my account" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Your password").fill(resetPassword);
    await dialog.getByLabel("Type DELETE to confirm").fill("delete");
    await dialog.getByRole("button", { name: "Delete permanently" }).click();
    await expect(dialog.getByText("Type DELETE to confirm.", { exact: true })).toBeVisible(); // not deleted yet
    await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
    await dialog.getByLabel("Your password").fill("wrong-password-entirely");
    await dialog.getByRole("button", { name: "Delete permanently" }).click();
    await expect(dialog.getByText("That password isn't correct.", { exact: true })).toBeVisible();

    await dialog.getByLabel("Your password").fill(resetPassword);
    await dialog.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page).toHaveURL(/\/sign-in\?notice=deleted/);
    await expect(page.getByText("Your account and workspace have been deleted.")).toBeVisible();

    await signIn(page, { email: user.email, password: resetPassword });
    await expect(page.getByText("That email and password don't match.")).toBeVisible();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
